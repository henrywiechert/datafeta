# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Unit tests for the path-based DuckDB database connector."""

import os

import duckdb
import pytest

from backend.connectors.duckdb_connector import DuckDbConnector
from backend.exceptions import DataSourceConnectionError, InvalidInputError


def _create_sample_db(path: str) -> None:
    con = duckdb.connect(path)
    con.execute("CREATE SCHEMA analytics")
    con.execute("CREATE TABLE analytics.items (id INTEGER, name VARCHAR, ts TIMESTAMP)")
    con.execute("INSERT INTO analytics.items VALUES (1, 'alpha', TIMESTAMP '2024-01-01 12:00:00')")
    con.execute("CREATE VIEW analytics.items_v AS SELECT id, name FROM analytics.items")
    con.execute("CREATE TABLE main.misc (x INTEGER)")
    con.close()


@pytest.fixture
def sample_db(tmp_path):
    db_path = tmp_path / "sample.duckdb"
    _create_sample_db(str(db_path))
    return str(db_path)


class TestDuckDbConnector:
    def test_connect_and_list_schemas_tables_columns(self, sample_db):
        connector = DuckDbConnector()
        connector.connect({"database_path": sample_db})

        schemas = [db.name for db in connector.list_databases()]
        assert "main" in schemas
        assert "analytics" in schemas
        assert "information_schema" not in schemas

        tables = [t.name for t in connector.list_tables("analytics")]
        assert "items" in tables
        assert "items_v" in tables

        columns = connector.list_columns("analytics", "items")
        names = {c.name: c for c in columns}
        assert "id" in names
        assert "name" in names
        assert "ts" in names
        assert names["ts"].is_datetime is True

        connector.disconnect()

    def test_fetch_data_and_arrow(self, sample_db):
        connector = DuckDbConnector()
        connector.connect({"database_path": sample_db})

        columns, rows = connector.fetch_data('SELECT id, name FROM "analytics"."items" ORDER BY id')
        assert len(columns) == 2
        assert rows == [{"id": 1, "name": "alpha"}]

        arrow = connector.fetch_data_arrow('SELECT COUNT(*) AS n FROM "analytics"."items_v"')
        assert arrow.num_rows == 1
        assert arrow.column("n")[0].as_py() == 1

        connector.disconnect()

    def test_missing_file_raises(self, tmp_path):
        connector = DuckDbConnector()
        with pytest.raises(DataSourceConnectionError, match="not found"):
            connector.connect({"database_path": str(tmp_path / "missing.duckdb")})

    def test_relative_path_rejected(self, sample_db, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        connector = DuckDbConnector()
        with pytest.raises(InvalidInputError, match="absolute"):
            connector.connect({"database_path": "sample.duckdb"})

    def test_memory_rejected(self):
        connector = DuckDbConnector()
        with pytest.raises(InvalidInputError, match="local DuckDB"):
            connector.connect({"database_path": ":memory:"})

    def test_allowlist_blocks_outside_root(self, sample_db, tmp_path, monkeypatch):
        allowed = tmp_path / "allowed"
        allowed.mkdir()
        monkeypatch.setenv("DUCKDB_ALLOWED_ROOTS", str(allowed))
        connector = DuckDbConnector()
        with pytest.raises(InvalidInputError, match="allowed roots"):
            connector.connect({"database_path": sample_db})

    def test_allowlist_allows_inside_root(self, sample_db, tmp_path, monkeypatch):
        monkeypatch.setenv("DUCKDB_ALLOWED_ROOTS", str(tmp_path))
        connector = DuckDbConnector()
        connector.connect({"database_path": sample_db})
        assert connector.list_databases()
        connector.disconnect()

    def test_symlink_escape_blocked(self, sample_db, tmp_path, monkeypatch):
        allowed = tmp_path / "allowed"
        allowed.mkdir()
        outside = tmp_path / "outside.duckdb"
        # sample_db is already under tmp_path; place a copy outside allowed and link from allowed
        import shutil
        shutil.copy(sample_db, outside)
        link = allowed / "escape.duckdb"
        os.symlink(outside, link)

        monkeypatch.setenv("DUCKDB_ALLOWED_ROOTS", str(allowed))
        connector = DuckDbConnector()
        with pytest.raises(InvalidInputError, match="allowed roots"):
            connector.connect({"database_path": str(link)})

    def test_list_tables_requires_schema(self, sample_db):
        connector = DuckDbConnector()
        connector.connect({"database_path": sample_db})
        with pytest.raises(InvalidInputError, match="database"):
            connector.list_tables(None)
        connector.disconnect()

    def test_query_before_connect_raises(self):
        connector = DuckDbConnector()
        with pytest.raises(DataSourceConnectionError):
            connector.fetch_data("SELECT 1")


class TestPathSafetyHelpers:
    def test_parse_allowed_roots(self):
        from backend.utils.path_safety import parse_allowed_roots

        assert parse_allowed_roots(None) == []
        assert parse_allowed_roots("") == []
        assert parse_allowed_roots(" /a , /b ") == ["/a", "/b"]
