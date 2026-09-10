# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Connector for SQLite database files, queried through DuckDB's sqlite extension.

A SQLite file holds a whole schema, so one upload yields many tables. Metadata
(table list, declared column types, foreign keys) is read with the stdlib
``sqlite3`` module; queries run in DuckDB with the file ATTACHed read-only, so
the DuckDB dialect and all analytic SQL apply unchanged and no data is copied.
"""
import logging
import os
import sqlite3
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import quote

import duckdb
import pyarrow as pa

from backend.models.data_source import Database, Table, Column, ForeignKeyRelationship
from backend.dialects import SqlDialect, DuckDbDialect
from .base import BaseConnector
from .fk_detection import detect_foreign_keys_by_naming_convention
from backend.exceptions import DataSourceConnectionError, InvalidInputError, QueryExecutionError
from backend.utils.type_conversion import process_query_result_data

logger = logging.getLogger(__name__)

_duckdb_dialect = DuckDbDialect()

# First 16 bytes of every SQLite database file.
SQLITE_MAGIC_HEADER = b"SQLite format 3\x00"

# Catalog name the database file is ATTACHed under.
_ATTACH_ALIAS = "sqlite_db"

_DATETIME_TYPES = {'TIMESTAMP', 'DATE', 'TIME', 'TIMESTAMP WITH TIME ZONE'}

# INSTALL downloads the extension once into the DuckDB extension cache; after
# the first success every connection only needs LOAD.
_extension_installed = False


def validate_sqlite_file(path: str) -> None:
    """Validate that path points to a readable SQLite database file.

    Checks the file header and that the schema can actually be read, so a
    corrupt or mislabelled upload is rejected before a connection is stored.

    Raises:
        InvalidInputError: if the file is not a usable SQLite database.
    """
    try:
        with open(path, 'rb') as handle:
            header = handle.read(len(SQLITE_MAGIC_HEADER))
    except OSError as e:
        raise InvalidInputError(f"Could not read uploaded file: {e}")

    if header != SQLITE_MAGIC_HEADER:
        raise InvalidInputError(
            "Invalid SQLite database file: missing 'SQLite format 3' file header."
        )

    con = None
    try:
        con = _open_sqlite_readonly(path)
        con.execute("SELECT name FROM sqlite_master LIMIT 1").fetchall()
    except sqlite3.Error as e:
        raise InvalidInputError(f"Invalid or unreadable SQLite database file: {e}")
    finally:
        if con:
            con.close()


def _open_sqlite_readonly(path: str) -> sqlite3.Connection:
    """Open a SQLite file read-only so metadata reads cannot modify it."""
    uri = f"file:{quote(os.path.abspath(path))}?mode=ro"
    return sqlite3.connect(uri, uri=True)


def _quote_identifier(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def _quote_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


class SqliteConnector(BaseConnector):
    """Connector for a single SQLite database file, executed by DuckDB."""

    @property
    def sql_dialect(self) -> SqlDialect:
        return _duckdb_dialect

    def __init__(self):
        self._file_path: Optional[str] = None
        self._tables: List[str] = []
        # table -> columns declared without a type. SQLite gives those columns
        # no affinity, and DuckDB's scanner surfaces them as BLOB; they are
        # re-cast to VARCHAR so text values stay readable (see _create_view).
        self._untyped_columns: Dict[str, List[str]] = {}
        self._declared_foreign_keys: List[ForeignKeyRelationship] = []
        # table -> CREATE VIEW statement, built once at connect time
        self._view_sql: Dict[str, str] = {}

    # ----- Connection lifecycle -----
    def connect(self, connection_details: Dict[str, Any]) -> None:
        """Attach a SQLite database file.

        Args:
            connection_details: Dict containing:
                - file_path: Absolute path to the uploaded SQLite file
        """
        self._reset()

        file_path = connection_details.get("file_path")
        if not file_path:
            raise InvalidInputError("No SQLite database file provided for connection")
        if not os.path.exists(file_path):
            raise DataSourceConnectionError(f"SQLite file not found or inaccessible at {file_path}")

        validate_sqlite_file(file_path)
        self._file_path = file_path

        try:
            self._read_schema()
        except sqlite3.Error as e:
            self._reset()
            raise DataSourceConnectionError(f"Failed to read SQLite schema: {e}")

        if not self._tables:
            self._reset()
            raise DataSourceConnectionError(
                "The SQLite database contains no tables or views to query."
            )

        # Fail at connect time (not on the first query) when the DuckDB sqlite
        # extension is unavailable, e.g. offline with an empty extension cache.
        con = None
        try:
            con = self._open_duckdb()
            self._build_view_sql(con)
        finally:
            if con:
                con.close()

        logger.info(
            "SqliteConnector connected to '%s' with %d table(s): %s",
            os.path.basename(file_path),
            len(self._tables),
            self._tables[:10],
        )

    def disconnect(self) -> None:
        logger.info(f"SqliteConnector disconnect signal received for tables: {self._tables}")
        self._reset()

    def _reset(self) -> None:
        self._file_path = None
        self._tables = []
        self._untyped_columns = {}
        self._declared_foreign_keys = []
        self._view_sql = {}

    # ----- Schema discovery (stdlib sqlite3) -----
    def _read_schema(self) -> None:
        """Read table names, untyped columns and declared FKs from the file."""
        con = _open_sqlite_readonly(self._file_path)
        try:
            rows = con.execute(
                "SELECT name FROM sqlite_master "
                "WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' "
                "ORDER BY name"
            ).fetchall()
            self._tables = [row[0] for row in rows]

            for table in self._tables:
                quoted = _quote_identifier(table)
                info = con.execute(f"PRAGMA table_info({quoted})").fetchall()
                untyped = [row[1] for row in info if not (row[2] or '').strip()]
                if untyped:
                    self._untyped_columns[table] = untyped

            self._declared_foreign_keys = self._read_declared_foreign_keys(con)
        finally:
            con.close()

        logger.info(
            "SQLite schema: %d table(s), %d with untyped columns, %d declared FK(s)",
            len(self._tables),
            len(self._untyped_columns),
            len(self._declared_foreign_keys),
        )

    def _read_declared_foreign_keys(self, con: sqlite3.Connection) -> List[ForeignKeyRelationship]:
        """Read real FK constraints via PRAGMA foreign_key_list.

        Rows of one constraint share an ``id``; ``seq`` orders the columns of a
        composite key. A NULL target column means the constraint references the
        target table's primary key, which is resolved from PRAGMA table_info.
        """
        relationships: List[ForeignKeyRelationship] = []
        known_tables = set(self._tables)

        for from_table in self._tables:
            try:
                rows = con.execute(
                    f"PRAGMA foreign_key_list({_quote_identifier(from_table)})"
                ).fetchall()
            except sqlite3.Error as e:
                logger.warning(f"Could not read foreign keys for '{from_table}': {e}")
                continue

            # constraint id -> ordered (seq, from_column, to_column) triples
            constraints: Dict[int, List[Tuple[int, str, Optional[str]]]] = {}
            targets: Dict[int, str] = {}
            for row in rows:
                constraint_id, seq, to_table, from_column, to_column = row[0], row[1], row[2], row[3], row[4]
                constraints.setdefault(constraint_id, []).append((seq, from_column, to_column))
                targets[constraint_id] = to_table

            for constraint_id, columns in constraints.items():
                to_table = targets[constraint_id]
                if to_table not in known_tables:
                    logger.warning(
                        "Skipping FK %s -> %s: target table not found in this database",
                        from_table, to_table,
                    )
                    continue

                columns.sort(key=lambda item: item[0])
                from_columns = [item[1] for item in columns]
                to_columns = [item[2] for item in columns]

                if any(column is None for column in to_columns):
                    resolved = self._primary_key_columns(con, to_table)
                    if len(resolved) != len(from_columns):
                        logger.warning(
                            "Skipping FK %s -> %s: implicit primary key has %d column(s) "
                            "but the constraint has %d",
                            from_table, to_table, len(resolved), len(from_columns),
                        )
                        continue
                    to_columns = resolved

                relationships.append(ForeignKeyRelationship(
                    from_table=from_table,
                    from_columns=from_columns,
                    to_table=to_table,
                    to_columns=to_columns,
                    relationship_type='many_to_one',
                ))
                logger.info(
                    "Declared FK: %s(%s) -> %s(%s)",
                    from_table, ', '.join(from_columns), to_table, ', '.join(to_columns),
                )

        return relationships

    @staticmethod
    def _primary_key_columns(con: sqlite3.Connection, table: str) -> List[str]:
        """Return a table's primary key columns in key order."""
        info = con.execute(f"PRAGMA table_info({_quote_identifier(table)})").fetchall()
        primary_key = [(row[5], row[1]) for row in info if row[5]]
        primary_key.sort(key=lambda item: item[0])
        return [name for _, name in primary_key]

    # ----- DuckDB execution -----
    def _open_duckdb(self) -> duckdb.DuckDBPyConnection:
        """Open a DuckDB connection with the SQLite file attached read-only.

        The attached catalog is made current so unqualified table names in
        generated SQL resolve to the SQLite tables, matching the DuckDB
        dialect's schema-less table references.
        """
        global _extension_installed

        if not self._file_path:
            raise DataSourceConnectionError("Not connected to a SQLite database.")

        con = duckdb.connect(database=':memory:', read_only=False)
        try:
            if not _extension_installed:
                try:
                    con.install_extension("sqlite")
                    _extension_installed = True
                except Exception:
                    # Already-cached extensions load fine without INSTALL, so
                    # only a failing LOAD below is fatal.
                    logger.debug("DuckDB sqlite extension install skipped or failed", exc_info=True)
            try:
                con.load_extension("sqlite")
            except Exception as e:
                raise DataSourceConnectionError(
                    f"DuckDB sqlite extension is required for SQLite data sources: {e}"
                )

            con.execute(
                f"ATTACH {_quote_literal(self._file_path)} AS {_ATTACH_ALIAS} "
                f"(TYPE sqlite, READ_ONLY)"
            )
            con.execute(f"USE {_ATTACH_ALIAS}")
            self._create_untyped_column_views(con)
            return con
        except Exception:
            con.close()
            raise

    def _create_untyped_column_views(self, con: duckdb.DuckDBPyConnection) -> None:
        """Shadow tables that have untyped columns with type-corrected views.

        Only these tables need a view; every other table is read straight from
        the attached catalog. Temporary views take precedence over catalog
        tables of the same name, so queries need no rewriting.
        """
        for create_view_sql in self._view_sql.values():
            con.execute(create_view_sql)

    def _build_view_sql(self, con: duckdb.DuckDBPyConnection) -> None:
        """Build the type-correcting view statement for every untyped table.

        A SQLite column declared without a type has no affinity, so DuckDB's
        scanner reports it as BLOB and its values arrive as bytes. Casting to
        VARCHAR keeps text readable (and Arrow-friendly) instead. The statements
        are built once here and replayed on every later connection.
        """
        self._view_sql = {}
        for table, untyped_columns in self._untyped_columns.items():
            untyped = set(untyped_columns)
            quoted_table = _quote_identifier(table)
            describe = con.execute(
                f"DESCRIBE SELECT * FROM {_ATTACH_ALIAS}.{quoted_table}"
            ).fetchall()

            select_parts = []
            needs_view = False
            for row in describe:
                column_name = row[0]
                quoted_column = _quote_identifier(column_name)
                if column_name in untyped and row[1].upper() == 'BLOB':
                    select_parts.append(f"TRY_CAST({quoted_column} AS VARCHAR) AS {quoted_column}")
                    needs_view = True
                else:
                    select_parts.append(quoted_column)

            if not needs_view:
                continue

            self._view_sql[table] = (
                f"CREATE OR REPLACE TEMPORARY VIEW {quoted_table} AS "
                f"SELECT {', '.join(select_parts)} FROM {_ATTACH_ALIAS}.{quoted_table};"
            )
            logger.debug(f"SQLite view for untyped columns: {self._view_sql[table]}")

    # ----- Metadata -----
    def list_databases(self) -> List[Database]:
        """A SQLite file is a single database - return empty list."""
        return []

    def list_tables(self, database: str = None) -> List[Table]:
        """Return all tables and views in the attached database."""
        return [Table(name=name) for name in self._tables]

    def list_columns(self, database: str = None, table: str = None) -> List[Column]:
        if not self._tables:
            raise DataSourceConnectionError("Not connected to a SQLite database.")

        if table not in self._tables:
            raise InvalidInputError(
                f"Table '{table}' not found. Available tables: {self._tables}"
            )

        con = None
        try:
            con = self._open_duckdb()
            result = con.execute(f"DESCRIBE {_quote_identifier(table)};").fetchall()

            columns = []
            for row in result:
                col_type = row[1].upper()
                col = Column(name=row[0], data_type=col_type)
                if col_type in _DATETIME_TYPES:
                    col.is_datetime = True
                columns.append(col)
            return columns
        except (DataSourceConnectionError, InvalidInputError):
            raise
        except Exception as e:
            logger.exception(f"Error describing SQLite table '{table}' with DuckDB")
            raise DataSourceConnectionError(f"Failed to list columns for table '{table}': {e}")
        finally:
            if con:
                con.close()

    def detect_foreign_keys(self, database: str = None) -> List[ForeignKeyRelationship]:
        """Return the database's declared foreign keys.

        SQLite records real FK constraints, so joins come from the schema rather
        than from column-name guessing. Databases created without constraints
        (a common export shape) fall back to the naming heuristic.
        """
        if not self._tables:
            return []

        if self._declared_foreign_keys:
            return list(self._declared_foreign_keys)

        logger.info("No declared foreign keys in SQLite database, falling back to naming heuristic")
        try:
            table_columns = {}
            for table in self._tables:
                try:
                    table_columns[table] = self.list_columns(database, table)
                except Exception as e:
                    logger.warning(f"Could not list columns for {table}: {e}")
                    continue
            return detect_foreign_keys_by_naming_convention(table_columns)
        except Exception as e:
            logger.warning(f"Error detecting foreign keys in SQLite connector: {e}")
            return []

    # ----- Query execution -----
    def fetch_data(self, query: str) -> Tuple[List[Dict[str, str]], List[Dict[str, Any]]]:
        con = None
        try:
            con = self._open_duckdb()
            logger.debug(f"Executing query against SQLite tables {self._tables[:10]}: {query}")
            arrow_table = con.execute(query).to_arrow_table()

            columns = []
            if arrow_table.schema:
                for i in range(len(arrow_table.schema)):
                    field = arrow_table.schema.field(i)
                    columns.append({'name': field.name, 'type': str(field.type)})
            rows = process_query_result_data(arrow_table.to_pylist())

            logger.debug(f"Fetch data returning {len(columns)} columns and {len(rows)} rows.")
            return columns, rows
        except DataSourceConnectionError:
            raise
        except Exception as e:
            logger.exception("Error executing query on SQLite database")
            raise QueryExecutionError(f"Failed to execute query on SQLite database: {e}")
        finally:
            if con:
                con.close()

    def fetch_data_arrow(self, query: str) -> pa.Table:
        con = None
        try:
            con = self._open_duckdb()
            logger.debug(f"Executing Arrow query against SQLite tables {self._tables[:10]}: {query}")
            arrow_table = con.execute(query).to_arrow_table()

            logger.debug(
                f"Arrow fetch returning {arrow_table.num_columns} columns and {arrow_table.num_rows} rows."
            )
            return arrow_table
        except DataSourceConnectionError:
            raise
        except Exception as e:
            logger.exception("Error executing Arrow query on SQLite database")
            raise QueryExecutionError(f"Failed to execute Arrow query on SQLite database: {e}")
        finally:
            if con:
                con.close()
