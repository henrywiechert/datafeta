# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Unit tests for FileConnector with multi-file and parquet support."""

import os
import pytest
import tempfile
import pyarrow as pa
import pyarrow.parquet as pq

from backend.connectors.file_connector import FileConnector, FileInfo
from backend.connectors.file_handlers import CsvFileHandler, ParquetFileHandler
from backend.exceptions import DataSourceConnectionError, InvalidInputError


class TestFileConnectorInit:
    """Tests for FileConnector initialization."""

    def test_init_creates_empty_file_list(self):
        """Test that FileConnector initializes with empty file list."""
        connector = FileConnector()
        assert connector._files == []


class TestSanitizeTableName:
    """Tests for table name sanitization."""

    def test_sanitize_removes_extension(self):
        """Test that file extension is removed."""
        connector = FileConnector()
        assert connector._sanitize_table_name("data.csv") == "data"
        assert connector._sanitize_table_name("data.parquet") == "data"

    def test_sanitize_handles_spaces(self):
        """Test that spaces are replaced with underscores."""
        connector = FileConnector()
        assert connector._sanitize_table_name("my data file.csv") == "my_data_file"

    def test_sanitize_handles_special_chars(self):
        """Test that special characters are replaced."""
        connector = FileConnector()
        assert connector._sanitize_table_name("data-2024@v1.csv") == "data_2024_v1"

    def test_sanitize_handles_leading_numbers(self):
        """Test that leading numbers get prefix."""
        connector = FileConnector()
        assert connector._sanitize_table_name("2024_data.csv") == "table_2024_data"

    def test_sanitize_empty_name(self):
        """Test that names that sanitize to empty get default value."""
        connector = FileConnector()
        # A name made of only special characters reduces to empty after sanitization
        assert connector._sanitize_table_name("---.csv") == "uploaded_file"


class TestCsvConnect:
    """Tests for CSV file connection."""

    def test_connect_single_csv_file(self, tmp_path):
        """Test connecting to a single CSV file."""
        # Create a temp CSV file
        csv_path = tmp_path / "test.csv"
        csv_path.write_text("col1,col2\n1,2\n3,4")

        connector = FileConnector()
        
        connector.connect({
            "file_path": str(csv_path),
            "original_filename": "test.csv",
        })

        assert len(connector._files) == 1
        assert connector._files[0].handler.file_type == "csv"
        assert connector._files[0].table_name == "test"

    def test_connect_with_csv_config(self, tmp_path):
        """Test that CSV config is applied."""
        csv_path = tmp_path / "test.csv"
        csv_path.write_text("col1;col2\n1,5;2,5")

        connector = FileConnector()
        
        connector.connect({
            "file_path": str(csv_path),
            "original_filename": "test.csv",
            "csv_delimiter": ";",
            "csv_decimal_separator": ",",
        })

        assert isinstance(connector._files[0].handler, CsvFileHandler)
        assert connector._files[0].handler.config["delimiter"] == ";"
        assert connector._files[0].handler.config["decimal_separator"] == ","

    @pytest.mark.parametrize("trim_numeric_whitespace", [False, True])
    def test_header_containing_double_quote(self, tmp_path, trim_numeric_whitespace):
        """Header names are data; a literal double quote must not break the view SQL."""
        csv_path = tmp_path / "test.csv"
        csv_path.write_text('id,"say ""hi""",n\n1,a,2 \n')

        connector = FileConnector()
        connector.connect({
            "file_path": str(csv_path),
            "original_filename": "test.csv",
            "csv_trim_numeric_whitespace": trim_numeric_whitespace,
        })

        _, rows = connector.fetch_data('SELECT * FROM "test"')
        assert rows[0]['say "hi"'] == "a"


class TestParquetConnect:
    """Tests for Parquet file connection."""

    def test_connect_single_parquet_file(self, tmp_path):
        """Test connecting to a single Parquet file."""
        # Create a temp Parquet file
        parquet_path = tmp_path / "test.parquet"
        table = pa.table({"col1": [1, 2, 3], "col2": ["a", "b", "c"]})
        pq.write_table(table, parquet_path)

        connector = FileConnector()
        
        connector.connect({
            "file_path": str(parquet_path),
            "original_filename": "test.parquet",
        })

        assert len(connector._files) == 1
        assert connector._files[0].handler.file_type == "parquet"
        assert connector._files[0].table_name == "test"

    def test_parquet_uses_parquet_handler(self, tmp_path):
        """Test that Parquet files use ParquetFileHandler."""
        parquet_path = tmp_path / "test.parquet"
        table = pa.table({"col1": [1, 2]})
        pq.write_table(table, parquet_path)

        connector = FileConnector()
        
        connector.connect({
            "file_path": str(parquet_path),
            "original_filename": "test.parquet",
        })

        assert isinstance(connector._files[0].handler, ParquetFileHandler)


