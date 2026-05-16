# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Unit tests for ClickHouse connector metadata preview helpers."""

from unittest.mock import Mock

import pytest

from backend.connectors.clickhouse_connector import ClickHouseConnector
from backend.exceptions import InvalidInputError


class TestClickHouseConnectorPatternPreview:
    def test_preview_table_references_supports_regex_mode(self):
        connector = ClickHouseConnector()
        connector.client = Mock()
        connector.client.query.return_value.result_rows = [
            ('db_a', 'orders'),
            ('db_a', 'orders_daily'),
            ('db_b', 'orders'),
        ]

        matches, truncated = connector.preview_table_references(
            database_pattern='db_[ab]',
            table_pattern='orders.*',
            pattern_mode='regex',
            max_databases=10,
            max_total_matches=10,
            max_tables_per_database=10,
        )

        assert matches == [
            {'database': 'db_a', 'tables': ['orders', 'orders_daily']},
            {'database': 'db_b', 'tables': ['orders']},
        ]
        assert truncated is False

    def test_preview_table_references_supports_wildcard_mode(self):
        connector = ClickHouseConnector()

        regex = connector._normalize_pattern('sales_*', 'wildcard', 'database')

        assert regex == '^sales_.*$'

    def test_preview_table_references_wraps_plain_wildcard_input_as_substring(self):
        connector = ClickHouseConnector()

        regex = connector._normalize_pattern('sales', 'wildcard', 'database')

        assert regex == '^.*sales.*$'

    def test_preview_table_references_wraps_plain_regex_input_as_substring(self):
        connector = ClickHouseConnector()

        regex = connector._normalize_pattern('sales', 'regex', 'database')

        assert regex == '.*sales.*'

    def test_preview_table_references_rejects_invalid_regex(self):
        connector = ClickHouseConnector()

        with pytest.raises(InvalidInputError, match='Invalid database pattern'):
            connector.preview_table_references(
                database_pattern='[',
                table_pattern='orders',
                pattern_mode='regex',
                max_databases=10,
                max_total_matches=10,
                max_tables_per_database=10,
            )

    def test_preview_table_references_truncates_per_database_and_total_matches(self):
        connector = ClickHouseConnector()
        connector.client = Mock()
        connector.client.query.return_value.result_rows = [
            ('db_a', 'orders_1'),
            ('db_a', 'orders_2'),
            ('db_a', 'orders_3'),
            ('db_b', 'orders_4'),
            ('db_c', 'orders_5'),
        ]

        matches, truncated = connector.preview_table_references(
            database_pattern='db_.*',
            table_pattern='orders_.*',
            pattern_mode='regex',
            max_databases=2,
            max_total_matches=3,
            max_tables_per_database=2,
        )

        assert matches == [
            {'database': 'db_a', 'tables': ['orders_1', 'orders_2']},
            {'database': 'db_b', 'tables': ['orders_4']},
        ]
        assert truncated is True