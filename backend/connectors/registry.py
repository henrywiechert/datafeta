"""Central connector registry (plugin entrypoint).

The registry is the single source of truth for:
- supported connector ids
- connector specs (dialect, capabilities, config models)
- connector factories
"""

from __future__ import annotations

import logging
from typing import Dict, List, Optional

from pydantic import BaseModel, Field, model_validator

from backend.connectors.base import BaseConnector
from backend.connectors.clickhouse_connector import ClickHouseConnector
from backend.connectors.file_connector import FileConnector
from backend.connectors.hive_parquet_connector import HiveParquetConnector
from backend.connectors.kaggle_connector import KaggleConnector
from backend.dependencies import ConnectionStateManager
from backend.dialects import ClickHouseDialect, DuckDbDialect
from backend.exceptions import InvalidInputError

from backend.connectors.spec import ConnectorCapabilities, ConnectorSpec

logger = logging.getLogger(__name__)


class ClickHouseConfig(BaseModel):
    connection_string: Optional[str] = None
    host: Optional[str] = None
    port: Optional[int] = 8123
    user: Optional[str] = "default"
    password: Optional[str] = ""
    database: Optional[str] = "default"

    @model_validator(mode="after")
    def _validate_required(self):
        if not self.connection_string and not self.host:
            raise ValueError("Either connection_string or host must be provided for ClickHouse")
        return self


class KaggleConfig(BaseModel):
    kaggle_username: str = Field(..., min_length=1)
    kaggle_api_key: str = Field(..., min_length=1)
    kaggle_dataset: str = Field(..., min_length=1)
    kaggle_csv_files: Optional[List[str]] = None


class HiveParquetConfig(BaseModel):
    hive_file_structure: List[str] = Field(..., min_length=1)


class CsvConfig(BaseModel):
    # CSV connections require multipart upload (files); JSON connect is not supported.
    csv_delimiter: Optional[str] = ","
    csv_has_header: Optional[bool] = True
    csv_decimal_separator: Optional[str] = "."
    csv_thousands_separator: Optional[str] = ""
    csv_date_format: Optional[str] = "%Y-%m-%d"
    csv_timestamp_format: Optional[str] = "%Y-%m-%d %H:%M:%S"


class ConnectorRegistry:
    def __init__(self) -> None:
        self._specs: Dict[str, ConnectorSpec] = {}

    def register(self, spec: ConnectorSpec) -> None:
        self._specs[spec.id] = spec

    def get_spec(self, connector_id: str) -> ConnectorSpec:
        spec = self._specs.get(connector_id)
        if not spec:
            raise InvalidInputError(f"Unsupported data source type: {connector_id}")
        return spec

    def create(self, connector_id: str, state_manager: ConnectionStateManager) -> BaseConnector:
        return self.get_spec(connector_id).factory(state_manager)

    def list_specs(self) -> Dict[str, ConnectorSpec]:
        return dict(self._specs)


_REGISTRY: Optional[ConnectorRegistry] = None


def get_connector_registry() -> ConnectorRegistry:
    global _REGISTRY
    if _REGISTRY is not None:
        return _REGISTRY

    registry = ConnectorRegistry()

    clickhouse_dialect = ClickHouseDialect()
    duckdb_dialect = DuckDbDialect()

    registry.register(
        ConnectorSpec(
            id="clickhouse",
            display_name="ClickHouse",
            dialect=clickhouse_dialect,
            capabilities=ConnectorCapabilities(
                supports_json_connect=True,
                supports_multipart_connect=False,
                supports_databases=True,
                supports_arrow=True,
            ),
            config_model=ClickHouseConfig,
            factory=lambda _sm: ClickHouseConnector(),
            build_connect_args=lambda cfg, _sm, _request, _session_id: cfg.model_dump(exclude_none=True),
        )
    )

    registry.register(
        ConnectorSpec(
            id="csv",
            display_name="CSV / Parquet (DuckDB)",
            dialect=duckdb_dialect,
            capabilities=ConnectorCapabilities(
                supports_json_connect=False,
                supports_multipart_connect=True,
                supports_databases=False,
                supports_arrow=True,
            ),
            config_model=CsvConfig,
            factory=lambda sm: FileConnector(state_manager=sm),
            build_connect_args=None,
        )
    )

    registry.register(
        ConnectorSpec(
            id="kaggle",
            display_name="Kaggle (DuckDB)",
            dialect=duckdb_dialect,
            capabilities=ConnectorCapabilities(
                supports_json_connect=True,
                supports_multipart_connect=False,
                supports_databases=False,
                supports_arrow=True,
            ),
            config_model=KaggleConfig,
            factory=lambda sm: KaggleConnector(state_manager=sm),
            # build_connect_args is handled by ConnectionService because it needs
            # a session-scoped download_dir.
            build_connect_args=None,
        )
    )

    registry.register(
        ConnectorSpec(
            id="hive_parquet",
            display_name="Hive Parquet (DuckDB)",
            dialect=duckdb_dialect,
            capabilities=ConnectorCapabilities(
                supports_json_connect=True,
                supports_multipart_connect=True,
                supports_databases=False,
                supports_arrow=True,
            ),
            config_model=HiveParquetConfig,
            factory=lambda sm: HiveParquetConnector(state_manager=sm),
            build_connect_args=lambda cfg, _sm, _request, _session_id: cfg.model_dump(exclude_none=True),
        )
    )

    _REGISTRY = registry
    return registry

