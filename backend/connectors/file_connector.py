# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Connector for file-based data sources using DuckDB."""
import logging
import duckdb
import os
import re
from typing import List, Dict, Any, Tuple, Optional
from dataclasses import dataclass

import pyarrow as pa

from backend.models.data_source import Database, Table, Column, ForeignKeyRelationship
from backend.dialects import SqlDialect, DuckDbDialect
from .base import BaseConnector
from .file_handlers import (
    BaseFileHandler, FILE_HANDLER_REGISTRY, build_csv_handler_config,
    JsonFileHandler, ParquetFileHandler,
)
from .fk_detection import detect_foreign_keys_by_naming_convention
from backend.exceptions import DataSourceConnectionError, InvalidInputError, QueryExecutionError
from backend.utils.type_conversion import process_query_result_data

logger = logging.getLogger(__name__)

_duckdb_dialect = DuckDbDialect()


# ---------------------------------------------------------------------------
# JSON nested-type helpers
# ---------------------------------------------------------------------------

def _is_list_type(col_type: str) -> bool:
    """True for DuckDB array/list types: T[], T[N], LIST(T)."""
    s = col_type.strip()
    return bool(re.match(r'.+\[\d*\]$', s)) or s.upper().startswith('LIST(')


def _is_struct_type(col_type: str) -> bool:
    """True when the outermost DuckDB type is STRUCT(...)."""
    return col_type.strip().upper().startswith('STRUCT(')


def _unwrap_list_element(col_type: str) -> str:
    """Return the element type of a LIST column."""
    s = col_type.strip()
    m = re.match(r'^(.+)\[\d*\]$', s)
    if m:
        return m.group(1).strip()
    if s.upper().startswith('LIST(') and s.endswith(')'):
        return s[5:-1].strip()
    return s


def _parse_struct_field_names(type_str: str) -> List[str]:
    """
    Extract field names from a STRUCT type string.

    Handles:
    - Quoted identifiers with spaces/parens: "tickTime (ps per tick)" BIGINT
    - Reserved-keyword quoting:             "action" VARCHAR
    - Nested struct/array types:            items STRUCT(a INT, b INT)[]
    """
    s = type_str.strip()
    if not s.upper().startswith('STRUCT(') or not s.endswith(')'):
        return []
    inner = s[7:-1]  # strip STRUCT( and trailing )
    fields: List[str] = []
    i = 0
    n = len(inner)

    while i < n:
        # Skip leading whitespace between fields
        while i < n and inner[i] in (' ', '\t'):
            i += 1
        if i >= n:
            break

        # --- Parse the field name ---
        if inner[i] == '"':
            # Quoted identifier: read until the matching closing "
            # DuckDB escapes a literal " inside as ""
            i += 1
            name_chars: List[str] = []
            while i < n:
                if inner[i] == '"':
                    if i + 1 < n and inner[i + 1] == '"':  # escaped ""
                        name_chars.append('"')
                        i += 2
                    else:
                        i += 1  # skip closing quote
                        break
                else:
                    name_chars.append(inner[i])
                    i += 1
            fields.append(''.join(name_chars))
        else:
            # Unquoted identifier: read until whitespace or comma
            j = i
            while j < n and inner[j] not in (' ', '\t', ','):
                j += 1
            fields.append(inner[i:j])
            i = j

        # --- Skip the type token until the next top-level comma ---
        depth = 0
        in_quotes = False
        while i < n:
            ch = inner[i]
            if in_quotes:
                if ch == '"':
                    if i + 1 < n and inner[i + 1] == '"':
                        i += 2
                        continue
                    in_quotes = False
            elif ch == '"':
                in_quotes = True
            elif ch in ('(', '['):
                depth += 1
            elif ch in (')', ']'):
                depth -= 1
            elif ch == ',' and depth == 0:
                i += 1  # consume comma; outer loop will skip whitespace
                break
            i += 1

    return fields