class TestMultiFileConnect:
    """Tests for multi-file connection."""

    def test_connect_multiple_csv_files(self, tmp_path):
        """Test connecting to multiple CSV files."""
        # Create temp CSV files
        csv1 = tmp_path / "data1.csv"
        csv2 = tmp_path / "data2.csv"
        csv1.write_text("col1,col2\n1,2")
        csv2.write_text("col1,col2\n3,4")

        connector = FileConnector()
        
        connector.connect({
            "file_paths": [
                {"file_path": str(csv1), "original_filename": "data1.csv"},
                {"file_path": str(csv2), "original_filename": "data2.csv"},
            ]
        })

        assert len(connector._files) == 2
        table_names = [f.table_name for f in connector._files]
        assert "data1" in table_names
        assert "data2" in table_names

    def test_connect_mixed_csv_parquet(self, tmp_path):
        """Test connecting to mixed CSV and Parquet files."""
        csv_path = tmp_path / "data.csv"
        csv_path.write_text("col1,col2\n1,2")
        
        parquet_path = tmp_path / "data.parquet"
        table = pa.table({"col1": [1, 2]})
        pq.write_table(table, parquet_path)

        connector = FileConnector()
        
        connector.connect({
            "file_paths": [
                {"file_path": str(csv_path), "original_filename": "data.csv"},
                {"file_path": str(parquet_path), "original_filename": "data.parquet"},
            ]
        })

        assert len(connector._files) == 2
        file_types = [f.handler.file_type for f in connector._files]
        assert "csv" in file_types
        assert "parquet" in file_types

    def test_connect_unique_table_names(self, tmp_path):
        """Test that duplicate filenames get unique table names."""
        csv1 = tmp_path / "subdir1" / "data.csv"
        csv2 = tmp_path / "subdir2" / "data.csv"
        csv1.parent.mkdir()
        csv2.parent.mkdir()
        csv1.write_text("col1,col2\n1,2")
        csv2.write_text("col1,col2\n3,4")

        connector = FileConnector()
        
        connector.connect({
            "file_paths": [
                {"file_path": str(csv1), "original_filename": "data.csv"},
                {"file_path": str(csv2), "original_filename": "data.csv"},
            ]
        })

        assert len(connector._files) == 2
        table_names = [f.table_name for f in connector._files]
        # Second file should have suffix
        assert "data" in table_names
        assert "data_2" in table_names


class TestListTables:
    """Tests for listing tables."""

    def test_list_tables_returns_all_files(self, tmp_path):
        """Test that list_tables returns all uploaded files."""
        csv1 = tmp_path / "table1.csv"
        csv2 = tmp_path / "table2.csv"
        csv1.write_text("col1\n1")
        csv2.write_text("col1\n2")

        connector = FileConnector()
        
        connector.connect({
            "file_paths": [
                {"file_path": str(csv1), "original_filename": "table1.csv"},
                {"file_path": str(csv2), "original_filename": "table2.csv"},
            ]
        })

        tables = connector.list_tables()
        assert len(tables) == 2
        table_names = [t.name for t in tables]
        assert "table1" in table_names
        assert "table2" in table_names


