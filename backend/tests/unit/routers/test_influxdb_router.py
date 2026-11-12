# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Unit tests for the InfluxDB pre-connect discovery endpoints."""

import asyncio

import pytest

from backend.exceptions import InvalidInputError
from backend.routers import influxdb as influxdb_router
from backend.tests.unit.connectors.influx_fakes import fake_server  # noqa: F401 (fixture)

SERVER = {"influx_url": "http://influx:8086", "influx_auth": "token", "influx_token": "tok"}


def _run(coro):
    return asyncio.run(coro)


class TestInfluxDbDiscovery:
    def test_databases_lists_user_databases_and_version(self, fake_server):
        fake = fake_server({})
        response = _run(influxdb_router.list_influxdb_databases(dict(SERVER)))
        assert response == {"server_version": "v2.7.12", "databases": ["app", "telegraf"]}
        assert fake.headers["Authorization"] == "Token tok"
        assert fake.closed

    def test_measurements_report_table_names_and_counts(self, fake_server):
        fake_server({
            "disk.io": {"tags": ["dev"], "fields": [("read", "integer"), ("write", "integer")]},
            "cpu": {"tags": ["host", "cpu"], "fields": [("usage", "float")]},
        })
        response = _run(influxdb_router.list_influxdb_measurements({**SERVER, "influx_database": "telegraf"}))
        assert response == {"measurements": [
            {"name": "cpu", "table_name": "cpu", "tag_count": 2, "field_count": 1},
            {"name": "disk.io", "table_name": "disk_io", "tag_count": 1, "field_count": 2},
        ]}

    def test_measurements_require_a_database(self, fake_server):
        fake_server({})
        with pytest.raises(InvalidInputError, match="influx_database") as excinfo:
            _run(influxdb_router.list_influxdb_measurements(dict(SERVER)))
        assert excinfo.value.status_code == 422

    def test_invalid_server_details_are_422(self):
        with pytest.raises(InvalidInputError, match="http:// or https://") as excinfo:
            _run(influxdb_router.list_influxdb_databases({"influx_url": "ftp://x"}))
        assert excinfo.value.status_code == 422

    def test_refused_when_connector_is_disabled(self, fake_server, monkeypatch):
        fake = fake_server({})
        monkeypatch.setattr(influxdb_router, "is_connector_allowed", lambda connector_id: False)
        with pytest.raises(InvalidInputError, match="disabled") as excinfo:
            _run(influxdb_router.list_influxdb_databases(dict(SERVER)))
        assert excinfo.value.status_code == 403
        assert fake.statements == []