def _build_json_select_parts(describe: list) -> List[str]:
    """
    Build SELECT expressions for a JSON view, expanding nested types:
      STRUCT(...)    → col__field per field (wide)
      T[]            → col__index (1-based) + UNNEST(col) (long)
      STRUCT(...)[]  → col__index + UNNEST(col).field per field (long + wide)
      MAP / other    → pass-through
    Multiple LIST columns are unnested in parallel (DuckDB aligns positionally,
    NULL-pads shorter arrays).
    """
    parts: List[str] = []
    for row in describe:
        col_name: str = row[0]
        col_type: str = row[1]

        if _is_list_type(col_type):
            elem_type = _unwrap_list_element(col_type)
            parts.append(
                f'generate_subscripts("{col_name}", 1) AS "{col_name}__index"'
            )
            if _is_struct_type(elem_type):
                # LIST of STRUCT → unnest + expand struct fields
                for field in _parse_struct_field_names(elem_type):
                    parts.append(
                        f'UNNEST("{col_name}")."{field}" AS "{col_name}__{field}"'
                    )
            else:
                # LIST of scalar → unnest value, keep original column name
                parts.append(f'UNNEST("{col_name}") AS "{col_name}"')

        elif _is_struct_type(col_type):
            # Plain STRUCT → expand fields (wide, no row multiplication)
            for field in _parse_struct_field_names(col_type):
                parts.append(f'"{col_name}"."{field}" AS "{col_name}__{field}"')

        else:
            # Scalar, MAP, or unrecognised → pass through unchanged
            parts.append(f'"{col_name}"')

    return parts


@dataclass
class FileInfo:
    """Information about an uploaded file."""
    file_path: str
    table_name: str
    handler: BaseFileHandler