class TestListColumns:
    """Tests for listing columns."""

    def test_list_columns_csv(self, tmp_path):
        """Test listing columns from CSV file."""
        csv_path = tmp_path / "test.csv"
        csv_path.write_text("name,age,active\nAlice,30,true")

        connector = FileConnector()
        
        connector.connect({
            "file_path": str(csv_path),
            "original_filename": "test.csv",
        })

        columns = connector.list_columns(table="test")
        col_names = [c.name for c in columns]
        assert "name" in col_names
        assert "age" in col_names
        assert "active" in col_names

    def test_list_columns_parquet(self, tmp_path):
        """Test listing columns from Parquet file."""
        parquet_path = tmp_path / "test.parquet"
        table = pa.table({
            "name": ["Alice", "Bob"],
            "score": [95.5, 87.3],
            "active": [True, False],
        })
        pq.write_table(table, parquet_path)

        connector = FileConnector()
        
        connector.connect({
            "file_path": str(parquet_path),
            "original_filename": "test.parquet",
        })

        columns = connector.list_columns(table="test")
        col_names = [c.name for c in columns]
        assert "name" in col_names
        assert "score" in col_names
        assert "active" in col_names

    def test_list_columns_keeps_trailing_whitespace_float_as_varchar_by_default(self, tmp_path):
        """Trailing-whitespace numeric repair is opt-in because it scans VARCHAR
        columns and can change numeric-looking identifiers."""
        csv_path = tmp_path / "test.csv"
        csv_path.write_text("value\n123.5 \n124.5 \n125.0 \n")

        connector = FileConnector()

        connector.connect({
            "file_path": str(csv_path),
            "original_filename": "test.csv",
        })

        columns = connector.list_columns(table="test")
        assert columns[0].data_type == "VARCHAR"

    def test_list_columns_infers_float_with_trailing_whitespace_when_enabled(self, tmp_path):
        """DuckDB's CSV sniffer misses DOUBLE when values have trailing whitespace
        (e.g. "123.5 "); when enabled, the connector should infer DOUBLE."""
        csv_path = tmp_path / "test.csv"
        csv_path.write_text("value\n123.5 \n124.5 \n125.0 \n")

        connector = FileConnector()

        connector.connect({
            "file_path": str(csv_path),
            "original_filename": "test.csv",
            "csv_trim_numeric_whitespace": True,
        })

        columns = connector.list_columns(table="test")
        assert columns[0].data_type == "DOUBLE"

        _, rows = connector.fetch_data('SELECT * FROM "test"')
        assert [row["value"] for row in rows] == [123.5, 124.5, 125.0]

    def test_list_columns_keeps_genuinely_mixed_column_as_varchar(self, tmp_path):
        """A column with real non-numeric values must stay VARCHAR, not be
        force-cast just because some rows also have trailing whitespace."""
        csv_path = tmp_path / "test.csv"
        csv_path.write_text("value\n123.5 \nnotanumber \n")

        connector = FileConnector()

        connector.connect({
            "file_path": str(csv_path),
            "original_filename": "test.csv",
            "csv_trim_numeric_whitespace": True,
        })

        columns = connector.list_columns(table="test")
        assert columns[0].data_type == "VARCHAR"

        _, rows = connector.fetch_data('SELECT * FROM "test"')
        assert [row["value"] for row in rows] == [123.5, "notanumber "]

    def test_list_columns_unknown_table_raises(self, tmp_path):
        """Test that listing columns for unknown table raises error."""
        csv_path = tmp_path / "test.csv"
        csv_path.write_text("col1\n1")

        connector = FileConnector()
        
        connector.connect({
            "file_path": str(csv_path),
            "original_filename": "test.csv",
        })

        with pytest.raises(InvalidInputError):
            connector.list_columns(table="nonexistent")


class TestFetchData:
    """Tests for fetching data."""

    def test_fetch_data_csv(self, tmp_path):
        """Test fetching data from CSV file."""
        csv_path = tmp_path / "test.csv"
        csv_path.write_text("id,value\n1,100\n2,200")

        connector = FileConnector()
        
        connector.connect({
            "file_path": str(csv_path),
            "original_filename": "test.csv",
        })

        columns, rows = connector.fetch_data('SELECT * FROM "test"')
        assert len(rows) == 2
        assert rows[0]["id"] == 1
        assert rows[0]["value"] == 100

    def test_fetch_data_parquet(self, tmp_path):
        """Test fetching data from Parquet file."""
        parquet_path = tmp_path / "test.parquet"
        table = pa.table({"id": [1, 2], "value": [100, 200]})
        pq.write_table(table, parquet_path)

        connector = FileConnector()
        
        connector.connect({
            "file_path": str(parquet_path),
            "original_filename": "test.parquet",
        })

        columns, rows = connector.fetch_data('SELECT * FROM "test"')
        assert len(rows) == 2
        assert rows[0]["id"] == 1
        assert rows[0]["value"] == 100

    def test_fetch_data_with_filter(self, tmp_path):
        """Test fetching data with WHERE clause."""
        parquet_path = tmp_path / "test.parquet"
        table = pa.table({"id": [1, 2, 3], "value": [100, 200, 300]})
        pq.write_table(table, parquet_path)

        connector = FileConnector()
        
        connector.connect({
            "file_path": str(parquet_path),
            "original_filename": "test.parquet",
        })

        columns, rows = connector.fetch_data('SELECT * FROM "test" WHERE value > 150')
        assert len(rows) == 2
        assert all(row["value"] > 150 for row in rows)

    def test_fetch_data_cross_table_query(self, tmp_path):
        """Test that queries can reference multiple tables."""
        csv1 = tmp_path / "users.csv"
        csv2 = tmp_path / "orders.csv"
        csv1.write_text("user_id,name\n1,Alice\n2,Bob")
        csv2.write_text("order_id,user_id,amount\n100,1,50\n101,2,75")

        connector = FileConnector()
        
        connector.connect({
            "file_paths": [
                {"file_path": str(csv1), "original_filename": "users.csv"},
                {"file_path": str(csv2), "original_filename": "orders.csv"},
            ]
        })

        # Query joining both tables
        query = '''
            SELECT u.name, o.amount 
            FROM "users" u 
            JOIN "orders" o ON u.user_id = o.user_id
        '''
        columns, rows = connector.fetch_data(query)
        assert len(rows) == 2


