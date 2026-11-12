# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Unit tests for connector registry plugin metadata."""

from types import SimpleNamespace

from backend.connectors.registry import get_connector_registry


class TestConnectorRegistrySpecs:
    def test_csv_spec_declares_plugin_hooks(self):
        spec = get_connector_registry().get_spec("csv")
        assert spec.capabilities.supports_multipart_connect is True
        assert spec.capabilities.supports_incremental_file_add is True
        assert spec.build_multipart_connect_args is not None

    def test_kaggle_spec_builds_session_scoped_download_dir(self, tmp_path):
        spec = get_connector_registry().get_spec("kaggle")
        cfg = spec.config_model(
            kaggle_username="user",
            kaggle_api_key="secret",
            kaggle_dataset="owner/dataset",
        )
        request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(upload_root_dir=str(tmp_path))))
        connect_args = spec.build_connect_args(cfg, request, "session-1")
        assert connect_args["download_dir"] == str(tmp_path / "session-1")

    def test_kaggle_spec_passes_csv_parsing_options(self, tmp_path):
        spec = get_connector_registry().get_spec("kaggle")
        cfg = spec.config_model(
            kaggle_username="user",
            kaggle_api_key="secret",
            kaggle_dataset="owner/dataset",
            csv_date_format="%d.%m.%Y",
            csv_timestamp_format="%d.%m.%Y %H:%M:%S",
        )
        request = SimpleNamespace(
            app=SimpleNamespace(state=SimpleNamespace(upload_root_dir=str(tmp_path)))
        )
        connect_args = spec.build_connect_args(cfg, request, "session-1")
        assert connect_args["csv_date_format"] == "%d.%m.%Y"
        assert connect_args["csv_timestamp_format"] == "%d.%m.%Y %H:%M:%S"


class TestInfluxDbSpec:
    def test_influxdb_spec_is_duckdb_backed_json_connector(self):
        spec = get_connector_registry().get_spec("influxdb")
        assert spec.dialect.name == "duckdb"
        assert spec.capabilities.supports_json_connect is True
        assert spec.capabilities.supports_multipart_connect is False

    def test_influxdb_spec_builds_session_scoped_data_dir(self, tmp_path):
        spec = get_connector_registry().get_spec("influxdb")
        cfg = spec.config_model(
            influx_url="http://influx:8086",
            influx_auth="token",
            influx_token="secret",
            influx_database="telegraf",
            influx_time_mode="last",
            influx_last="7d",
        )
        request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(upload_root_dir=str(tmp_path))))
        connect_args = spec.build_connect_args(cfg, request, "session-1")
        assert connect_args["data_dir"] == str(tmp_path / "session-1")
        assert (tmp_path / "session-1").is_dir()
        assert connect_args["influx_token"] == "secret"
        assert connect_args["influx_last"] == "7d"

    def test_influxdb_config_validates_from_connection_details(self):
        from backend.models.data_source import ConnectionDetails

        details = ConnectionDetails(
            type="influxdb",
            influx_url="http://influx:8086/",
            influx_database="telegraf",
            influx_measurements=["cpu"],
        )
        spec = get_connector_registry().get_spec("influxdb")
        cfg = spec.config_model.model_validate(details.model_dump())
        assert cfg.influx_url == "http://influx:8086"
        assert cfg.influx_auth == "none"
        assert cfg.influx_verify_ssl is True
        assert cfg.influx_measurements == ["cpu"]