class FileConnector(BaseConnector):
    """Connector for querying files (CSV, Parquet) using DuckDB."""

    @property
    def sql_dialect(self) -> SqlDialect:
        return _duckdb_dialect

    def __init__(self):
        # Support for multiple files - each becomes a table
        self._files: List[FileInfo] = []

    def _sanitize_table_name(self, filename: str) -> str:
        """
        Sanitize a filename to create a valid SQL table name.

        - Remove file extension
        - Replace spaces and special characters with underscores
        - Remove consecutive underscores
        - Ensure it doesn't start with a number
        - Convert to lowercase for consistency
        """
        name = os.path.splitext(filename)[0]
        name = name.lower()
        name = re.sub(r'[^\w]+', '_', name)
        name = re.sub(r'_+', '_', name)
        name = name.strip('_')
        if name and name[0].isdigit():
            name = 'table_' + name
        if not name:
            name = 'uploaded_file'
        return name

    def connect(self, connection_details: Dict[str, Any]) -> None:
        """
        Connect to one or more files.

        Supports two formats in connection_details:
        1. Legacy single-file format:
           - file_path: str
           - original_filename: str (optional)
        2. Multi-file format:
           - file_paths: List[Dict] with keys: file_path, original_filename

        CSV configuration is applied globally to all CSV files.
        """
        self._files = []

        csv_config = build_csv_handler_config(connection_details)

        file_paths = connection_details.get("file_paths")
        if file_paths:
            for file_info in file_paths:
                self._add_file(file_info.get("file_path"), file_info.get("original_filename"), csv_config)
        else:
            self._add_file(
                connection_details.get("file_path"),
                connection_details.get("original_filename"),
                csv_config,
            )

        if not self._files:
            raise DataSourceConnectionError("No valid files provided for connection")

        table_names = [f.table_name for f in self._files]
        file_types = list(set(f.handler.file_type for f in self._files))
        logger.info(f"FileConnector connected to {len(self._files)} file(s): {table_names} (types: {file_types})")

    def _add_file(
        self,
        file_path: Optional[str],
        original_filename: Optional[str],
        csv_config: Dict[str, Any],
    ) -> None:
        """Add a file to the connector."""
        if not file_path or not os.path.exists(file_path):
            raise DataSourceConnectionError(f"File not found or inaccessible at {file_path}")

        _, file_ext = os.path.splitext(file_path)
        file_ext = file_ext.lower()

        if file_ext not in FILE_HANDLER_REGISTRY:
            supported = ', '.join(FILE_HANDLER_REGISTRY.keys())
            raise InvalidInputError(f"Unsupported file type: {file_ext}. Supported: {supported}")

        handler = FILE_HANDLER_REGISTRY[file_ext](csv_config)

        # JSON files are materialised as Parquet once on connect so every
        # subsequent query hits the fast columnar format instead of re-parsing
        # and re-UNNESTing the JSON file each time.
        if isinstance(handler, JsonFileHandler):
            file_path = self._convert_json_to_parquet(file_path, handler)
            handler = ParquetFileHandler()

        if original_filename:
            table_name = self._sanitize_table_name(original_filename)
        else:
            table_name = os.path.splitext(os.path.basename(file_path))[0]

        table_name = self._ensure_unique_table_name(table_name)

        self._files.append(FileInfo(
            file_path=file_path,
            table_name=table_name,
            handler=handler,
        ))

    def _convert_json_to_parquet(self, json_path: str, handler: JsonFileHandler) -> str:
        """
        Read a JSON file, apply UNNEST/struct flattening, and write the result
        as a Parquet file in the same temp directory.

        This materialises the data once so that all subsequent queries run
        against the fast columnar Parquet format instead of re-parsing the
        JSON on every access.
        """
        parquet_path = os.path.splitext(json_path)[0] + '__flat.parquet'
        con = None
        try:
            con = duckdb.connect(database=':memory:', read_only=False)
            reader_sql = handler.build_reader_sql(json_path)
            con.execute(f"CREATE TEMPORARY VIEW __json_raw AS SELECT * FROM {reader_sql};")
            describe = con.execute("DESCRIBE __json_raw;").fetchall()
            if handler.config.get("flatten_nested", True):
                select_parts = _build_json_select_parts(describe)
            else:
                select_parts = [f'"{row[0]}"' for row in describe]
            escaped = parquet_path.replace("'", "''")
            con.execute(
                f"COPY (SELECT {', '.join(select_parts)} FROM __json_raw) "
                f"TO '{escaped}' (FORMAT PARQUET);"
            )
            logger.info(f"JSON → Parquet materialisation: {json_path} -> {parquet_path}")
        except Exception:
            if os.path.exists(parquet_path):
                os.remove(parquet_path)
            raise
        finally:
            if con:
                con.close()
        return parquet_path

    def add_file(self, file_path: str, original_filename: str, csv_config: Dict[str, Any]) -> str:
        """
        Add a single file to an already-connected connector.

        Returns the table name assigned to the new file.
        """
        self._add_file(file_path, original_filename, csv_config)
        return self._files[-1].table_name

    def _ensure_unique_table_name(self, table_name: str) -> str:
        """Ensure the table name is unique by appending a suffix if needed."""
        existing_names = {f.table_name for f in self._files}
        if table_name not in existing_names:
            return table_name
        counter = 2
        while f"{table_name}_{counter}" in existing_names:
            counter += 1
        return f"{table_name}_{counter}"

    def _get_file_by_table(self, table_name: str) -> Optional[FileInfo]:
        """Get file info by table name."""
        for f in self._files:
            if f.table_name == table_name:
                return f
        return None

    def disconnect(self) -> None:
        table_names = [f.table_name for f in self._files]
        logger.info(f"FileConnector disconnected signal received for files: {table_names}")
        self._files = []

    def list_databases(self) -> List[Database]:
        return []

    def detect_foreign_keys(self, database: str = None) -> List[ForeignKeyRelationship]:
        """Detect FK relationships across uploaded files using naming conventions."""
        if not self._files:
            return []
        try:
            tables = self.list_tables(database)
            table_columns = {}
            for table in tables:
                try:
                    table_columns[table.name] = self.list_columns(database, table.name)
                except Exception as e:
                    logger.warning(f"Could not list columns for {table.name}: {e}")
                    continue
            return detect_foreign_keys_by_naming_convention(table_columns)
        except Exception as e:
            logger.warning(f"Error detecting foreign keys in file connector: {e}")
            return []

    def list_tables(self, database: str = None) -> List[Table]:
        """Return all uploaded files as tables."""
        return [Table(name=f.table_name) for f in self._files]

    def list_columns(self, database: str = None, table: str = None) -> List[Column]:
        if not self._files:
            raise DataSourceConnectionError("Not connected (no files loaded).")

        file_info = self._get_file_by_table(table)
        if not file_info:
            available_tables = [f.table_name for f in self._files]
            raise InvalidInputError(f"Table '{table}' not found. Available tables: {available_tables}")

        con = None
        try:
            con = duckdb.connect(database=':memory:', read_only=False)
            safe_view_name = f'"{file_info.table_name}"'
            self._create_view(con, file_info)

            describe_query = f"DESCRIBE {safe_view_name};"
            logger.debug(f"Executing describe query on view: {describe_query}")
            result = con.execute(describe_query).fetchall()
            columns = []
            datetime_types = {'TIMESTAMP', 'DATE', 'TIME', 'TIMESTAMP WITH TIME ZONE'}
            for row in result:
                col_name = row[0]
                col_type = row[1].upper()
                col = Column(name=col_name, data_type=col_type)
                if col_type in datetime_types:
                    col.is_datetime = True
                columns.append(col)
            return columns
        except Exception as e:
            logger.exception(f"Error describing view {file_info.table_name} with DuckDB")
            raise DataSourceConnectionError(f"Failed to list columns from file view {file_info.table_name}: {e}")
        finally:
            if con:
                con.close()

    def _create_all_views(self, con: duckdb.DuckDBPyConnection) -> None:
        """Create views for all uploaded files in the given DuckDB connection."""
        for file_info in self._files:
            self._create_view(con, file_info)

    def _create_view(self, con: duckdb.DuckDBPyConnection, file_info: FileInfo) -> None:
        """Create (or replace) the DuckDB view backing a single file.

        DuckDB's CSV sniffer fails to detect a column as DOUBLE when values
        have trailing whitespace (e.g. "123.5 "), falling back to VARCHAR,
        even though leading whitespace and TRY_CAST both parse it fine. Once
        the raw view is created, any VARCHAR column that fully round-trips
        through TRIM + TRY_CAST(... AS DOUBLE) is re-cast so numeric CSV data
        with stray whitespace still gets a numeric type.
        """
        safe_view_name = f'"{file_info.table_name}"'
        raw_view_name = f'"{file_info.table_name}__raw"'
        reader_sql = file_info.handler.build_reader_sql(file_info.file_path)
        create_raw_view_sql = f"CREATE OR REPLACE TEMPORARY VIEW {raw_view_name} AS SELECT * FROM {reader_sql};"
        logger.debug(f"Creating raw view with SQL: {create_raw_view_sql}")
        con.execute(create_raw_view_sql)

        describe = con.execute(f"DESCRIBE {raw_view_name};").fetchall()

        # JSON path: expand STRUCT columns (wide) and UNNEST LIST columns (long)
        handler_config = getattr(file_info.handler, "config", {})
        if file_info.handler.file_type == "json" and handler_config.get("flatten_nested", True):
            select_parts = _build_json_select_parts(describe)
            create_view_sql = (
                f"CREATE OR REPLACE TEMPORARY VIEW {safe_view_name} AS "
                f"SELECT {', '.join(select_parts)} FROM {raw_view_name};"
            )
            logger.debug(f"Creating JSON view with SQL: {create_view_sql}")
            con.execute(create_view_sql)
            return

        trim_numeric_whitespace = bool(handler_config.get("trim_numeric_whitespace", False))
        varchar_cols = (
            [row[0] for row in describe if row[1].upper() == "VARCHAR"]
            if file_info.handler.file_type == "csv" and trim_numeric_whitespace
            else []
        )

        numeric_cols = set()
        if varchar_cols:
            checks = ", ".join(
                f'COUNT(*) FILTER (WHERE "{c}" IS NOT NULL AND TRY_CAST(TRIM("{c}") AS DOUBLE) IS NULL) AS "{c}__bad", '
                f'COUNT(*) FILTER (WHERE "{c}" IS NOT NULL) AS "{c}__present"'
                for c in varchar_cols
            )
            check_result = con.execute(f"SELECT {checks} FROM {raw_view_name};").fetchone()
            column_names = [desc[0] for desc in con.description]
            checks_by_col = dict(zip(column_names, check_result))
            numeric_cols = {
                c for c in varchar_cols
                if checks_by_col[f"{c}__present"] > 0 and checks_by_col[f"{c}__bad"] == 0
            }

        select_parts = [
            f'TRY_CAST(TRIM("{row[0]}") AS DOUBLE) AS "{row[0]}"' if row[0] in numeric_cols else f'"{row[0]}"'
            for row in describe
        ]
        create_view_sql = (
            f"CREATE OR REPLACE TEMPORARY VIEW {safe_view_name} AS "
            f"SELECT {', '.join(select_parts)} FROM {raw_view_name};"
        )
        logger.debug(f"Creating view with SQL: {create_view_sql}")
        con.execute(create_view_sql)

    def fetch_data(self, query: str) -> Tuple[List[Dict[str, str]], List[Dict[str, Any]]]:
        if not self._files:
            raise DataSourceConnectionError("Not connected to any files.")

        con = None
        try:
            con = duckdb.connect(database=':memory:', read_only=False)
            self._create_all_views(con)

            table_names = [f.table_name for f in self._files]
            logger.debug(f"Executing query against views {table_names}: {query}")
            arrow_table = con.execute(query).to_arrow_table()

            columns = []
            if arrow_table.schema:
                for i in range(len(arrow_table.schema)):
                    field = arrow_table.schema.field(i)
                    columns.append({'name': field.name, 'type': str(field.type)})
            rows = arrow_table.to_pylist()
            rows = process_query_result_data(rows)

            logger.debug(f"Fetch data returning {len(columns)} columns and {len(rows)} rows.")
            return columns, rows

        except Exception as e:
            logger.exception(f"Error executing query on file views")
            file_types = list(set(f.handler.file_type for f in self._files))
            raise QueryExecutionError(f"Failed to execute query on {file_types} file(s): {e}")
        finally:
            if con:
                con.close()

    def fetch_data_arrow(self, query: str) -> pa.Table:
        """
        Executes a query and returns data as an Apache Arrow Table.

        This is optimized for DuckDB since it natively produces Arrow tables,
        avoiding the intermediate conversion to Python dicts.

        Args:
            query: The executable query string (SQL).

        Returns:
            PyArrow Table containing the query results.
        """
        if not self._files:
            raise DataSourceConnectionError("Not connected to any files.")

        con = None
        try:
            con = duckdb.connect(database=':memory:', read_only=False)
            self._create_all_views(con)

            table_names = [f.table_name for f in self._files]
            logger.debug(f"Executing Arrow query against views {table_names}: {query}")
            arrow_table = con.execute(query).to_arrow_table()

            logger.debug(f"Arrow fetch returning {arrow_table.num_columns} columns and {arrow_table.num_rows} rows.")
            return arrow_table

        except Exception as e:
            logger.exception(f"Error executing Arrow query on file views")
            file_types = list(set(f.handler.file_type for f in self._files))
            raise QueryExecutionError(f"Failed to execute Arrow query on {file_types} file(s): {e}")
        finally:
            if con:
                con.close()