class TestFetchDataArrow:
    """Tests for Arrow table fetching."""

    def test_fetch_data_arrow_returns_arrow_table(self, tmp_path):
        """Test that fetch_data_arrow returns PyArrow Table."""
        parquet_path = tmp_path / "test.parquet"
        table = pa.table({"id": [1, 2], "value": [100, 200]})
        pq.write_table(table, parquet_path)

        connector = FileConnector()
        
        connector.connect({
            "file_path": str(parquet_path),
            "original_filename": "test.parquet",
        })

        result = connector.fetch_data_arrow('SELECT * FROM "test"')
        assert isinstance(result, pa.Table)
        assert result.num_rows == 2
        assert result.num_columns == 2


class TestDisconnect:
    """Tests for disconnect behavior."""

    def test_disconnect_clears_files(self, tmp_path):
        """Test that disconnect clears the file list."""
        csv_path = tmp_path / "test.csv"
        csv_path.write_text("col1\n1")

        connector = FileConnector()
        
        connector.connect({
            "file_path": str(csv_path),
            "original_filename": "test.csv",
        })
        
        assert len(connector._files) == 1
        
        connector.disconnect()
        
        assert len(connector._files) == 0


class TestErrorHandling:
    """Tests for error handling."""

    def test_connect_missing_file_raises(self):
        """Test that connecting to non-existent file raises error."""
        connector = FileConnector()
        
        with pytest.raises(DataSourceConnectionError):
            connector.connect({
                "file_path": "/nonexistent/path/data.csv",
                "original_filename": "data.csv",
            })

    def test_connect_unsupported_extension_raises(self, tmp_path):
        """Test that unsupported file extensions raise error."""
        txt_path = tmp_path / "data.txt"
        txt_path.write_text("plain text content")

        connector = FileConnector()

        with pytest.raises(InvalidInputError, match="Unsupported file type"):
            connector.connect({
                "file_path": str(txt_path),
                "original_filename": "data.txt",
            })

    def test_fetch_data_no_files_raises(self):
        """Test that fetching data without files raises error."""
        connector = FileConnector()

        with pytest.raises(DataSourceConnectionError):
            connector.fetch_data('SELECT * FROM "test"')


class TestJsonFlattenPreservesRows:
    """JSON/JSONL flattening must not drop rows whose list columns are empty.

    Regression: ``UNNEST([])`` produces zero rows, so putting UNNEST() of a list
    column in the SELECT list silently deleted every record whose lists were all
    empty (and duplicated multi-element records). Empty lists must instead be
    preserved as a single NULL-valued row.
    """

    def _connect(self, tmp_path, lines):
        jsonl_path = tmp_path / "cores.jsonl"
        jsonl_path.write_text("\n".join(lines) + "\n")
        connector = FileConnector()
        connector.connect({
            "file_path": str(jsonl_path),
            "original_filename": "cores.jsonl",
        })
        return connector

    def test_empty_scalar_list_rows_are_preserved(self, tmp_path):
        """Rows with an empty scalar list survive; multi-element rows still expand."""
        lines = [
            '{"id": 1, "tags": ["x"]}',
            '{"id": 2, "tags": []}',
            '{"id": 3, "tags": ["y", "z"]}',
        ]
        connector = self._connect(tmp_path, lines)

        _, rows = connector.fetch_data('SELECT * FROM "cores"')
        # id=1 → 1 row, id=2 (empty list) → 1 preserved row, id=3 → 2 rows.
        assert len(rows) == 4
        ids = sorted(r["id"] for r in rows)
        assert ids == [1, 2, 2, 3] or ids == [1, 2, 3, 3]  # id=2 present, no drop
        assert 2 in ids

        # Every distinct id is preserved (no data loss).
        _, count_rows = connector.fetch_data(
            'SELECT count(DISTINCT "id") AS n FROM "cores"'
        )
        assert int(count_rows[0]["n"]) == 3

    def test_all_empty_lists_row_survives_with_null_index(self, tmp_path):
        """A record whose list columns are all empty must not vanish, and its
        __index must be NULL (not a spurious 1)."""
        lines = [
            '{"id": 1, "frames": [{"fn": "a", "ln": 10}, {"fn": "b", "ln": 20}], "tags": ["t"]}',
            '{"id": 2, "frames": [], "tags": []}',
            '{"id": 3, "frames": [{"fn": "c", "ln": 30}], "tags": ["u", "v"]}',
        ]
        connector = self._connect(tmp_path, lines)

        # id=2 (all lists empty) must be present exactly once with NULL fields.
        _, rows = connector.fetch_data(
            'SELECT "id", "frames__index", "frames__fn", "tags" '
            'FROM "cores" WHERE "id" = 2'
        )
        assert len(rows) == 1
        assert rows[0]["frames__index"] is None
        assert rows[0]["frames__fn"] is None
        assert rows[0]["tags"] is None

        # No records lost overall.
        _, count_rows = connector.fetch_data(
            'SELECT count(DISTINCT "id") AS n FROM "cores"'
        )
        assert int(count_rows[0]["n"]) == 3

    def test_list_of_struct_fields_expand(self, tmp_path):
        """LIST-of-STRUCT still expands into col__field columns (long + wide)."""
        lines = [
            '{"id": 1, "frames": [{"fn": "a", "ln": 10}, {"fn": "b", "ln": 20}]}',
            '{"id": 2, "frames": []}',
        ]
        connector = self._connect(tmp_path, lines)

        columns = connector.list_columns(table="cores")
        col_names = {c.name for c in columns}
        assert {"frames__index", "frames__fn", "frames__ln"} <= col_names

        _, rows = connector.fetch_data(
            'SELECT "frames__fn", "frames__ln" FROM "cores" '
            'WHERE "id" = 1 ORDER BY "frames__index"'
        )
        assert [(r["frames__fn"], r["frames__ln"]) for r in rows] == [("a", 10), ("b", 20)]


