"""Unit tests for HiveParquetConnector with lazy partition loading."""

import os
import pytest
import pyarrow as pa
import pyarrow.parquet as pq
from unittest.mock import Mock

from backend.connectors.hive_parquet_connector import (
    HiveParquetConnector,
    PartitionNotLoadedError,
)
from backend.exceptions import DataSourceConnectionError, InvalidInputError


class TestHiveParquetConnectorInit:
    """Tests for HiveParquetConnector initialization."""

    def test_init_creates_empty_state(self):
        """Test that HiveParquetConnector initializes with empty state."""
        state_manager = Mock()
        connector = HiveParquetConnector(state_manager=state_manager)
        assert connector._partition_column is None
        assert connector._available_partitions == []
        assert connector._loaded_partitions == {}


class TestParseStructure:
    """Tests for parsing file structure."""

    def test_parse_single_partition_column(self):
        """Test parsing structure with single partition column."""
        state_manager = Mock()
        connector = HiveParquetConnector(state_manager=state_manager)
        
        file_structure = [
            "dataset/region=us/file1.parquet",
            "dataset/region=us/file2.parquet",
            "dataset/region=eu/file1.parquet",
        ]
        
        col, partitions = connector._parse_structure(file_structure)
        assert col == "region"
        assert sorted(partitions) == ["eu", "us"]

    def test_parse_windows_paths(self):
        """Test parsing Windows-style paths."""
        state_manager = Mock()
        connector = HiveParquetConnector(state_manager=state_manager)
        
        file_structure = [
            "dataset\\region=us\\file1.parquet",
            "dataset\\region=eu\\file1.parquet",
        ]
        
        col, partitions = connector._parse_structure(file_structure)
        assert col == "region"
        assert sorted(partitions) == ["eu", "us"]

    def test_parse_ignores_non_parquet_files(self):
        """Test that non-parquet files are ignored."""
        state_manager = Mock()
        connector = HiveParquetConnector(state_manager=state_manager)
        
        file_structure = [
            "dataset/region=us/file1.parquet",
            "dataset/region=us/readme.txt",
            "dataset/region=eu/file1.parquet",
            "dataset/region=eu/metadata.json",
        ]
        
        col, partitions = connector._parse_structure(file_structure)
        assert col == "region"
        assert sorted(partitions) == ["eu", "us"]

    def test_parse_empty_structure_returns_none(self):
        """Test that empty structure returns None column."""
        state_manager = Mock()
        connector = HiveParquetConnector(state_manager=state_manager)
        
        col, partitions = connector._parse_structure([])
        assert col is None
        assert partitions == []

    def test_parse_no_partition_structure_returns_none(self):
        """Test that non-partitioned structure returns None column."""
        state_manager = Mock()
        connector = HiveParquetConnector(state_manager=state_manager)
        
        file_structure = [
            "dataset/file1.parquet",
            "dataset/subdir/file2.parquet",
        ]
        
        col, partitions = connector._parse_structure(file_structure)
        assert col is None
        assert partitions == []

    def test_parse_with_root_folder_containing_equals(self):
        """Test parsing when root folder name contains '=' character."""
        state_manager = Mock()
        connector = HiveParquetConnector(state_manager=state_manager)
        
        file_structure = [
            "data=X/type=A/file1.parquet",
            "data=X/type=A/file2.parquet",
            "data=X/type=B/file1.parquet",
        ]
        
        col, partitions = connector._parse_structure(file_structure)
        assert col == "type", f"Expected 'type' but got '{col}'"
        assert sorted(partitions) == ["A", "B"], f"Expected ['A', 'B'] but got {partitions}"

    def test_parse_with_normal_root_folder(self):
        """Test parsing with typical root folder structure."""
        state_manager = Mock()
        connector = HiveParquetConnector(state_manager=state_manager)
        
        file_structure = [
            "data/type=A/file1.parquet",
            "data/type=B/file1.parquet",
        ]
        
        col, partitions = connector._parse_structure(file_structure)
        assert col == "type"
        assert sorted(partitions) == ["A", "B"]


class TestConnect:
    """Tests for connecting to Hive Parquet dataset."""

    def test_connect_parses_structure(self):
        """Test that connect parses file structure correctly."""
        state_manager = Mock()
        connector = HiveParquetConnector(state_manager=state_manager)
        
        connector.connect({
            "hive_file_structure": [
                "dataset/country=usa/data.parquet",
                "dataset/country=canada/data.parquet",
            ]
        })
        
        assert connector.partition_column == "country"
        assert sorted(connector._available_partitions) == ["canada", "usa"]

    def test_connect_raises_on_empty_structure(self):
        """Test that connect raises error on empty structure."""
        state_manager = Mock()
        connector = HiveParquetConnector(state_manager=state_manager)
        
        with pytest.raises(InvalidInputError, match="No file structure"):
            connector.connect({"hive_file_structure": []})

    def test_connect_raises_on_no_partitions(self):
        """Test that connect raises error when no partitions detected."""
        state_manager = Mock()
        connector = HiveParquetConnector(state_manager=state_manager)
        
        with pytest.raises(InvalidInputError, match="Could not detect partition"):
            connector.connect({
                "hive_file_structure": ["dataset/file.parquet"]
            })


