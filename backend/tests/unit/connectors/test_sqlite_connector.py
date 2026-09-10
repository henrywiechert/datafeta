# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Unit tests for SqliteConnector (DuckDB-backed SQLite file access)."""

import sqlite3

import pytest

from backend.connectors.sqlite_connector import SqliteConnector, validate_sqlite_file
from backend.exceptions import DataSourceConnectionError, InvalidInputError


def _write_db(path, script):
    con = sqlite3.connect(str(path))
    try:
        con.executescript(script)
        con.commit()
    finally:
        con.close()
    return str(path)


@pytest.fixture
def shop_db(tmp_path):
    """A small schema with a declared FK and a composite FK."""
    return _write_db(tmp_path / "shop.db", """
        CREATE TABLE customers (
            id INTEGER PRIMARY KEY,
            name TEXT,
            signed_up TIMESTAMP
        );
        CREATE TABLE orders (
            id INTEGER PRIMARY KEY,
            customer_id INTEGER REFERENCES customers(id),
            amount NUMERIC,
            placed_on DATE
        );
        CREATE TABLE order_items (
            order_id INTEGER,
            sku TEXT,
            qty INTEGER,
            PRIMARY KEY (order_id, sku),
            FOREIGN KEY (order_id) REFERENCES orders(id)
        );
        INSERT INTO customers VALUES (1, 'Ada', '2024-01-01 10:00:00');
        INSERT INTO customers VALUES (2, 'Grace', '2024-02-01 10:00:00');
        INSERT INTO orders VALUES (1, 1, 12.5, '2024-03-01');
        INSERT INTO orders VALUES (2, 2, 7.5, '2024-03-02');
        INSERT INTO order_items VALUES (1, 'abc', 3);
    """)


@pytest.fixture
def connected_shop(shop_db):
    connector = SqliteConnector()
    connector.connect({"file_path": shop_db})
    yield connector
    connector.disconnect()


class TestValidateSqliteFile:
    def test_accepts_real_database(self, shop_db):
        validate_sqlite_file(shop_db)  # does not raise

    def test_rejects_file_without_sqlite_header(self, tmp_path):
        path = tmp_path / "notes.db"
        path.write_bytes(b"col_a,col_b\n1,2\n")
        with pytest.raises(InvalidInputError, match="SQLite format 3"):
            validate_sqlite_file(str(path))

    def test_rejects_truncated_database(self, tmp_path, shop_db):
        truncated = tmp_path / "broken.db"
        with open(shop_db, "rb") as source:
            truncated.write_bytes(source.read(100))
        with pytest.raises(InvalidInputError):
            validate_sqlite_file(str(truncated))


class TestConnect:
    def test_connect_lists_every_table(self, connected_shop):
        names = sorted(t.name for t in connected_shop.list_tables())
        assert names == ["customers", "order_items", "orders"]

    def test_connect_reports_no_databases(self, connected_shop):
        assert connected_shop.list_databases() == []

    def test_connect_includes_views(self, tmp_path):
        path = _write_db(tmp_path / "with_view.db", """
            CREATE TABLE t (id INTEGER PRIMARY KEY, v INTEGER);
            CREATE VIEW doubled AS SELECT id, v * 2 AS v FROM t;
            INSERT INTO t VALUES (1, 21);
        """)
        connector = SqliteConnector()
        connector.connect({"file_path": path})
        try:
            assert sorted(t.name for t in connector.list_tables()) == ["doubled", "t"]
            _, rows = connector.fetch_data('SELECT v FROM "doubled"')
            assert rows == [{"v": 42}]
        finally:
            connector.disconnect()

    def test_connect_skips_sqlite_internal_tables(self, tmp_path):
        path = _write_db(tmp_path / "autoinc.db", """
            CREATE TABLE t (id INTEGER PRIMARY KEY AUTOINCREMENT, v TEXT);
            INSERT INTO t (v) VALUES ('x');
        """)
        connector = SqliteConnector()
        connector.connect({"file_path": path})
        try:
            assert [t.name for t in connector.list_tables()] == ["t"]
        finally:
            connector.disconnect()

    def test_connect_requires_file_path(self):
        with pytest.raises(InvalidInputError, match="No SQLite database file"):
            SqliteConnector().connect({})

    def test_connect_rejects_missing_file(self, tmp_path):
        with pytest.raises(DataSourceConnectionError, match="not found"):
            SqliteConnector().connect({"file_path": str(tmp_path / "absent.db")})

    def test_connect_rejects_empty_database(self, tmp_path):
        path = _write_db(tmp_path / "empty.db", "CREATE TABLE t (id INTEGER); DROP TABLE t;")
        with pytest.raises(DataSourceConnectionError, match="no tables"):
            SqliteConnector().connect({"file_path": path})

    def test_disconnect_clears_state(self, shop_db):
        connector = SqliteConnector()
        connector.connect({"file_path": shop_db})
        connector.disconnect()
        assert connector.list_tables() == []