class TestJsonUnusualKeys:
    """JSON keys are data (file paths, names) and may be anything a JSON string can be.

    Regression: a gitstats report failed to load because DuckDB struct field names
    are case-insensitive ("onlineConfig/x.hpp" vs "onlineconfig/x.hpp"), a key
    contained a double quote ('nokia.com"'), and a key was empty (files without
    an extension).
    """

    def _connect(self, tmp_path, records):
        import json

        path = tmp_path / "keys.jsonl"
        path.write_text("\n".join(json.dumps(r) for r in records) + "\n")
        connector = FileConnector()
        connector.connect({"file_path": str(path), "original_filename": "keys.jsonl"})
        return connector

    def test_case_colliding_keys_load_as_map(self, tmp_path):
        """Keys differing only in case become a MAP keeping both values; other
        small structs stay expanded into columns."""
        connector = self._connect(tmp_path, [
            {"id": 1, "files": {"Foo.h": 1, "foo.h": 2, "bar.h": 3}, "pt": {"x": 1.5, "y": 2.5}},
            {"id": 2, "files": {"bar.h": 5}, "pt": {"x": 1.0, "y": 2.0}},
        ])

        types = {c.name: c.data_type for c in connector.list_columns(table="keys")}
        assert types["files"].startswith("MAP(")
        assert {"pt__x", "pt__y"} <= types.keys()

        _, rows = connector.fetch_data(
            '''SELECT "files"['Foo.h'] AS upper, "files"['foo.h'] AS lower FROM "keys" WHERE "id" = 1'''
        )
        assert rows == [{"upper": 1, "lower": 2}]

    def test_case_colliding_keys_with_mixed_value_types_are_rejected(self, tmp_path):
        """No MAP can hold BIGINT and VARCHAR values: fail with a clear 4xx error."""
        with pytest.raises(InvalidInputError, match="differ only in letter case"):
            self._connect(tmp_path, [{"id": 1, "x": {"Foo": 1, "foo": "text"}}])

    def test_keys_containing_double_quotes_expand(self, tmp_path):
        connector = self._connect(tmp_path, [{"id": 1, "domains": {"nokia.com": 1, 'nokia.com"': 2}}])

        _, rows = connector.fetch_data('SELECT * FROM "keys"')
        assert rows[0]["domains__nokia.com"] == 1
        assert rows[0]['domains__nokia.com"'] == 2

    def test_struct_with_empty_key_is_kept_whole(self, tmp_path):
        """DuckDB cannot extract an empty-named field, so the struct stays one
        column instead of failing the whole upload; its data is preserved."""
        connector = self._connect(tmp_path, [
            {"id": 1, "ext": {"md": 1, "": 2}, "frames": [{"fn": "a", "": 3}]},
        ])

        _, rows = connector.fetch_data('SELECT "ext", "frames" FROM "keys"')
        assert rows == [{"ext": {"md": 1, "": 2}, "frames": {"fn": "a", "": 3}}]


