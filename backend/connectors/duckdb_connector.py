# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Connector for persistent DuckDB database files."""

from __future__ import annotations

import logging
import os
import threading
from typing import Any, Dict, List, Optional, Tuple

import duckdb
import pyarrow as pa

from backend.connectors.base import BaseConnector
from backend.dialects import SqlDialect
from backend.dialects.duckdb import DuckDbDatabaseDialect
from backend.exceptions import DataSourceConnectionError, InvalidInputError, QueryExecutionError
from backend.models.data_source import Column, Database, Table
from backend.utils.path_safety import is_path_within_any_root, parse_allowed_roots
from backend.utils.type_conversion import process_query_result_data

logger = logging.getLogger(__name__)

_duckdb_database_dialect = DuckDbDatabaseDialect()

_EXCLUDED_SCHEMAS = frozenset({"information_schema", "pg_catalog"})
_DATETIME_TYPES = frozenset({"TIMESTAMP", "DATE", "TIME", "TIMESTAMP WITH TIME ZONE", "TIMESTAMPTZ"})


def _quote_ident(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def _validate_database_path(database_path: str) -> str:
    """Validate and normalize a DuckDB database file path."""
    if not database_path or not str(database_path).strip():
        raise InvalidInputError("database_path is required")

    path = str(database_path).strip()
    if path == ":memory:" or path.lower().startswith("md:") or path.lower().startswith("motherduck:"):
        raise InvalidInputError("Only local DuckDB database files are supported")

    if not os.path.isabs(path):
        raise InvalidInputError("database_path must be an absolute path")

    if not os.path.exists(path):
        raise DataSourceConnectionError(f"DuckDB database file not found: {path}")

    if not os.path.isfile(path):
        raise DataSourceConnectionError(f"database_path must be a file: {path}")

    real_path = os.path.realpath(path)
    allowed_roots = parse_allowed_roots(os.environ.get("DUCKDB_ALLOWED_ROOTS"))
    if allowed_roots and not is_path_within_any_root(real_path, allowed_roots):
        raise InvalidInputError(
            "database_path is outside the allowed roots configured by DUCKDB_ALLOWED_ROOTS"
        )

    return real_path


class DuckDbConnector(BaseConnector):
    """Open an existing DuckDB database file for read-only querying."""

    def __init__(self) -> None:
        self._con: Optional[duckdb.DuckDBPyConnection] = None
        self._database_path: Optional[str] = None
        self._lock = threading.Lock()

    @property
    def sql_dialect(self) -> SqlDialect:
        return _duckdb_database_dialect

    def connect(self, connection_details: Dict[str, Any]) -> None:
        database_path = _validate_database_path(connection_details.get("database_path", ""))
        # v1 always opens read-only regardless of client payload
        try:
            con = duckdb.connect(database=database_path, read_only=True)
            con.execute("SELECT 1")
        except Exception as e:
            raise DataSourceConnectionError(f"Failed to open DuckDB database: {e}") from e

        with self._lock:
            if self._con is not None:
                try:
                    self._con.close()
                except Exception:
                    logger.debug("Error closing previous DuckDB connection", exc_info=True)
            self._con = con
            self._database_path = database_path

        logger.info("Connected to DuckDB database file: %s", database_path)

    def disconnect(self) -> None:
        with self._lock:
            if self._con is not None:
                try:
                    self._con.close()
                except Exception:
                    logger.debug("Error closing DuckDB connection on disconnect", exc_info=True)
                finally:
                    self._con = None
            path = self._database_path
            self._database_path = None
        if path:
            logger.info("Disconnected from DuckDB database file: %s", path)

    def _require_connection(self) -> duckdb.DuckDBPyConnection:
        if self._con is None:
            raise DataSourceConnectionError("Not connected to a DuckDB database.")
        return self._con

    def list_databases(self) -> List[Database]:
        con = self._require_connection()
        try:
            with self._lock:
                rows = con.execute(
                    """
                    SELECT schema_name
                    FROM information_schema.schemata
                    WHERE schema_name NOT IN ('information_schema', 'pg_catalog')
                    ORDER BY schema_name
                    """
                ).fetchall()
            return [Database(name=row[0]) for row in rows if row and row[0] not in _EXCLUDED_SCHEMAS]
        except Exception as e:
            raise DataSourceConnectionError(f"Error listing DuckDB schemas: {e}") from e

    def list_tables(self, database: str = None) -> List[Table]:
        if not database:
            raise InvalidInputError("'database' (schema) is required for DuckDB connections")
        con = self._require_connection()
        try:
            with self._lock:
                rows = con.execute(
                    """
                    SELECT table_name
                    FROM information_schema.tables
                    WHERE table_schema = ?
                      AND table_type IN ('BASE TABLE', 'VIEW')
                    ORDER BY table_name
                    """,
                    [database],
                ).fetchall()
            return [Table(name=row[0]) for row in rows]
        except Exception as e:
            raise DataSourceConnectionError(f"Error listing tables in schema '{database}': {e}") from e

    def list_columns(self, database: str = None, table: str = None) -> List[Column]:
        if not database:
            raise InvalidInputError("'database' (schema) is required for DuckDB connections")
        if not table:
            raise InvalidInputError("Table name is required")

        con = self._require_connection()
        qualified = f"{_quote_ident(database)}.{_quote_ident(table)}"
        try:
            with self._lock:
                result = con.execute(f"DESCRIBE {qualified}").fetchall()
            columns: List[Column] = []
            for row in result:
                col_name = row[0]
                col_type = str(row[1]).upper()
                col = Column(name=col_name, data_type=col_type)
                # Match TIMESTAMP WITH TIME ZONE and TIMESTAMPTZ variants
                base_type = col_type.split("(")[0].strip()
                if base_type in _DATETIME_TYPES or "TIMESTAMP" in base_type or base_type == "DATE":
                    col.is_datetime = True
                columns.append(col)
            return columns
        except Exception as e:
            raise DataSourceConnectionError(
                f"Failed to list columns for {database}.{table}: {e}"
            ) from e

    def fetch_data(self, query: str) -> Tuple[List[Dict[str, str]], List[Dict[str, Any]]]:
        con = self._require_connection()
        try:
            with self._lock:
                arrow_table = con.execute(query).to_arrow_table()
            columns = [
                {"name": arrow_table.schema.field(i).name, "type": str(arrow_table.schema.field(i).type)}
                for i in range(len(arrow_table.schema))
            ]
            rows = process_query_result_data(arrow_table.to_pylist())
            return columns, rows
        except QueryExecutionError:
            raise
        except Exception as e:
            logger.exception("Error executing query on DuckDB database")
            raise QueryExecutionError(f"Failed to execute query: {e}") from e

    def fetch_data_arrow(self, query: str) -> pa.Table:
        con = self._require_connection()
        try:
            with self._lock:
                return con.execute(query).to_arrow_table()
        except QueryExecutionError:
            raise
        except Exception as e:
            logger.exception("Error executing Arrow query on DuckDB database")
            raise QueryExecutionError(f"Failed to execute query: {e}") from e