class TestListTables:
    """Tests for listing tables (partitions)."""

    def test_list_tables_returns_partitions(self):
        """Test that list_tables returns all available partitions."""
        state_manager = Mock()
        connector = HiveParquetConnector(state_manager=state_manager)
        
        connector.connect({
            "hive_file_structure": [
                "dataset/year=2023/data.parquet",
                "dataset/year=2024/data.parquet",
            ]
        })
        
        tables = connector.list_tables()
        table_names = [t.name for t in tables]
        assert sorted(table_names) == ["2023", "2024"]


class TestLoadPartition:
    """Tests for loading partitions."""

    def test_load_partition_registers_files(self, tmp_path):
        """Test that load_partition registers file paths."""
        # Create test parquet file
        parquet_path = tmp_path / "test.parquet"
        table = pa.table({"col1": [1, 2, 3]})
        pq.write_table(table, parquet_path)
        
        state_manager = Mock()
        connector = HiveParquetConnector(state_manager=state_manager)
        
        connector.connect({
            "hive_file_structure": ["dataset/region=us/test.parquet"]
        })
        
        connector.load_partition("us", [str(parquet_path)])
        
        assert connector.is_partition_loaded("us")
        assert connector._loaded_partitions["us"] == [str(parquet_path)]

    def test_load_partition_raises_on_unknown_partition(self, tmp_path):
        """Test that load_partition raises error for unknown partition."""
        parquet_path = tmp_path / "test.parquet"
        table = pa.table({"col1": [1, 2, 3]})
        pq.write_table(table, parquet_path)
        
        state_manager = Mock()
        connector = HiveParquetConnector(state_manager=state_manager)
        
        connector.connect({
            "hive_file_structure": ["dataset/region=us/test.parquet"]
        })
        
        with pytest.raises(InvalidInputError, match="Unknown partition"):
            connector.load_partition("unknown", [str(parquet_path)])

    def test_load_partition_raises_on_missing_file(self):
        """Test that load_partition raises error for missing file."""
        state_manager = Mock()
        connector = HiveParquetConnector(state_manager=state_manager)
        
        connector.connect({
            "hive_file_structure": ["dataset/region=us/test.parquet"]
        })
        
        with pytest.raises(DataSourceConnectionError, match="not found"):
            connector.load_partition("us", ["/nonexistent/path.parquet"])


class TestListColumns:
    """Tests for listing columns."""

    def test_list_columns_for_loaded_partition(self, tmp_path):
        """Test listing columns for a loaded partition."""
        parquet_path = tmp_path / "test.parquet"
        table = pa.table({
            "name": ["Alice", "Bob"],
            "age": [30, 25],
            "active": [True, False],
        })
        pq.write_table(table, parquet_path)
        
        state_manager = Mock()
        connector = HiveParquetConnector(state_manager=state_manager)
        
        connector.connect({
            "hive_file_structure": ["dataset/region=us/test.parquet"]
        })
        connector.load_partition("us", [str(parquet_path)])
        
        columns = connector.list_columns(table="us")
        col_names = [c.name for c in columns]
        
        assert "name" in col_names
        assert "age" in col_names
        assert "active" in col_names

    def test_list_columns_raises_on_unloaded_partition(self):
        """Test that list_columns raises error for unloaded partition."""
        state_manager = Mock()
        connector = HiveParquetConnector(state_manager=state_manager)
        
        connector.connect({
            "hive_file_structure": ["dataset/region=us/test.parquet"]
        })
        
        with pytest.raises(PartitionNotLoadedError):
            connector.list_columns(table="us")


