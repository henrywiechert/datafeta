# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Connector for HuggingFace datasets backed by auto-converted Parquet files."""
from __future__ import annotations

from dataclasses import dataclass
import logging
import os
import re
from typing import Any, Dict, List, Optional, Tuple

import duckdb
import pyarrow as pa
import requests

from backend.dialects import DuckDbDialect, SqlDialect
from backend.exceptions import DataSourceConnectionError, InvalidInputError, QueryExecutionError
from backend.models.data_source import Column, Database, ForeignKeyRelationship, Table
from backend.utils.type_conversion import process_query_result_data

from .base import BaseConnector
from .fk_detection import detect_foreign_keys_by_naming_convention

logger = logging.getLogger(__name__)

_duckdb_dialect = DuckDbDialect()

HF_DATASETS_SERVER = "https://datasets-server.huggingface.co"
DEFAULT_MAX_SPLIT_BYTES = int(os.getenv("HF_MAX_SPLIT_BYTES_MB", "500")) * 1024 * 1024


@dataclass(frozen=True)
class HuggingFaceParquetFile:
    config: str
    split: str
    url: str
    size: int


@dataclass(frozen=True)
class HuggingFaceTable:
    table_name: str
    config: str
    split: str
    urls: List[str]
    num_bytes_parquet_files: int
    num_rows: Optional[int]


def _sanitize_table_name(name: str) -> str:
    table_name = name.lower()
    table_name = re.sub(r"[^\w]+", "_", table_name)
    table_name = re.sub(r"_+", "_", table_name)
    table_name = table_name.strip("_")
    if table_name and table_name[0].isdigit():
        table_name = "table_" + table_name
    return table_name or "huggingface_table"


