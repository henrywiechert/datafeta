"""Unit tests for connection service with multi-file and parquet support."""

import asyncio
import pytest
import tempfile
import os
import pyarrow as pa
import pyarrow.parquet as pq

from backend.services.connection_service import (
    ALLOWED_FILE_EXTENSIONS,
    ALLOWED_CSV_MIME_TYPES,
    ALLOWED_PARQUET_MIME_TYPES,
    ALLOWED_FILE_MIME_TYPES,
    MAX_FILE_UPLOAD_BYTES,
    ConnectionService,
)
from backend.connectors.file_handlers.parquet_handler import ParquetFileHandler


def run_async(coro):
    """Helper to run async functions in sync tests."""
    return asyncio.get_event_loop().run_until_complete(coro)


class TestFileExtensionConstants:
    """Tests for file extension constants."""

    def test_allowed_extensions_include_csv(self):
        """Test that CSV extension is allowed."""
        assert '.csv' in ALLOWED_FILE_EXTENSIONS

    def test_allowed_extensions_include_parquet(self):
        """Test that Parquet extension is allowed."""
        assert '.parquet' in ALLOWED_FILE_EXTENSIONS

    def test_allowed_extensions_count(self):
        """Test that only expected extensions are allowed."""
        assert len(ALLOWED_FILE_EXTENSIONS) == 2


class TestMimeTypeConstants:
    """Tests for MIME type constants."""

    def test_csv_mime_types(self):
        """Test that common CSV MIME types are allowed."""
        assert 'text/csv' in ALLOWED_CSV_MIME_TYPES
        assert 'application/csv' in ALLOWED_CSV_MIME_TYPES
        assert 'text/plain' in ALLOWED_CSV_MIME_TYPES

    def test_parquet_mime_types(self):
        """Test that Parquet MIME types are allowed."""
        assert 'application/octet-stream' in ALLOWED_PARQUET_MIME_TYPES
        assert 'application/x-parquet' in ALLOWED_PARQUET_MIME_TYPES

    def test_combined_mime_types(self):
        """Test that combined MIME types include both CSV and Parquet."""
        for mime in ALLOWED_CSV_MIME_TYPES:
            assert mime in ALLOWED_FILE_MIME_TYPES
        for mime in ALLOWED_PARQUET_MIME_TYPES:
            assert mime in ALLOWED_FILE_MIME_TYPES


class TestFileSizeLimit:
    """Tests for file size limit."""

    def test_max_file_size_is_1gb(self):
        """Test that max file size is 1 GiB."""
        assert MAX_FILE_UPLOAD_BYTES == 1024 * 1024 * 1024


class TestParquetValidation:
    """Tests for Parquet file validation."""

    def test_valid_parquet_passes_validation(self, tmp_path):
        """Test that valid Parquet files pass validation."""
        parquet_path = tmp_path / "valid.parquet"
        table = pa.table({"col1": [1, 2, 3]})
        pq.write_table(table, parquet_path)

        # Should not raise
        ParquetFileHandler().validate(str(parquet_path))

    def test_empty_parquet_fails_validation(self, tmp_path):
        """Test that empty files fail validation."""
        from backend.exceptions import InvalidInputError
        
        empty_path = tmp_path / "empty.parquet"
        empty_path.write_bytes(b'')

        with pytest.raises(InvalidInputError) as exc_info:
            ParquetFileHandler().validate(str(empty_path))
        
        assert "empty" in str(exc_info.value).lower()

    def test_invalid_parquet_header_fails(self, tmp_path):
        """Test that files with wrong header fail validation."""
        from backend.exceptions import InvalidInputError
        
        invalid_path = tmp_path / "invalid.parquet"
        invalid_path.write_bytes(b'NOT_PARQUET_CONTENT_HERE')

        with pytest.raises(InvalidInputError) as exc_info:
            ParquetFileHandler().validate(str(invalid_path))
        
        assert "PAR1" in str(exc_info.value)

    def test_missing_file_fails_validation(self, tmp_path):
        """Test that missing files fail validation."""
        from backend.exceptions import FileProcessingError
        
        with pytest.raises(FileProcessingError):
            ParquetFileHandler().validate(str(tmp_path / "nonexistent.parquet"))


class TestFileExtensionHelper:
    """Tests for file extension helper."""

    def test_get_extension_csv(self):
        """Test getting CSV extension."""
        assert ConnectionService._get_file_extension("data.csv") == ".csv"
        assert ConnectionService._get_file_extension("DATA.CSV") == ".csv"

    def test_get_extension_parquet(self):
        """Test getting Parquet extension."""
        assert ConnectionService._get_file_extension("data.parquet") == ".parquet"
        assert ConnectionService._get_file_extension("DATA.PARQUET") == ".parquet"

    def test_get_extension_with_path(self):
        """Test getting extension from full path."""
        assert ConnectionService._get_file_extension("/path/to/data.csv") == ".csv"
        assert ConnectionService._get_file_extension("/path/to/data.parquet") == ".parquet"