class TestJsonDocuments:
    """A single JSON object with several collections loads one table per section.

    Regression: a git statistics report (two top-level arrays plus large maps)
    was flattened as one record, zipping the arrays and repeating every map on
    each row - 3.5 billion values, 32 GB of memory, then a crash.
    """

    def _write(self, tmp_path, doc, name="doc.json"):
        import json

        path = tmp_path / name
        path.write_text(json.dumps(doc))
        return str(path)

    def _connect(self, path, parts=None):
        connector = FileConnector()
        connector.connect({"file_paths": [{
            "file_path": path, "original_filename": os.path.basename(path), "parts": parts,
        }]})
        return connector

    def _parts(self, path):
        from backend.connectors.file_handlers import handler_for

        parts = handler_for(path).list_parts(path)
        return None if parts is None else [(p.name, p.selectable) for p in parts]

    def test_wrapper_with_one_array_stays_one_table(self, tmp_path):
        """Chrome Trace Format: small metadata repeats on every event row (documented)."""
        path = self._write(tmp_path, {
            "traceEvents": [{"name": "a", "ts": 1}, {"name": "b", "ts": 2}],
            "displayTimeUnit": "ns",
            "otherData": {"version": "v8"},
        }, "trace.json")
        assert self._parts(path) is None

        _, rows = self._connect(path).fetch_data(
            'SELECT "traceEvents__name", "displayTimeUnit", "otherData__version" FROM "trace" '
            'ORDER BY "traceEvents__index"'
        )
        assert rows == [
            {"traceEvents__name": "a", "displayTimeUnit": "ns", "otherData__version": "v8"},
            {"traceEvents__name": "b", "displayTimeUnit": "ns", "otherData__version": "v8"},
        ]

    def test_sections_become_tables(self, tmp_path):
        path = self._write(tmp_path, {
            "project": "rt",
            "total": 2,
            "authors": ["ada", "bob"],
            "tags": [{"name": "v1", "commits": 3}, {"name": "v2", "commits": 5}],
            "churn": {"a.h": 1, "A.h": 2},
            "extensions": {"md": {"files": 1, "lines": 9}, "": {"files": 2, "lines": 4}},
        })
        assert self._parts(path) == [
            ("summary", True), ("authors", True), ("tags", True), ("churn", True), ("extensions", True),
        ]

        connector = self._connect(path)
        assert [t.name for t in connector.list_tables()] == [
            "doc_summary", "doc_authors", "doc_tags", "doc_churn", "doc_extensions",
        ]
        assert connector.fetch_data('SELECT * FROM "doc_summary"')[1] == [{"project": "rt", "total": 2}]
        assert connector.fetch_data('SELECT * FROM "doc_authors"')[1] == [
            {"index": 1, "value": "ada"}, {"index": 2, "value": "bob"},
        ]
        assert connector.fetch_data('SELECT * FROM "doc_tags"')[1] == [
            {"index": 1, "name": "v1", "commits": 3}, {"index": 2, "name": "v2", "commits": 5},
        ]
        # Keys are data: case-different and empty keys are separate rows.
        assert connector.fetch_data('SELECT * FROM "doc_churn"')[1] == [
            {"key": "a.h", "value": 1}, {"key": "A.h", "value": 2},
        ]
        assert connector.fetch_data('SELECT * FROM "doc_extensions"')[1] == [
            {"key": "md", "files": 1, "lines": 9}, {"key": "", "files": 2, "lines": 4},
        ]

    def test_map_values_explode_into_long_format(self, tmp_path):
        """author -> file -> count becomes (key, key_2, value) rows; an author
        without files keeps a row."""
        files = {f"src/f{i}.cpp": i for i in range(250)}  # enough keys to be a MAP
        path = self._write(tmp_path, {
            "author_files": {"ada": files, "bob": {"src/f1.cpp": 7}, "eve": {}},
            "head_files": ["src/f1.cpp"],
            "authors": ["ada"],
        })

        connector = self._connect(path, parts=["author_files"])
        _, rows = connector.fetch_data(
            '''SELECT "key", "key_2", "value" FROM "doc_author_files"
               WHERE "key" <> 'ada' OR "key_2" = 'src/f3.cpp' ORDER BY "key"'''
        )
        assert rows == [
            {"key": "ada", "key_2": "src/f3.cpp", "value": 3},
            {"key": "bob", "key_2": "src/f1.cpp", "value": 7},
            {"key": "eve", "key_2": None, "value": None},
        ]

    def test_large_object_beside_one_array_is_a_document(self, tmp_path):
        """Big non-array content would repeat on every array row: split instead."""
        path = self._write(tmp_path, {
            "items": [1, 2, 3],
            "index": {f"key{i:05d}": i for i in range(10000)},
        })
        assert self._parts(path) == [("items", True), ("index", True)]

    def test_empty_sections_are_listed_but_not_selectable(self, tmp_path):
        path = self._write(tmp_path, {"a": [1, 2], "b": [], "c": {}})
        assert self._parts(path) == [("a", True), ("b", False), ("c", False)]

        # The only loadable section: the table is named after the file.
        connector = self._connect(path)
        assert [t.name for t in connector.list_tables()] == ["doc"]
        with pytest.raises(InvalidInputError, match="not found or not loadable"):
            self._connect(path, parts=["b"])

    def test_summary_name_avoids_a_section_called_summary(self, tmp_path):
        path = self._write(tmp_path, {"version": 1, "summary": [1], "rows": [2]})
        assert self._parts(path) == [("summary_1", True), ("summary", True), ("rows", True)]

    def test_records_files_have_no_sections(self, tmp_path):
        assert self._parts(self._write(tmp_path, [{"a": [1]}, {"a": [2]}])) is None
        ndjson = tmp_path / "rows.json"
        ndjson.write_text('{"a": [1], "b": [2]}\n{"a": [3], "b": [4]}\n')
        assert self._parts(str(ndjson)) is None


