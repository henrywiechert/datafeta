# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Unit tests for CsvFileHandler."""

import os
import pytest
import tempfile

from backend.connectors.file_handlers.csv_handler import (
    CsvFileHandler,
    build_csv_handler_config,
)
from backend.exceptions import FileProcessingError, InvalidInputError


DEFAULT_CONFIG = {
    "delimiter": ",",
    "header": True,
    "decimal_separator": ".",
    "thousands_separator": "",
    "date_format": "%Y-%m-%d",
    "timestamp_format": "%Y-%m-%d %H:%M:%S",
    "sample_size": 1000,
    "trim_numeric_whitespace": False,
}


class TestBuildCsvHandlerConfig:
    def test_defaults(self):
        config = build_csv_handler_config({})
        assert config["delimiter"] == ","
        assert config["date_format"] == "%Y-%m-%d"
        assert config["sample_size"] == 1000
        assert config["trim_numeric_whitespace"] is False

    def test_connection_details_keys(self):
        config = build_csv_handler_config(
            {
                "csv_delimiter": ";",
                "csv_has_header": False,
                "csv_date_format": "%d.%m.%Y",
                "csv_sample_full_dataset": True,
                "csv_trim_numeric_whitespace": True,
            }
        )
        assert config["delimiter"] == ";"
        assert config["header"] is False
        assert config["date_format"] == "%d.%m.%Y"
        assert config["sample_size"] == -1
        assert config["trim_numeric_whitespace"] is True


class TestCsvFileHandlerProperties:
    def test_file_extension(self):
        handler = CsvFileHandler(DEFAULT_CONFIG)
        assert handler.FILE_EXTENSION == ".csv"

    def test_file_type(self):
        handler = CsvFileHandler(DEFAULT_CONFIG)
        assert handler.file_type == "csv"

    def test_config_stored(self):
        config = {**DEFAULT_CONFIG, "delimiter": ";"}
        handler = CsvFileHandler(config)
        assert handler.config["delimiter"] == ";"


class TestCsvBuildReaderSql:
    def test_default_config_produces_valid_sql(self):
        handler = CsvFileHandler(DEFAULT_CONFIG)
        sql = handler.build_reader_sql("/tmp/data.csv")
        assert "read_csv_auto('/tmp/data.csv'" in sql
        assert "delim=','" in sql
        assert "header=true" in sql
        assert "quote='\"'" in sql
        assert "decimal_separator='.'" in sql
        assert "dateformat='%Y-%m-%d'" in sql
        assert "timestampformat='%Y-%m-%d %H:%M:%S'" in sql
        assert "sample_size=1000" in sql
        assert "nullstr=" in sql

    def test_custom_sample_size(self):
        config = {**DEFAULT_CONFIG, "sample_size": 5000}
        handler = CsvFileHandler(config)
        sql = handler.build_reader_sql("/tmp/data.csv")
        assert "sample_size=5000" in sql

    def test_full_dataset_sample_size(self):
        config = {**DEFAULT_CONFIG, "sample_size": -1}
        handler = CsvFileHandler(config)
        sql = handler.build_reader_sql("/tmp/data.csv")
        assert "sample_size=-1" in sql

    def test_semicolon_delimiter(self):
        config = {**DEFAULT_CONFIG, "delimiter": ";"}
        handler = CsvFileHandler(config)
        sql = handler.build_reader_sql("/tmp/data.csv")
        assert "delim=';'" in sql

    def test_tab_delimiter_escaped(self):
        config = {**DEFAULT_CONFIG, "delimiter": "\\t"}
        handler = CsvFileHandler(config)
        sql = handler.build_reader_sql("/tmp/data.csv")
        assert "delim='\t'" in sql

    def test_no_header(self):
        config = {**DEFAULT_CONFIG, "header": False}
        handler = CsvFileHandler(config)
        sql = handler.build_reader_sql("/tmp/data.csv")
        assert "header=false" in sql

    def test_comma_decimal_separator(self):
        config = {**DEFAULT_CONFIG, "decimal_separator": ","}
        handler = CsvFileHandler(config)
        sql = handler.build_reader_sql("/tmp/data.csv")
        assert "decimal_separator=','" in sql

    def test_file_path_single_quote_escaped(self):
        handler = CsvFileHandler(DEFAULT_CONFIG)
        sql = handler.build_reader_sql("/tmp/it's/data.csv")
        assert "read_csv_auto('/tmp/it''s/data.csv'" in sql

    def test_delimiter_single_quote_escaped(self):
        config = {**DEFAULT_CONFIG, "delimiter": "'"}
        handler = CsvFileHandler(config)
        sql = handler.build_reader_sql("/tmp/data.csv")
        assert "delim=''''" in sql


class TestCsvValidate:
    def test_valid_csv_passes(self, tmp_path):
        csv_file = tmp_path / "valid.csv"
        csv_file.write_text("col1,col2\n1,2\n3,4")
        handler = CsvFileHandler(DEFAULT_CONFIG)
        handler.validate(str(csv_file))  # should not raise

    def test_missing_file_raises_file_processing_error(self):
        handler = CsvFileHandler(DEFAULT_CONFIG)
        with pytest.raises(FileProcessingError):
            handler.validate("/nonexistent/path/data.csv")

    def test_empty_file_raises_invalid_input(self, tmp_path):
        csv_file = tmp_path / "empty.csv"
        csv_file.write_bytes(b"")
        handler = CsvFileHandler(DEFAULT_CONFIG)
        with pytest.raises(InvalidInputError, match="empty or unreadable"):
            handler.validate(str(csv_file))

    def test_whitespace_only_raises_invalid_input(self, tmp_path):
        csv_file = tmp_path / "blank.csv"
        csv_file.write_text("   \n  ")
        handler = CsvFileHandler(DEFAULT_CONFIG)
        with pytest.raises(InvalidInputError, match="empty or unreadable"):
            handler.validate(str(csv_file))
