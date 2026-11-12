# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Unit tests for the InfluxDB connector and its InfluxQL client."""

import os
from concurrent.futures import ThreadPoolExecutor

import pytest
import requests

from backend.connectors.influxdb_connector import (
    InfluxDbConnector,
    field_column_type,
    plan_measurement,
    table_names_for,
)
from backend.connectors.influxql_client import (
    InfluxDbConfig,
    InfluxQLClient,
    MeasurementSchema,
    describe_measurements,
    list_databases,
    quote_ident,
)
from backend.exceptions import DataSourceConnectionError, InvalidInputError
from backend.tests.unit.connectors.influx_fakes import (  # noqa: F401 (fake_server is a fixture)
    FakeResponse,
    influx_result,
    fake_server,
)

T0 = 1_767_225_600_000_000_000  # 2026-01-01T00:00:00Z in ns


BASE = {"influx_url": "http://influx:8086", "influx_database": "telegraf"}

CPU_MEM = {
    "cpu": {"tags": ["host"], "fields": [("usage", "float"), ("cores", "integer")]},
    "mem": {"tags": ["host"], "fields": [("status", "string"), ("ok", "boolean")]},
}


def _connect(fake_server, tmp_path, measurements=CPU_MEM, chunks=None, **cfg):
    fake = fake_server(measurements, chunks)
    connector = InfluxDbConnector(max_rows=cfg.pop("max_rows", None))
    connector.connect({**BASE, **cfg, "data_dir": str(tmp_path)})
    return connector, fake


class TestInfluxDbConfig:
    def test_url_must_be_http(self):
        with pytest.raises(ValueError, match="http:// or https://"):
            InfluxDbConfig(influx_url="influx:8086", influx_database="db")

    def test_trailing_slash_is_dropped(self):
        assert InfluxDbConfig(influx_url="https://influx:8086/", influx_database="db").influx_url == "https://influx:8086"

    def test_basic_auth_requires_username(self):
        with pytest.raises(ValueError, match="username"):
            InfluxDbConfig(**BASE, influx_auth="basic", influx_password="x")

    def test_token_auth_requires_token(self):
        with pytest.raises(ValueError, match="token"):
            InfluxDbConfig(**BASE, influx_auth="token")

    def test_empty_measurement_selection_is_rejected(self):
        with pytest.raises(ValueError, match="at least one measurement"):
            InfluxDbConfig(**BASE, influx_measurements=[])

    def test_all_time_has_no_condition(self):
        assert InfluxDbConfig(**BASE).time_condition() is None

    @pytest.mark.parametrize("duration", ["30m", "12h", "7d", "4w"])
    def test_last_duration(self, duration):
        cfg = InfluxDbConfig(**BASE, influx_time_mode="last", influx_last=duration)
        assert cfg.time_condition() == f"time >= now() - {duration}"

    @pytest.mark.parametrize("duration", [None, "", "7", "0d", "-1d", "7 days", "1y; DROP"])
    def test_last_rejects_invalid_durations(self, duration):
        with pytest.raises(ValueError, match="duration"):
            InfluxDbConfig(**BASE, influx_time_mode="last", influx_last=duration)

    def test_between_reads_naive_values_as_utc_and_uses_epoch_ns(self):
        # Naive start is UTC; the end's +01:00 offset is converted (02:00+01:00 = 01:00Z).
        cfg = InfluxDbConfig(
            **BASE, influx_time_mode="between",
            influx_start="2026-01-01T00:00:00", influx_end="2026-01-01T02:00:00+01:00",
        )
        assert cfg.time_condition() == f"time >= {T0} AND time < {T0 + 3_600_000_000_000}"

    def test_between_without_end_is_open(self):
        cfg = InfluxDbConfig(**BASE, influx_time_mode="between", influx_start="2026-01-01")
        assert cfg.time_condition() == f"time >= {T0}"

    def test_between_rejects_end_before_start(self):
        with pytest.raises(ValueError, match="after its start"):
            InfluxDbConfig(**BASE, influx_time_mode="between",
                           influx_start="2026-01-02", influx_end="2026-01-01")

    def test_between_rejects_garbage(self):
        with pytest.raises(ValueError, match="ISO 8601"):
            InfluxDbConfig(**BASE, influx_time_mode="between", influx_start="yesterday")