class TestListColumns:
    def test_maps_declared_types(self, connected_shop):
        columns = {c.name: c for c in connected_shop.list_columns(None, "orders")}
        assert columns["id"].data_type == "BIGINT"
        assert columns["amount"].data_type == "DOUBLE"
        assert columns["placed_on"].data_type == "DATE"

    def test_flags_datetime_columns(self, connected_shop):
        columns = {c.name: c for c in connected_shop.list_columns(None, "customers")}
        assert columns["signed_up"].is_datetime is True
        assert columns["name"].is_datetime is False

    def test_unknown_table_is_rejected(self, connected_shop):
        with pytest.raises(InvalidInputError, match="not found"):
            connected_shop.list_columns(None, "nope")

    def test_untyped_column_becomes_varchar(self, tmp_path):
        # A column declared without a type has no SQLite affinity, which the
        # DuckDB scanner surfaces as BLOB; it must read back as text.
        path = _write_db(tmp_path / "untyped.db", """
            CREATE TABLE notes (id INTEGER PRIMARY KEY, body, tag TEXT);
            INSERT INTO notes VALUES (1, 'hello', 'greeting');
        """)
        connector = SqliteConnector()
        connector.connect({"file_path": path})
        try:
            columns = {c.name: c for c in connector.list_columns(None, "notes")}
            assert columns["body"].data_type == "VARCHAR"
            _, rows = connector.fetch_data('SELECT body FROM "notes"')
            assert rows == [{"body": "hello"}]
        finally:
            connector.disconnect()


class TestForeignKeyDetection:
    def test_returns_declared_foreign_keys(self, connected_shop):
        relationships = connected_shop.detect_foreign_keys()
        pairs = {
            (r.from_table, tuple(r.from_columns), r.to_table, tuple(r.to_columns))
            for r in relationships
        }
        assert ("orders", ("customer_id",), "customers", ("id",)) in pairs
        assert ("order_items", ("order_id",), "orders", ("id",)) in pairs

    def test_resolves_implicit_primary_key_target(self, tmp_path):
        path = _write_db(tmp_path / "implicit.db", """
            CREATE TABLE parent (pid INTEGER PRIMARY KEY, label TEXT);
            CREATE TABLE child (cid INTEGER PRIMARY KEY, parent_ref INTEGER REFERENCES parent);
        """)
        connector = SqliteConnector()
        connector.connect({"file_path": path})
        try:
            relationships = connector.detect_foreign_keys()
            assert len(relationships) == 1
            assert relationships[0].from_columns == ["parent_ref"]
            assert relationships[0].to_columns == ["pid"]
        finally:
            connector.disconnect()

    def test_reads_composite_foreign_key_in_column_order(self, tmp_path):
        path = _write_db(tmp_path / "composite.db", """
            CREATE TABLE parts (part_no TEXT, revision INTEGER, PRIMARY KEY (part_no, revision));
            CREATE TABLE usages (
                id INTEGER PRIMARY KEY,
                part_no TEXT,
                revision INTEGER,
                FOREIGN KEY (part_no, revision) REFERENCES parts (part_no, revision)
            );
        """)
        connector = SqliteConnector()
        connector.connect({"file_path": path})
        try:
            relationships = connector.detect_foreign_keys()
            assert len(relationships) == 1
            assert relationships[0].from_columns == ["part_no", "revision"]
            assert relationships[0].to_columns == ["part_no", "revision"]
        finally:
            connector.disconnect()

    def test_falls_back_to_naming_heuristic_without_constraints(self, tmp_path):
        path = _write_db(tmp_path / "noconstraints.db", """
            CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT);
            CREATE TABLE orders (id INTEGER PRIMARY KEY, customer_id INTEGER, amount REAL);
        """)
        connector = SqliteConnector()
        connector.connect({"file_path": path})
        try:
            relationships = connector.detect_foreign_keys()
            assert [
                (r.from_table, r.from_columns, r.to_table, r.to_columns)
                for r in relationships
            ] == [("orders", ["customer_id"], "customers", ["id"])]
        finally:
            connector.disconnect()

    def test_no_relationships_when_disconnected(self):
        assert SqliteConnector().detect_foreign_keys() == []


class TestQueryExecution:
    def test_unqualified_table_names_resolve(self, connected_shop):
        columns, rows = connected_shop.fetch_data('SELECT COUNT(*) AS n FROM "orders"')
        assert rows == [{"n": 2}]
        assert columns[0]["name"] == "n"

    def test_join_across_tables(self, connected_shop):
        _, rows = connected_shop.fetch_data(
            'SELECT c."name" AS name, SUM(o."amount") AS total '
            'FROM "orders" o JOIN "customers" c ON o."customer_id" = c."id" '
            'GROUP BY c."name" ORDER BY c."name"'
        )
        assert rows == [{"name": "Ada", "total": 12.5}, {"name": "Grace", "total": 7.5}]

    def test_fetch_data_arrow_returns_arrow_table(self, connected_shop):
        table = connected_shop.fetch_data_arrow('SELECT "id" FROM "customers" ORDER BY "id"')
        assert table.num_rows == 2
        assert table.column("id").to_pylist() == [1, 2]

    def test_query_without_connection_fails(self):
        with pytest.raises(DataSourceConnectionError, match="Not connected"):
            SqliteConnector().fetch_data("SELECT 1")

    def test_writes_are_rejected(self, connected_shop):
        # The database is attached read-only, so a visualization query can
        # never modify the user's file.
        with pytest.raises(Exception):
            connected_shop.fetch_data('DELETE FROM "orders"')

        _, rows = connected_shop.fetch_data('SELECT COUNT(*) AS n FROM "orders"')
        assert rows == [{"n": 2}]
