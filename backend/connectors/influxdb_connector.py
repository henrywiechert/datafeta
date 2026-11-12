# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Connector for InfluxDB 1.8 / 2.x: measurements loaded into DuckDB.

At connect time every selected measurement is pulled once over InfluxQL for the
configured time window and stored as a DuckDB table (one file per connection
in the session directory). All queries then run in DuckDB, so the DuckDB
dialect and every analytic feature apply unchanged. Reconnecting reloads.

Each table holds ``time`` (UTC, microseconds), one VARCHAR column per tag key
and one column per field key typed from ``SHOW FIELD KEYS``.
"""
import logging
import os
import re
import time as time_module
import uuid
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

import duckdb
import pyarrow as pa
import pyarrow.compute as pc

from backend.dialects import DuckDbDialect, SqlDialect
from backend.exceptions import DataSourceConnectionError, InvalidInputError, QueryExecutionError
from backend.models.data_source import Column, Database, Table
from backend.utils.type_conversion import process_query_result_data

from .base import BaseConnector
from .influxql_client import (
    InfluxDbConfig,
    InfluxQLClient,
    MeasurementSchema,
    describe_measurements,
    quote_ident,
)

logger = logging.getLogger(__name__)

_duckdb_dialect = DuckDbDialect()

# Guards against pulling an entire long-lived database by accident.
DEFAULT_MAX_ROWS = int(os.getenv("INFLUXDB_MAX_ROWS", "50000000"))

_DATETIME_TYPES = {"TIMESTAMP", "TIMESTAMP WITH TIME ZONE", "DATE", "TIME"}

_SINGLE_TYPE = {
    "float": "DOUBLE",
    "integer": "BIGINT",
    "unsigned": "UBIGINT",
    "boolean": "BOOLEAN",
    "string": "VARCHAR",
}
_ARROW_TYPES = {
    "DOUBLE": pa.float64(),
    "BIGINT": pa.int64(),
    "UBIGINT": pa.uint64(),
    "BOOLEAN": pa.bool_(),
    "VARCHAR": pa.string(),
}


def field_column_type(influx_types) -> str:
    """DuckDB type for a field key, widening when shards disagree on its type."""
    types = set(influx_types)
    if len(types) == 1:
        return _SINGLE_TYPE.get(next(iter(types)), "VARCHAR")
    if types <= {"float", "integer", "unsigned"}:
        return "DOUBLE"
    return "VARCHAR"


def table_names_for(measurements: List[str]) -> Dict[str, str]:
    """Map measurement names to unique, identifier-safe table names.

    Names like ``disk.io`` would read as ``table.column`` references, so
    anything outside ``[A-Za-z0-9_]`` becomes ``_``. Computed over the whole
    database so a table keeps its name whichever measurements are selected.
    """
    names: Dict[str, str] = {}
    used = set()
    for measurement in sorted(measurements):
        base = re.sub(r"[^0-9A-Za-z_]+", "_", measurement).strip("_") or "measurement"
        if base[0].isdigit():
            base = f"m_{base}"
        candidate, suffix = base, 2
        while candidate.lower() in used:
            candidate = f"{base}_{suffix}"
            suffix += 1
        used.add(candidate.lower())
        names[measurement] = candidate
    return names


@dataclass(frozen=True)
class _PlannedColumn:
    name: str  # DuckDB column name
    sql_type: str
    select_expr: str  # InfluxQL expression (field or tag key with an explicit cast)


@dataclass
class _MeasurementPlan:
    measurement: str
    table_name: str
    columns: List[_PlannedColumn]


def plan_measurement(schema: MeasurementSchema, table_name: str) -> _MeasurementPlan:
    """Columns for one measurement: time, tags, then fields.

    A tag and a field may share a key; explicit ``::tag`` / ``::field`` casts
    keep them apart and the tag column gets a ``_tag`` suffix.
    """
    used = {"time"}
    columns: List[_PlannedColumn] = []

    def unique(name: str) -> str:
        candidate, suffix = name, 2
        while candidate.lower() in used:
            candidate = f"{name}_{suffix}"
            suffix += 1
        used.add(candidate.lower())
        return candidate

    field_keys = sorted(schema.fields)
    field_key_set = {key.lower() for key in field_keys}
    for key in schema.tags:
        name = f"{key}_tag" if key.lower() in field_key_set else key
        columns.append(_PlannedColumn(unique(name), "VARCHAR", f"{quote_ident(key)}::tag"))
    for key in field_keys:
        columns.append(
            _PlannedColumn(unique(key), field_column_type(schema.fields[key]), f"{quote_ident(key)}::field")
        )
    return _MeasurementPlan(schema.name, table_name, columns)


def _to_arrow(values: List[Any], sql_type: str) -> pa.Array:
    arrow_type = _ARROW_TYPES[sql_type]
    try:
        return pa.array(values, type=arrow_type)
    except (pa.ArrowInvalid, pa.ArrowTypeError, OverflowError):
        if sql_type != "VARCHAR":
            raise
    # A widened VARCHAR column mixes strings with numbers and booleans.
    return pa.array(
        [
            None if v is None else ("true" if v is True else "false" if v is False else str(v))
            for v in values
        ],
        type=pa.string(),
    )


def _quote_duckdb(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


class InfluxDbConnector(BaseConnector):
    """Measurements of one InfluxDB database, queried with DuckDB."""

    @property
    def sql_dialect(self) -> SqlDialect:
        return _duckdb_dialect

    def __init__(self, max_rows: Optional[int] = None) -> None:
        self.max_rows = max_rows or DEFAULT_MAX_ROWS
        self.database: Optional[str] = None
        self._tables: Dict[str, str] = {}  # table name -> measurement
        self._con: Optional[duckdb.DuckDBPyConnection] = None
        self._db_path: Optional[str] = None

    # ----- Connection lifecycle -----
    def connect(self, connection_details: Dict[str, Any]) -> None:
        """Load the selected measurements.

        Args:
            connection_details: InfluxDbConfig fields plus ``data_dir``, the
                session directory the DuckDB file is written to.
        """
        self.disconnect()
        try:
            cfg = InfluxDbConfig.model_validate(connection_details)
        except ValueError as e:
            raise InvalidInputError(f"Invalid InfluxDB connection details: {e}")
        data_dir = connection_details.get("data_dir")
        if not data_dir:
            raise DataSourceConnectionError("No session directory to store InfluxDB data in")

        client = cfg.client()
        try:
            version = client.ping()
            schemas = describe_measurements(client, cfg.influx_database)
            plans = self._plan(schemas, cfg.influx_measurements)
            self._db_path = os.path.join(data_dir, f"influxdb_{uuid.uuid4().hex}.duckdb")
            self._con = duckdb.connect(self._db_path)
            total_rows = self._load(client, cfg, plans)
        except Exception:
            self.disconnect()
            raise
        finally:
            client.close()

        if total_rows == 0:
            self.disconnect()
            raise InvalidInputError(
                "The selected measurements have no points in the chosen time range."
            )

        self.database = cfg.influx_database
        self._tables = {plan.table_name: plan.measurement for plan in plans}
        logger.info(
            "Connected to InfluxDB %s database '%s': %d measurement(s), %d rows",
            version or "(unknown version)",
            self.database,
            len(plans),
            total_rows,
        )

    def disconnect(self) -> None:
        if self._con is not None:
            try:
                self._con.close()
            except Exception:
                logger.debug("Error closing InfluxDB DuckDB connection", exc_info=True)
            self._con = None
        if self._db_path:
            for path in (self._db_path, f"{self._db_path}.wal"):
                try:
                    os.remove(path)
                except FileNotFoundError:
                    pass
                except OSError:
                    logger.warning("Could not remove InfluxDB data file %s", path, exc_info=True)
            self._db_path = None
        self.database = None
        self._tables = {}

    # ----- Loading -----
    @staticmethod
    def _plan(schemas: List[MeasurementSchema], selected: Optional[List[str]]) -> List[_MeasurementPlan]:
        by_name = {schema.name: schema for schema in schemas}
        table_names = table_names_for(list(by_name))
        if selected is None:
            wanted = sorted(by_name)
        else:
            missing = sorted(set(selected) - set(by_name))
            if missing:
                raise InvalidInputError(
                    f"Measurement(s) not found in the database: {', '.join(missing)}"
                )
            wanted = sorted(set(selected))
        return [plan_measurement(by_name[name], table_names[name]) for name in wanted]

    def _load(self, client: InfluxQLClient, cfg: InfluxDbConfig, plans: List[_MeasurementPlan]) -> int:
        condition = cfg.time_condition()
        total = 0
        for plan in plans:
            started = time_module.monotonic()
            column_defs = ", ".join(
                [f"{_quote_duckdb('time')} TIMESTAMP"]
                + [f"{_quote_duckdb(c.name)} {c.sql_type}" for c in plan.columns]
            )
            self._con.execute(f"CREATE TABLE {_quote_duckdb(plan.table_name)} ({column_defs})")

            # Positional aliases make the response columns unambiguous.
            selects = ", ".join(f"{c.select_expr} AS c{i}" for i, c in enumerate(plan.columns))
            statement = f"SELECT {selects} FROM {quote_ident(plan.measurement)}"
            if condition:
                statement += f" WHERE {condition}"

            rows = 0
            for columns, values in client.stream_select(statement, cfg.influx_database):
                if not values:
                    continue
                rows += len(values)
                if total + rows > self.max_rows:
                    raise InvalidInputError(
                        f"The selection has more than {self.max_rows:,} points. "
                        "Choose a shorter time range or fewer measurements."
                    )
                self._insert_chunk(plan, columns, values)
            total += rows
            logger.info(
                "Loaded InfluxDB measurement '%s' into table '%s': %d rows in %.1fs",
                plan.measurement,
                plan.table_name,
                rows,
                time_module.monotonic() - started,
            )
        return total

    def _insert_chunk(self, plan: _MeasurementPlan, columns: List[str], values: List[List[Any]]) -> None:
        positions = {name: i for i, name in enumerate(columns)}
        if "time" not in positions:
            raise DataSourceConnectionError(f"InfluxDB response for '{plan.measurement}' has no time column")
        by_column = list(zip(*values))

        nanos = pa.array(by_column[positions["time"]], type=pa.int64())
        # Influx keeps nanoseconds; DuckDB TIMESTAMP holds microseconds.
        arrays = [pc.cast(nanos.cast(pa.timestamp("ns")), pa.timestamp("us"), safe=False)]
        for i, column in enumerate(plan.columns):
            position = positions.get(f"c{i}")
            column_values = by_column[position] if position is not None else [None] * len(values)
            arrays.append(_to_arrow(list(column_values), column.sql_type))

        chunk = pa.Table.from_arrays(arrays, names=["time"] + [c.name for c in plan.columns])
        self._con.register("influx_chunk", chunk)
        try:
            self._con.execute(f"INSERT INTO {_quote_duckdb(plan.table_name)} SELECT * FROM influx_chunk")
        finally:
            self._con.unregister("influx_chunk")

    # ----- Metadata -----
    def _require_connection(self) -> duckdb.DuckDBPyConnection:
        if self._con is None:
            raise DataSourceConnectionError("Not connected to an InfluxDB database")
        return self._con

    def list_databases(self) -> List[Database]:
        return [Database(name=self.database)] if self.database else []

    def list_tables(self, database: str = None) -> List[Table]:
        return [Table(name=name) for name in sorted(self._tables)]

    def list_columns(self, database: str = None, table: str = None) -> List[Column]:
        con = self._require_connection()
        if table not in self._tables:
            raise InvalidInputError(f"Table '{table}' not found. Available tables: {sorted(self._tables)}")
        cursor = con.cursor()
        try:
            rows = cursor.execute(f"DESCRIBE {_quote_duckdb(table)}").fetchall()
        finally:
            cursor.close()
        columns = []
        for row in rows:
            col_type = str(row[1]).upper()
            columns.append(Column(name=row[0], data_type=col_type, is_datetime=col_type in _DATETIME_TYPES))
        return columns

    # ----- Query execution -----
    def fetch_data_arrow(self, query: str) -> pa.Table:
        con = self._require_connection()
        cursor = con.cursor()  # one cursor per call: queries arrive from several threads
        try:
            logger.debug("Executing InfluxDB (DuckDB) Arrow query: %s", query)
            return cursor.execute(query).to_arrow_table()
        except Exception as e:
            logger.exception("Error executing query on InfluxDB data")
            raise QueryExecutionError(f"Failed to execute query: {e}")
        finally:
            cursor.close()

    def fetch_data(self, query: str) -> Tuple[List[Dict[str, str]], List[Dict[str, Any]]]:
        arrow_table = self.fetch_data_arrow(query)
        columns = [{"name": f.name, "type": str(f.type)} for f in arrow_table.schema]
        return columns, process_query_result_data(arrow_table.to_pylist())
