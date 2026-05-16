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
        json_path = tmp_path / "data.json"
        json_path.write_text('{"key": "value"}')

        connector = FileConnector()
        
        with pytest.raises(InvalidInputError):
            connector.connect({
                "file_path": str(json_path),
                "original_filename": "data.json",
            })

    def test_fetch_data_no_files_raises(self):
        """Test that fetching data without files raises error."""
        connector = FileConnector()
        
        with pytest.raises(DataSourceConnectionError):
            connector.fetch_data('SELECT * FROM "test"')