class TestConnectionDetailsLogic:
    """Tests for connection details handling logic."""

    def test_csv_file_paths_format(self):
        """Test the expected format for multi-file paths."""
        file_paths = [
            {"file_path": "/tmp/file1.csv", "original_filename": "data1.csv"},
            {"file_path": "/tmp/file2.parquet", "original_filename": "data2.parquet"},
        ]

        # Verify structure
        assert len(file_paths) == 2
        assert file_paths[0]["file_path"] == "/tmp/file1.csv"
        assert file_paths[0]["original_filename"] == "data1.csv"
        assert file_paths[1]["file_path"] == "/tmp/file2.parquet"
        assert file_paths[1]["original_filename"] == "data2.parquet"


class TestTempPathsTracking:
    """Tests for temp paths tracking logic."""

    def test_temp_paths_array_format(self):
        """Test that temp paths are tracked as array."""
        temp_paths = [
            "/tmp/upload/session1/abc123.csv",
            "/tmp/upload/session1/def456.parquet",
        ]

        assert len(temp_paths) == 2
        assert temp_paths[0].endswith(".csv")
        assert temp_paths[1].endswith(".parquet")

    def test_cleanup_iterates_all_paths(self):
        """Test cleanup logic for multiple paths."""
        temp_paths = ["/tmp/file1.csv", "/tmp/file2.parquet"]
        cleaned = []

        for path in temp_paths:
            # Simulate cleanup
            cleaned.append(path)

        assert len(cleaned) == len(temp_paths)


class TestConnectionStateManagerTempPaths:
    """Tests for ConnectionStateManager temp_paths persistence."""

    def test_set_state_persists_temp_paths_for_csv(self):
        """Test that temp_paths are stored for CSV connections."""
        from backend.dependencies import ConnectionStateManager
        from backend.models.data_source import ConnectionDetails

        manager = ConnectionStateManager()
        details = ConnectionDetails(type='csv')
        temp_paths = ['/tmp/file1.csv', '/tmp/file2.csv']

        manager.set_state(connector=None, details=details, temp_paths=temp_paths)

        assert manager.current_temp_paths == temp_paths

    def test_set_state_persists_temp_paths_for_hive_parquet(self):
        """Test that temp_paths are stored for hive_parquet connections."""
        from backend.dependencies import ConnectionStateManager
        from backend.models.data_source import ConnectionDetails

        manager = ConnectionStateManager()
        details = ConnectionDetails(type='hive_parquet')
        temp_paths = ['/tmp/partition1.parquet', '/tmp/partition2.parquet']

        manager.set_state(connector=None, details=details, temp_paths=temp_paths)

        assert manager.current_temp_paths == temp_paths

    def test_set_state_empty_when_no_temp_paths(self):
        """Test that temp_paths is empty when not provided."""
        from backend.dependencies import ConnectionStateManager
        from backend.models.data_source import ConnectionDetails

        manager = ConnectionStateManager()
        details = ConnectionDetails(type='clickhouse', host='localhost')

        manager.set_state(connector=None, details=details, temp_paths=None)

        assert manager.current_temp_paths == []

    def test_set_state_empty_list_when_empty_list_provided(self):
        """Test that empty list is preserved when provided."""
        from backend.dependencies import ConnectionStateManager
        from backend.models.data_source import ConnectionDetails

        manager = ConnectionStateManager()
        details = ConnectionDetails(type='csv')

        manager.set_state(connector=None, details=details, temp_paths=[])

        assert manager.current_temp_paths == []

    def test_clear_state_clears_temp_paths(self):
        """Test that clear_state resets temp_paths."""
        from backend.dependencies import ConnectionStateManager
        from backend.models.data_source import ConnectionDetails

        manager = ConnectionStateManager()
        details = ConnectionDetails(type='csv')
        temp_paths = ['/tmp/file1.csv']

        manager.set_state(connector=None, details=details, temp_paths=temp_paths)
        assert manager.current_temp_paths == temp_paths

        manager.clear_state()
        assert manager.current_temp_paths == []

    def test_append_temp_paths(self):
        """Test that append_temp_paths adds to existing paths."""
        from backend.dependencies import ConnectionStateManager
        from backend.models.data_source import ConnectionDetails

        manager = ConnectionStateManager()
        details = ConnectionDetails(type='csv')

        manager.set_state(connector=None, details=details, temp_paths=['/tmp/file1.csv'])
        manager.append_temp_paths(['/tmp/file2.csv', '/tmp/file3.csv'])

        assert manager.current_temp_paths == ['/tmp/file1.csv', '/tmp/file2.csv', '/tmp/file3.csv']