def _sql_string(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def _quote_identifier(value: str) -> str:
    return '"' + value.replace('"', '""') + '"'


class HuggingFaceConnector(BaseConnector):
    """Connector for querying HuggingFace dataset Parquet shards with DuckDB."""

    @property
    def sql_dialect(self) -> SqlDialect:
        return _duckdb_dialect

    def __init__(self) -> None:
        self.dataset: Optional[str] = None
        self.token: Optional[str] = None
        self.selected_splits: Optional[List[str]] = None
        self.max_split_bytes: int = DEFAULT_MAX_SPLIT_BYTES
        self._tables: Dict[str, HuggingFaceTable] = {}
        self._con: Optional[duckdb.DuckDBPyConnection] = None

    def connect(self, connection_details: Dict[str, Any]) -> None:
        self.dataset = connection_details.get("hf_dataset")
        self.token = connection_details.get("hf_token") or None
        self.selected_splits = connection_details.get("hf_splits")
        self.max_split_bytes = int(connection_details.get("hf_max_split_bytes") or DEFAULT_MAX_SPLIT_BYTES)

        if not self.dataset:
            raise DataSourceConnectionError("HuggingFace dataset reference is required (format: owner/dataset-name)")
        if "/" not in self.dataset or len(self.dataset.split("/")) != 2:
            raise InvalidInputError("HuggingFace dataset must be in format 'owner/dataset-name'")

        parquet_files = self._fetch_parquet_files()
        if not parquet_files:
            raise DataSourceConnectionError(
                f"No Parquet files are available for HuggingFace dataset '{self.dataset}'."
            )

        size_payload = self._fetch_size_payload()
        if size_payload.get("partial") is True:
            raise InvalidInputError(
                "This HuggingFace dataset is too large for the Dataset Viewer to fully size. "
                "Please choose a smaller dataset or a measurable split."
            )

        tables = self._build_tables(parquet_files, size_payload)
        if self.selected_splits:
            selected = set(self.selected_splits)
            tables = {name: table for name, table in tables.items() if name in selected}
            missing = sorted(selected - set(tables.keys()))
            if missing:
                raise InvalidInputError(f"Selected HuggingFace split(s) not found: {missing}")

        oversized = [
            table
            for table in tables.values()
            if table.num_bytes_parquet_files > self.max_split_bytes
        ]
        if oversized:
            details = ", ".join(
                f"{table.table_name} ({round(table.num_bytes_parquet_files / (1024 * 1024), 2)} MB)"
                for table in oversized
            )
            max_mb = round(self.max_split_bytes / (1024 * 1024), 2)
            raise InvalidInputError(
                f"HuggingFace split(s) exceed the configured {max_mb} MB limit: {details}"
            )

        if not tables:
            raise DataSourceConnectionError("No HuggingFace splits are available after applying selection filters.")

        self._tables = tables
        logger.info(
            "Connected to HuggingFace dataset %s with tables: %s",
            self.dataset,
            sorted(self._tables.keys()),
        )

    def disconnect(self) -> None:
        table_names = sorted(self._tables.keys())
        if self._con is not None:
            try:
                self._con.close()
            except Exception:
                logger.debug("Error closing DuckDB connection on HuggingFace disconnect", exc_info=True)
            self._con = None
        self.dataset = None
        self.token = None
        self.selected_splits = None
        self._tables = {}
        logger.info("Disconnected from HuggingFace dataset tables: %s", table_names)

    def list_databases(self) -> List[Database]:
        return [Database(name="huggingface")]

    def list_tables(self, database: str = None) -> List[Table]:
        self._validate_database(database)
        return [Table(name=name) for name in sorted(self._tables.keys())]

    def list_columns(self, database: str = None, table: str = None) -> List[Column]:
        self._validate_database(database)
        if not table:
            raise InvalidInputError("Table name is required")

        hf_table = self._get_table(table)
        try:
            return self._fetch_columns_from_dataset_viewer(hf_table)
        except Exception as e:
            logger.exception("Error describing HuggingFace table %s", table)
            raise DataSourceConnectionError(f"Failed to list columns for table {table}: {e}")

    def fetch_data_arrow(self, query: str) -> pa.Table:
        if not self._tables:
            raise DataSourceConnectionError("Not connected to a HuggingFace dataset")
        try:
            con = self._get_con()
            logger.debug("Executing HuggingFace Arrow query: %s", query)
            return con.execute(query).to_arrow_table()
        except QueryExecutionError:
            raise
        except Exception as e:
            logger.exception("Error executing Arrow query on HuggingFace dataset")
            raise QueryExecutionError(f"Failed to execute query: {e}")

    def fetch_data(self, query: str) -> Tuple[List[Dict[str, str]], List[Dict[str, Any]]]:
        if not self._tables:
            raise DataSourceConnectionError("Not connected to a HuggingFace dataset")
        try:
            con = self._get_con()
            logger.debug("Executing HuggingFace query: %s", query)
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
            logger.exception("Error executing query on HuggingFace dataset")
            raise QueryExecutionError(f"Failed to execute query: {e}")

    def detect_foreign_keys(self, database: str = None) -> List[ForeignKeyRelationship]:
        self._validate_database(database)
        try:
            table_columns: Dict[str, List[Column]] = {}
            for table in self.list_tables(database):
                try:
                    table_columns[table.name] = self.list_columns(database, table.name)
                except Exception as e:
                    logger.warning("Could not list columns for %s: %s", table.name, e)
            return detect_foreign_keys_by_naming_convention(table_columns)
        except Exception as e:
            logger.warning("Error detecting foreign keys in HuggingFace dataset: %s", e)
            return []

    def _validate_database(self, database: Optional[str]) -> None:
        if database and database != "huggingface":
            raise InvalidInputError(
                f"Invalid database '{database}'. HuggingFace connector only supports 'huggingface' database."
            )

    def _get_table(self, table: str) -> HuggingFaceTable:
        hf_table = self._tables.get(table)
        if not hf_table:
            raise InvalidInputError(f"Table '{table}' not found. Available tables: {sorted(self._tables.keys())}")
        return hf_table

    def _headers(self) -> Dict[str, str]:
        if not self.token:
            return {}
        return {"Authorization": f"Bearer {self.token}"}

    def _fetch_parquet_files(self) -> List[HuggingFaceParquetFile]:
        try:
            response = requests.get(
                f"{HF_DATASETS_SERVER}/parquet",
                params={"dataset": self.dataset},
                headers=self._headers(),
                timeout=30,
            )
            response.raise_for_status()
            payload = response.json()
            return [
                HuggingFaceParquetFile(
                    config=item["config"],
                    split=item["split"],
                    url=item["url"],
                    size=int(item.get("size") or 0),
                )
                for item in payload.get("parquet_files", [])
            ]
        except requests.HTTPError as e:
            raise DataSourceConnectionError(f"Failed to list HuggingFace Parquet files: {e}")
        except Exception as e:
            logger.exception("Failed to list HuggingFace Parquet files")
            raise DataSourceConnectionError(f"Failed to list HuggingFace Parquet files: {e}")

    def _fetch_size_payload(self) -> Dict[str, Any]:
        try:
            response = requests.get(
                f"{HF_DATASETS_SERVER}/size",
                params={"dataset": self.dataset},
                headers=self._headers(),
                timeout=30,
            )
            response.raise_for_status()
            return response.json()
        except requests.HTTPError as e:
            raise DataSourceConnectionError(f"Failed to size HuggingFace dataset: {e}")
        except Exception as e:
            logger.exception("Failed to size HuggingFace dataset")
            raise DataSourceConnectionError(f"Failed to size HuggingFace dataset: {e}")

    def _fetch_columns_from_dataset_viewer(self, table: HuggingFaceTable) -> List[Column]:
        """Read schema from HF Dataset Viewer metadata instead of scanning remote Parquet."""
        try:
            response = requests.get(
                f"{HF_DATASETS_SERVER}/first-rows",
                params={
                    "dataset": self.dataset,
                    "config": table.config,
                    "split": table.split,
                },
                headers=self._headers(),
                timeout=30,
            )
            response.raise_for_status()
            payload = response.json()
        except requests.HTTPError as e:
            raise DataSourceConnectionError(f"Failed to fetch HuggingFace schema: {e}")
        except Exception as e:
            logger.exception("Failed to fetch HuggingFace schema")
            raise DataSourceConnectionError(f"Failed to fetch HuggingFace schema: {e}")

        features = payload.get("features", [])
        columns: List[Column] = []
        for feature in features:
            name = feature.get("name")
            if not name:
                continue
            data_type = self._feature_type_to_duckdb_type(feature.get("type"))
            col = Column(name=name, data_type=data_type)
            if data_type in {"DATE", "TIME", "TIMESTAMP", "TIMESTAMP WITH TIME ZONE"}:
                col.is_datetime = True
            columns.append(col)

        if not columns:
            raise DataSourceConnectionError(
                f"HuggingFace schema for table {table.table_name} did not contain any features."
            )
        return columns

    def _feature_type_to_duckdb_type(self, feature_type: Any) -> str:
        if not isinstance(feature_type, dict):
            return "VARCHAR"

        type_name = feature_type.get("_type")
        dtype = str(feature_type.get("dtype") or "").lower()

        if type_name in {"List", "Sequence", "LargeList"}:
            return "JSON"
        if type_name in {"ClassLabel", "Translation", "TranslationVariableLanguages"}:
            return "VARCHAR"
        if type_name in {"Image", "Audio", "Video"}:
            return "VARCHAR"

        if dtype in {"string", "large_string"}:
            return "VARCHAR"
        if dtype in {"bool", "boolean"}:
            return "BOOLEAN"
        if dtype in {"int8", "int16", "int32", "uint8", "uint16"}:
            return "INTEGER"
        if dtype in {"int64", "uint32", "uint64"}:
            return "BIGINT"
        if dtype in {"float16", "float32"}:
            return "FLOAT"
        if dtype in {"float64", "double"}:
            return "DOUBLE"
        if dtype == "date32":
            return "DATE"
        if dtype in {"timestamp", "timestamp_ms", "timestamp_us", "timestamp_ns"}:
            return "TIMESTAMP"

        return "VARCHAR"

    def _build_tables(
        self,
        parquet_files: List[HuggingFaceParquetFile],
        size_payload: Dict[str, Any],
    ) -> Dict[str, HuggingFaceTable]:
        grouped: Dict[Tuple[str, str], List[HuggingFaceParquetFile]] = {}
        for file in parquet_files:
            grouped.setdefault((file.config, file.split), []).append(file)

        configs = {config for config, _split in grouped.keys()}
        use_split_only_names = configs == {"default"}
        size_by_split = {
            (item.get("config"), item.get("split")): item
            for item in size_payload.get("size", {}).get("splits", [])
        }

        tables: Dict[str, HuggingFaceTable] = {}
        for (config, split), files in grouped.items():
            raw_name = split if use_split_only_names else f"{config}__{split}"
            table_name = _sanitize_table_name(raw_name)
            size_info = size_by_split.get((config, split), {})
            num_bytes = int(
                size_info.get("num_bytes_parquet_files")
                or sum(file.size for file in files)
                or 0
            )
            tables[table_name] = HuggingFaceTable(
                table_name=table_name,
                config=config,
                split=split,
                urls=[file.url for file in files],
                num_bytes_parquet_files=num_bytes,
                num_rows=size_info.get("num_rows"),
            )
        return tables

    def _create_duckdb_connection(self) -> duckdb.DuckDBPyConnection:
        con = duckdb.connect(database=":memory:", read_only=False)
        try:
            con.install_extension("httpfs")
        except Exception:
            logger.debug("DuckDB httpfs extension install skipped or failed", exc_info=True)
        try:
            con.load_extension("httpfs")
        except Exception as e:
            con.close()
            raise DataSourceConnectionError(f"DuckDB httpfs extension is required for HuggingFace datasets: {e}")

        if self.token:
            token_value = self.token.replace("'", "''")
            try:
                con.execute(
                    "CREATE OR REPLACE SECRET hf_token ("
                    "TYPE http, "
                    f"EXTRA_HTTP_HEADERS MAP {{'Authorization': 'Bearer {token_value}'}}"
                    ");"
                )
            except Exception as e:
                con.close()
                raise DataSourceConnectionError(f"Failed to configure HuggingFace token for DuckDB httpfs: {e}")
        return con

    def _build_read_parquet_sql(self, urls: List[str]) -> str:
        if not urls:
            raise InvalidInputError("HuggingFace table has no Parquet shard URLs")
        if len(urls) == 1:
            return f"read_parquet({_sql_string(urls[0])})"
        url_list = ", ".join(_sql_string(url) for url in urls)
        return f"read_parquet([{url_list}])"

    def _get_con(self) -> duckdb.DuckDBPyConnection:
        """Return the cached DuckDB connection, building it on first call."""
        if self._con is None:
            self._con = self._build_duckdb_con()
        return self._con

    def _build_duckdb_con(self) -> duckdb.DuckDBPyConnection:
        con = self._create_duckdb_connection()
        try:
            for table in self._tables.values():
                safe_name = _quote_identifier(table.table_name)
                reader_sql = self._build_read_parquet_sql(table.urls)
                logger.info(
                    "Materializing HuggingFace split '%s' into memory (%s rows, %.1f MB Parquet)...",
                    table.table_name,
                    table.num_rows if table.num_rows is not None else "?",
                    table.num_bytes_parquet_files / (1024 * 1024),
                )
                con.execute(f"CREATE OR REPLACE TABLE {safe_name} AS SELECT * FROM {reader_sql};")
                logger.info("Materialized '%s'.", table.table_name)
            return con
        except Exception:
            con.close()
            raise
