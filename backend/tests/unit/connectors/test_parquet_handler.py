# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Unit tests for ParquetFileHandler."""

import pytest
import pyarrow as pa
import pyarrow.parquet as pq

from backend.connectors.file_handlers.parquet_handler import ParquetFileHandler
from backend.exceptions import FileProcessingError, InvalidInputError


class TestParquetFileHandlerProperties:
    def test_file_extension(self):
        handler = ParquetFileHandler()
        assert handler.FILE_EXTENSION == ".parquet"

    def test_file_type(self):
        handler = ParquetFileHandler()
        assert handler.file_type == "parquet"


class TestParquetBuildReaderSql:
    def test_produces_read_parquet_sql(self):
        handler = ParquetFileHandler()
        sql = handler.build_reader_sql("/tmp/data.parquet")
        assert sql == "read_parquet('/tmp/data.parquet')"

    def test_file_path_single_quote_escaped(self):
        handler = ParquetFileHandler()
        sql = handler.build_reader_sql("/tmp/it's/data.parquet")
        assert sql == "read_parquet('/tmp/it''s/data.parquet')"


class TestParquetValidate:
    def test_valid_parquet_passes(self, tmp_path):
        parquet_file = tmp_path / "valid.parquet"
        table = pa.table({"col1": [1, 2, 3], "col2": ["a", "b", "c"]})
        pq.write_table(table, parquet_file)
        handler = ParquetFileHandler()
        handler.validate(str(parquet_file))  # should not raise

    def test_missing_file_raises_file_processing_error(self):
        handler = ParquetFileHandler()
        with pytest.raises(FileProcessingError):
            handler.validate("/nonexistent/path/data.parquet")

    def test_empty_file_raises_invalid_input(self, tmp_path):
        parquet_file = tmp_path / "empty.parquet"
        parquet_file.write_bytes(b"")
        handler = ParquetFileHandler()
        with pytest.raises(InvalidInputError, match="empty"):
            handler.validate(str(parquet_file))

    def test_invalid_magic_bytes_raises_invalid_input(self, tmp_path):
        parquet_file = tmp_path / "notparquet.parquet"
        parquet_file.write_bytes(b"NOT_A_PARQUET_FILE_AT_ALL")
        handler = ParquetFileHandler()
        with pytest.raises(InvalidInputError, match="PAR1 header"):
            handler.validate(str(parquet_file))

    def test_valid_header_bad_footer_raises_invalid_input(self, tmp_path):
        parquet_file = tmp_path / "badfooter.parquet"
        # Write PAR1 header but no valid footer
        parquet_file.write_bytes(b"PAR1" + b"\x00" * 20 + b"XXXX")
        handler = ParquetFileHandler()
        with pytest.raises(InvalidInputError, match="PAR1 footer"):
            handler.validate(str(parquet_file))