class TestInfluxQLClient:
    def test_quote_ident_escapes_quotes_and_backslashes(self):
        assert quote_ident('disk "io"\\x') == '"disk \\"io\\"\\\\x"'

    def test_token_auth_sets_header(self, fake_server):
        fake = fake_server({})
        InfluxQLClient("http://influx:8086", auth="token", token="tok")
        assert fake.headers["Authorization"] == "Token tok"

    def test_basic_auth_and_tls_verification(self, fake_server):
        fake = fake_server({})
        InfluxQLClient("http://influx:8086", auth="basic", username="u", password="p", verify_ssl=False)
        assert fake.auth == ("u", "p")
        assert fake.verify is False

    def test_rejected_credentials(self, fake_server):
        fake_server({}, status_code=401)
        with pytest.raises(DataSourceConnectionError, match="rejected the credentials.*authorization failed"):
            InfluxQLClient("http://influx:8086").query("SHOW DATABASES")

    def test_statement_errors_are_raised(self, fake_server):
        fake = fake_server({})
        fake.post = lambda *a, **k: FakeResponse(payload=influx_result(error="database not found: x"))
        with pytest.raises(DataSourceConnectionError, match="database not found"):
            InfluxQLClient("http://influx:8086").query("SHOW MEASUREMENTS", "x")

    def test_unreachable_server_message_is_short(self, fake_server):
        fake = fake_server({})

        def refuse(*a, **k):
            raise requests.exceptions.ConnectionError("pool internals ...")

        fake.get = refuse
        with pytest.raises(DataSourceConnectionError) as excinfo:
            InfluxQLClient("http://influx:8086").ping()
        assert "connection failed" in excinfo.value.detail
        assert "pool internals" not in excinfo.value.detail

    def test_list_databases_hides_system_databases(self, fake_server):
        fake_server({})
        assert list_databases(InfluxQLClient("http://influx:8086")) == ["app", "telegraf"]

    def test_describe_merges_field_types_and_drops_empty_measurements(self, fake_server):
        fake_server({
            "conflict": {"tags": ["src"], "fields": [("value", "float"), ("value", "integer")]},
            "deleted": {"tags": [], "fields": []},
        })
        schemas = describe_measurements(InfluxQLClient("http://influx:8086"), "telegraf")
        assert [s.name for s in schemas] == ["conflict"]
        assert schemas[0].fields == {"value": {"float", "integer"}}
        assert schemas[0].tags == ["src"]

    def test_describe_unknown_database_mentions_dbrp(self, fake_server):
        fake_server({})
        with pytest.raises(InvalidInputError, match="DBRP mapping"):
            describe_measurements(InfluxQLClient("http://influx:8086"), "nope")


class TestSchemaMapping:
    @pytest.mark.parametrize("types, expected", [
        ({"float"}, "DOUBLE"),
        ({"integer"}, "BIGINT"),
        ({"unsigned"}, "UBIGINT"),
        ({"boolean"}, "BOOLEAN"),
        ({"string"}, "VARCHAR"),
        ({"float", "integer"}, "DOUBLE"),
        ({"integer", "string"}, "VARCHAR"),
        ({"boolean", "float"}, "VARCHAR"),
    ])
    def test_field_column_type(self, types, expected):
        assert field_column_type(types) == expected

    def test_table_names_are_identifier_safe_and_unique(self):
        assert table_names_for(["disk.io", "disk io", "cpu", "5min", "..."]) == {
            "...": "measurement",
            "5min": "m_5min",
            "cpu": "cpu",
            "disk io": "disk_io",
            "disk.io": "disk_io_2",
        }

    def test_tag_sharing_a_field_key_gets_tag_suffix(self):
        schema = MeasurementSchema("collide", tags=["host", "dc"], fields={"host": {"string"}, "v": {"float"}})
        plan = plan_measurement(schema, "collide")
        assert [(c.name, c.sql_type, c.select_expr) for c in plan.columns] == [
            ("host_tag", "VARCHAR", '"host"::tag'),
            ("dc", "VARCHAR", '"dc"::tag'),
            ("host", "VARCHAR", '"host"::field'),
            ("v", "DOUBLE", '"v"::field'),
        ]


