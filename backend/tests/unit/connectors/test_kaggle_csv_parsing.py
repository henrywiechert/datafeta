# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Unit tests for Kaggle connector CSV parsing parity."""

from unittest.mock import MagicMock, patch

import pytest

from backend.connectors.kaggle_connector import KaggleConnector
from backend.models.data_source import Column


class TestKaggleCsvParsing:
    @pytest.fixture
    def connection_details(self, tmp_path):
        return {
            "kaggle_username": "user",
            "kaggle_api_key": "secret",
            "kaggle_dataset": "owner/dataset",
            "download_dir": str(tmp_path),
            "kaggle_csv_files": ["data.csv"],
            "csv_date_format": "%d.%m.%Y",
            "csv_timestamp_format": "%d.%m.%Y %H:%M:%S",
        }

    def test_connect_configures_csv_handler(self, connection_details):
        connector = KaggleConnector()
        with patch.object(connector, "_authenticate_kaggle"):
            connector.connect(connection_details)

        sql = connector._csv_handler.build_reader_sql("/tmp/data.csv")
        assert "dateformat='%d.%m.%Y'" in sql
        assert "timestampformat='%d.%m.%Y %H:%M:%S'" in sql
        assert "ignore_errors" not in sql

    def test_list_columns_uses_csv_handler_sql(self, connection_details, tmp_path):
        csv_file = tmp_path / "data.csv"
        csv_file.write_text("dt,val\n01.02.2023,1\n")

        connector = KaggleConnector()
        executed: list = []

        mock_result = MagicMock()
        mock_result.fetchall.return_value = [("dt", "DATE"), ("val", "INTEGER")]

        mock_con = MagicMock()

        def capture_execute(sql):
            executed.append(sql)
            return mock_result

        mock_con.execute.side_effect = capture_execute

        with patch.object(connector, "_authenticate_kaggle"), patch.object(
            connector, "_list_dataset_files", return_value=["data.csv"]
        ), patch.object(
            connector, "_download_file", return_value=str(csv_file)
        ), patch(
            "backend.connectors.kaggle_connector.duckdb.connect", return_value=mock_con
        ):
            connector.connect(connection_details)
            columns = connector.list_columns(database="kaggle", table="data")  # sanitized from data.csv

        assert len(columns) == 2
        assert columns[0] == Column(name="dt", data_type="DATE", is_datetime=True)
        create_sql = executed[0]
        assert "dateformat='%d.%m.%Y'" in create_sql
        assert "ignore_errors" not in create_sql