class TestFetchData:
    """Tests for fetching data."""

    def test_fetch_data_from_single_partition(self, tmp_path):
        """Test fetching data from a loaded partition."""
        parquet_path = tmp_path / "test.parquet"
        table = pa.table({"id": [1, 2, 3], "value": [100, 200, 300]})
        pq.write_table(table, parquet_path)
        
        state_manager = Mock()
        connector = HiveParquetConnector(state_manager=state_manager)
        
        connector.connect({
            "hive_file_structure": ["dataset/region=us/test.parquet"]
        })
        connector.load_partition("us", [str(parquet_path)])
        
        columns, rows = connector.fetch_data('SELECT * FROM "us"')
        
        assert len(rows) == 3
        assert rows[0]["id"] == 1
        assert rows[0]["value"] == 100

    def test_fetch_data_with_multiple_files_per_partition(self, tmp_path):
        """Test fetching data when partition has multiple files."""
        parquet1 = tmp_path / "file1.parquet"
        parquet2 = tmp_path / "file2.parquet"
        
        pq.write_table(pa.table({"id": [1, 2]}), parquet1)
        pq.write_table(pa.table({"id": [3, 4]}), parquet2)
        
        state_manager = Mock()
        connector = HiveParquetConnector(state_manager=state_manager)
        
        connector.connect({
            "hive_file_structure": [
                "dataset/region=us/file1.parquet",
                "dataset/region=us/file2.parquet",
            ]
        })
        connector.load_partition("us", [str(parquet1), str(parquet2)])
        
        columns, rows = connector.fetch_data('SELECT * FROM "us" ORDER BY id')
        
        assert len(rows) == 4
        assert [r["id"] for r in rows] == [1, 2, 3, 4]

    def test_fetch_data_raises_when_no_partitions_loaded(self):
        """Test that fetch_data raises error when no partitions loaded."""
        state_manager = Mock()
        connector = HiveParquetConnector(state_manager=state_manager)
        
        connector.connect({
            "hive_file_structure": ["dataset/region=us/test.parquet"]
        })
        
        with pytest.raises(DataSourceConnectionError, match="No partitions loaded"):
            connector.fetch_data('SELECT * FROM "us"')

    def test_fetch_data_cross_partition_query(self, tmp_path):
        """Test querying across multiple loaded partitions."""
        parquet_us = tmp_path / "us.parquet"
        parquet_eu = tmp_path / "eu.parquet"
        
        pq.write_table(pa.table({"id": [1, 2], "region": ["us", "us"]}), parquet_us)
        pq.write_table(pa.table({"id": [3, 4], "region": ["eu", "eu"]}), parquet_eu)
        
        state_manager = Mock()
        connector = HiveParquetConnector(state_manager=state_manager)
        
        connector.connect({
            "hive_file_structure": [
                "dataset/region=us/data.parquet",
                "dataset/region=eu/data.parquet",
            ]
        })
        connector.load_partition("us", [str(parquet_us)])
        connector.load_partition("eu", [str(parquet_eu)])
        
        # UNION ALL query across partitions
        query = '''
            SELECT id, region FROM "us"
            UNION ALL
            SELECT id, region FROM "eu"
            ORDER BY id
        '''
        columns, rows = connector.fetch_data(query)
        
        assert len(rows) == 4
        assert [r["id"] for r in rows] == [1, 2, 3, 4]


class TestFetchDataArrow:
    """Tests for Arrow data fetching."""

    def test_fetch_data_arrow_returns_arrow_table(self, tmp_path):
        """Test that fetch_data_arrow returns PyArrow Table."""
        parquet_path = tmp_path / "test.parquet"
        table = pa.table({"id": [1, 2], "value": [100, 200]})
        pq.write_table(table, parquet_path)
        
        state_manager = Mock()
        connector = HiveParquetConnector(state_manager=state_manager)
        
        connector.connect({
            "hive_file_structure": ["dataset/region=us/test.parquet"]
        })
        connector.load_partition("us", [str(parquet_path)])
        
        result = connector.fetch_data_arrow('SELECT * FROM "us"')
        
        assert isinstance(result, pa.Table)
        assert result.num_rows == 2
        assert result.num_columns == 2


class TestDisconnect:
    """Tests for disconnect behavior."""

    def test_disconnect_clears_state(self, tmp_path):
        """Test that disconnect clears all state."""
        parquet_path = tmp_path / "test.parquet"
        table = pa.table({"col1": [1, 2, 3]})
        pq.write_table(table, parquet_path)
        
        state_manager = Mock()
        connector = HiveParquetConnector(state_manager=state_manager)
        
        connector.connect({
            "hive_file_structure": ["dataset/region=us/test.parquet"]
        })
        connector.load_partition("us", [str(parquet_path)])
        
        assert connector._available_partitions == ["us"]
        assert connector.is_partition_loaded("us")
        
        connector.disconnect()
        
        assert connector._partition_column is None
        assert connector._available_partitions == []
        assert connector._loaded_partitions == {}


class TestPartitionNotLoadedError:
    """Tests for PartitionNotLoadedError exception."""

    def test_error_includes_partition_name(self):
        """Test that error message includes partition name."""
        error = PartitionNotLoadedError("my_partition")
        assert "my_partition" in str(error.detail)
        assert "not loaded" in str(error.detail).lower()