class TestInfluxDbConnector:
    def test_loads_measurements_as_typed_tables(self, fake_server, tmp_path):
        chunks = {
            # columns: time, host, cores, usage
            "cpu": [
                [[T0, "a", 4, 1], [T0 + 1_500, "b", 8, 2.5]],
                [[T0 + 2_000_000_000, "a", None, 3.25]],
            ],
            # columns: time, host, ok, status
            "mem": [[[T0, "a", True, "fine"]]],
        }
        connector, fake = _connect(fake_server, tmp_path, chunks=chunks)

        assert [t.name for t in connector.list_tables()] == ["cpu", "mem"]
        assert [d.name for d in connector.list_databases()] == ["telegraf"]
        columns = connector.list_columns(None, "cpu")
        assert [(c.name, c.data_type, c.is_datetime) for c in columns] == [
            ("time", "TIMESTAMP", True),
            ("host", "VARCHAR", False),
            ("cores", "BIGINT", False),
            ("usage", "DOUBLE", False),
        ]
        table = connector.fetch_data_arrow('SELECT * FROM cpu ORDER BY time')
        rows = table.to_pylist()
        assert len(rows) == 3
        # Nanoseconds are truncated to DuckDB's microseconds.
        assert rows[1]["time"].isoformat() == "2026-01-01T00:00:00.000001"
        assert rows[2]["cores"] is None
        assert rows[0]["usage"] == 1.0
        assert connector.fetch_data("SELECT ok, status FROM mem")[1] == [{"ok": True, "status": "fine"}]
        assert fake.closed

    def test_select_uses_explicit_casts_aliases_and_time_window(self, fake_server, tmp_path):
        _, fake = _connect(
            fake_server, tmp_path, chunks={"cpu": [[[T0, "a", 1, 1.0]]]},
            influx_measurements=["cpu"], influx_time_mode="last", influx_last="7d",
        )
        selects = [d for d in fake.statements if d["q"].startswith("SELECT")]
        assert len(selects) == 1
        assert selects[0]["q"] == (
            'SELECT "host"::tag AS c0, "cores"::field AS c1, "usage"::field AS c2 '
            'FROM "cpu" WHERE time >= now() - 7d'
        )
        assert selects[0]["db"] == "telegraf"

    def test_widened_varchar_field_keeps_every_value(self, fake_server, tmp_path):
        measurements = {"mixed": {"tags": [], "fields": [("v", "string"), ("v", "boolean"), ("v", "float")]}}
        connector, _ = _connect(
            fake_server, tmp_path, measurements,
            chunks={"mixed": [[[T0, "x"], [T0 + 1, True], [T0 + 2, 1.5], [T0 + 3, None]]]},
        )
        values = [r["v"] for r in connector.fetch_data_arrow("SELECT v FROM mixed ORDER BY time").to_pylist()]
        assert values == ["x", "true", "1.5", None]

    def test_measurement_names_become_safe_table_names(self, fake_server, tmp_path):
        measurements = {"disk.io": {"tags": [], "fields": [("read", "integer")]}}
        connector, fake = _connect(fake_server, tmp_path, measurements, chunks={"disk.io": [[[T0, 1]]]})
        assert [t.name for t in connector.list_tables()] == ["disk_io"]
        assert 'FROM "disk.io"' in fake.statements[-1]["q"]

    def test_unknown_measurement_is_rejected_without_leaving_files(self, fake_server, tmp_path):
        with pytest.raises(InvalidInputError, match="ghost"):
            _connect(fake_server, tmp_path, influx_measurements=["cpu", "ghost"])
        assert os.listdir(tmp_path) == []

    def test_empty_time_window_is_an_error(self, fake_server, tmp_path):
        with pytest.raises(InvalidInputError, match="no points"):
            _connect(fake_server, tmp_path, chunks={})
        assert os.listdir(tmp_path) == []

    def test_row_cap_stops_the_load(self, fake_server, tmp_path):
        chunks = {"cpu": [[[T0 + i, "a", 1, 1.0] for i in range(3)]] * 2}
        with pytest.raises(InvalidInputError, match="more than 5 points"):
            _connect(fake_server, tmp_path, chunks=chunks, max_rows=5)
        assert os.listdir(tmp_path) == []

    def test_disconnect_removes_the_data_file(self, fake_server, tmp_path):
        connector, _ = _connect(fake_server, tmp_path, chunks={"cpu": [[[T0, "a", 1, 1.0]]]})
        assert any(name.endswith(".duckdb") for name in os.listdir(tmp_path))
        connector.disconnect()
        assert os.listdir(tmp_path) == []
        assert connector.list_tables() == []
        with pytest.raises(DataSourceConnectionError):
            connector.fetch_data_arrow("SELECT 1")

    def test_queries_run_concurrently(self, fake_server, tmp_path):
        rows = [[T0 + i, "h" + str(i % 3), i, float(i)] for i in range(1_000)]
        connector, _ = _connect(fake_server, tmp_path, chunks={"cpu": [rows]})
        with ThreadPoolExecutor(max_workers=8) as pool:
            counts = list(pool.map(
                lambda _: connector.fetch_data_arrow("SELECT count(*) AS n FROM cpu").to_pylist()[0]["n"],
                range(32),
            ))
        assert counts == [1_000] * 32