def _write_workbook(path, sheets, hidden=()):
    """Write an .xlsx with {sheet_name: [rows]}; names in hidden are hidden sheets."""
    import openpyxl

    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    for sheet_name, rows in sheets.items():
        ws = wb.create_sheet(sheet_name)
        for row in rows:
            ws.append(row)
        if sheet_name in hidden:
            ws.sheet_state = "hidden"
    wb.save(path)
    return str(path)


class TestFileConnectorWorkbooks:
    """Workbooks become one Parquet-backed table per selected sheet."""

    SHEETS = {
        "Alpha": [["id", "name"], [1, "ada"], [2, "bob"]],
        "Beta Sheet": [["code"], [10], ["X"]],
    }

    def _connect(self, tmp_path, sheets=None, details=None, filename="Sales Book.xlsx"):
        path = _write_workbook(tmp_path / "upload1234.xlsx", sheets or self.SHEETS)
        connector = FileConnector()
        file_entry = {"file_path": path, "original_filename": filename}
        connector.connect({"file_paths": [file_entry], **(details or {})})
        return connector, path

    def test_one_table_per_sheet(self, tmp_path):
        connector, _ = self._connect(tmp_path)

        assert [t.name for t in connector.list_tables()] == ["sales_book_alpha", "sales_book_beta_sheet"]
        _, rows = connector.fetch_data('SELECT * FROM "sales_book_alpha" ORDER BY id')
        assert rows == [{"id": 1, "name": "ada"}, {"id": 2, "name": "bob"}]
        columns = connector.list_columns(None, "sales_book_beta_sheet")
        assert [(c.name, c.data_type) for c in columns] == [("code", "VARCHAR")]

    def test_csv_timestamp_format_parses_text_dates(self, tmp_path):
        sheets = {"Data": [["start"], ["10/04/2026 22:00"], ["10/06/2026 20:45"]]}
        connector, _ = self._connect(
            tmp_path, sheets=sheets, details={"csv_timestamp_format": "%m/%d/%Y %H:%M"}
        )

        [column] = connector.list_columns(None, "sales_book")
        assert (column.data_type, column.is_datetime) == ("TIMESTAMP", True)

    def test_single_loadable_sheet_named_after_file(self, tmp_path):
        path = _write_workbook(
            tmp_path / "upload.xlsx",
            {"Data": [["a"], [1]], "Lookup": [["b"], [2]]},
            hidden={"Lookup"},
        )
        connector = FileConnector()
        connector.connect({"file_paths": [{"file_path": path, "original_filename": "report.xlsx"}]})

        assert [t.name for t in connector.list_tables()] == ["report"]

    def test_saved_file_parts_applied_by_filename(self, tmp_path):
        connector, _ = self._connect(tmp_path, details={"file_parts": {"Sales Book.xlsx": ["Beta Sheet"]}})
        assert [t.name for t in connector.list_tables()] == ["sales_book_beta_sheet"]

    def test_per_file_sheets_override_saved_selection(self, tmp_path):
        path = _write_workbook(tmp_path / "upload.xlsx", self.SHEETS)
        connector = FileConnector()
        connector.connect({
            "file_paths": [{"file_path": path, "original_filename": "b.xlsx", "parts": ["Alpha"]}],
            "file_parts": {"b.xlsx": ["Beta Sheet"]},
        })
        assert [t.name for t in connector.list_tables()] == ["b_alpha"]

    def test_missing_saved_sheet_raises_and_cleans_up(self, tmp_path):
        with pytest.raises(InvalidInputError, match="'Gone'.*Available sheets: Alpha, Beta Sheet"):
            self._connect(tmp_path, details={"file_parts": {"Sales Book.xlsx": ["Alpha", "Gone"]}})
        assert not list(tmp_path.glob("*.parquet"))

    def test_empty_sheet_skipped(self, tmp_path):
        connector, _ = self._connect(tmp_path, sheets={"Data": [["a"], [1]], "Blank": []})

        assert [t.name for t in connector.list_tables()] == ["sales_book_data"]
        assert connector.take_skipped_parts() == ["Sales Book.xlsx: Blank"]

    def test_workbook_without_visible_sheets_raises(self, tmp_path):
        import openpyxl

        wb = openpyxl.Workbook()
        wb.active.append(["a"])
        wb.active.sheet_state = "hidden"
        wb.create_chartsheet("Chart")  # openpyxl refuses to hide the only visible sheet
        path = str(tmp_path / "upload.xlsx")
        wb.save(path)
        connector = FileConnector()
        with pytest.raises(InvalidInputError, match="no visible worksheets"):
            connector.connect({"file_paths": [{"file_path": path, "original_filename": "h.xlsx"}]})

    def test_all_selected_sheets_empty_raises(self, tmp_path):
        with pytest.raises(InvalidInputError, match="contain no data"):
            self._connect(tmp_path, sheets={"Blank": [], "Other": []})

    def test_disconnect_deletes_derived_sheet_parquet(self, tmp_path):
        connector, path = self._connect(tmp_path)
        assert len(list(tmp_path.glob("*.parquet"))) == 2

        connector.disconnect()

        assert not list(tmp_path.glob("*.parquet"))
        assert os.path.exists(path)  # the upload itself belongs to the session

    def test_disconnect_deletes_flattened_json_parquet(self, tmp_path):
        json_path = tmp_path / "events.json"
        json_path.write_text('[{"id": 1}, {"id": 2}]')
        connector = FileConnector()
        connector.connect({"file_path": str(json_path), "original_filename": "events.json"})
        assert [p.name for p in tmp_path.glob("*.parquet")] == ["events__flat.parquet"]

        connector.disconnect()

        assert not list(tmp_path.glob("*.parquet"))
        assert json_path.exists()

    def test_add_workbook_returns_all_table_names(self, tmp_path):
        csv_path = tmp_path / "base.csv"
        csv_path.write_text("id\n1\n")
        connector = FileConnector()
        connector.connect({"file_path": str(csv_path), "original_filename": "base.csv"})
        path = _write_workbook(tmp_path / "upload.xlsx", self.SHEETS)

        added = connector.add_file(path, "extra.xlsx", {}, ["Alpha", "Beta Sheet"])

        assert added == ["extra_alpha", "extra_beta_sheet"]
        assert [t.name for t in connector.list_tables()] == ["base", "extra_alpha", "extra_beta_sheet"]

    def test_failed_add_leaves_no_tables_or_files(self, tmp_path):
        csv_path = tmp_path / "base.csv"
        csv_path.write_text("id\n1\n")
        connector = FileConnector()
        connector.connect({"file_path": str(csv_path), "original_filename": "base.csv"})
        path = _write_workbook(tmp_path / "upload.xlsx", self.SHEETS)

        with pytest.raises(InvalidInputError):
            connector.add_file(path, "extra.xlsx", {}, ["Alpha", "Missing"])

        assert [t.name for t in connector.list_tables()] == ["base"]
        assert not list(tmp_path.glob("*.parquet"))

    def test_remove_tables_deletes_their_derived_files(self, tmp_path):
        connector, _ = self._connect(tmp_path)
        connector.remove_tables(["sales_book_alpha"])
        assert [t.name for t in connector.list_tables()] == ["sales_book_beta_sheet"]
        assert len(list(tmp_path.glob("*.parquet"))) == 1

    def test_sheet_name_with_dot_keeps_full_name(self, tmp_path):
        connector, _ = self._connect(tmp_path, sheets={"v1.2": [["a"], [1]], "Other": [["b"], [2]]})
        assert [t.name for t in connector.list_tables()] == ["sales_book_v1_2", "sales_book_other"]
