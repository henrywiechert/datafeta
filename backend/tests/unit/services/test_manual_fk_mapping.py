# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Unit tests for manual FK mapping (custom_relationships parameter)."""

from backend.services.table_merge_service import TableMergeService
from backend.models.data_source import ForeignKeyRelationship
from unittest.mock import Mock


def _make_service():
    """Create a TableMergeService with a mock connector that returns heuristic FKs."""
    mock_connector = Mock()
    mock_connector.detect_foreign_keys.return_value = [
        ForeignKeyRelationship(
            from_table='orders',
            from_columns=['customer_id'],
            to_table='customers',
            to_columns=['id'],
            relationship_type='many_to_one'
        ),
    ]
    return TableMergeService(mock_connector), mock_connector


class TestSuggestJoinsWithCustomRelationships:

    def test_custom_relationships_bypasses_heuristic(self):
        """When custom_relationships is provided, connector.detect_foreign_keys is NOT called."""
        service, mock_connector = _make_service()

        custom = [
            ForeignKeyRelationship(
                from_table='a',
                from_columns=['x'],
                to_table='b',
                to_columns=['y'],
            ),
        ]
        result = service.suggest_joins('db', 'a', relationships=custom)

        mock_connector.detect_foreign_keys.assert_not_called()
        assert len(result) == 1
        assert result[0].table_name == 'b'
        assert result[0].on_conditions == ['a.x = b.y']

    def test_empty_list_means_no_relationships(self):
        """An empty list [] means 'no relationships', not 'fall back to heuristic'."""
        service, mock_connector = _make_service()

        result = service.suggest_joins('db', 'orders', relationships=[])

        mock_connector.detect_foreign_keys.assert_not_called()
        assert result == []

    def test_none_falls_back_to_heuristic(self):
        """When relationships=None (default), heuristic detection is used."""
        service, mock_connector = _make_service()

        result = service.suggest_joins('db', 'orders')

        mock_connector.detect_foreign_keys.assert_called_once_with('db')
        assert len(result) == 1
        assert result[0].table_name == 'customers'

    def test_composite_key_on_conditions(self):
        """Custom relationships with composite keys produce multiple on_conditions."""
        service, _ = _make_service()

        custom = [
            ForeignKeyRelationship(
                from_table='t1',
                from_columns=['slot', 'sfn'],
                to_table='t2',
                to_columns=['slot', 'sfn'],
            ),
        ]
        result = service.suggest_joins('db', 't1', relationships=custom)

        assert len(result) == 1
        assert result[0].on_conditions == ['t1.slot = t2.slot', 't1.sfn = t2.sfn']


class TestGetSuggestedTablesWithCustomRelationships:

    def test_custom_relationships_bypasses_heuristic(self):
        service, mock_connector = _make_service()

        custom = [
            ForeignKeyRelationship(
                from_table='t1',
                from_columns=['x'],
                to_table='t2',
                to_columns=['y'],
            ),
        ]
        result = service.get_suggested_tables('db', 't1', relationships=custom)

        mock_connector.detect_foreign_keys.assert_not_called()
        assert result == ['t2']

    def test_empty_list_returns_no_suggestions(self):
        service, mock_connector = _make_service()

        result = service.get_suggested_tables('db', 'orders', relationships=[])

        mock_connector.detect_foreign_keys.assert_not_called()
        assert result == []

    def test_none_falls_back_to_heuristic(self):
        service, mock_connector = _make_service()

        result = service.get_suggested_tables('db', 'orders')

        mock_connector.detect_foreign_keys.assert_called_once_with('db')
        assert 'customers' in result

    def test_transitive_with_custom_relationships(self):
        """Custom relationships work with already_joined for transitive suggestions."""
        service, _ = _make_service()

        custom = [
            ForeignKeyRelationship(
                from_table='a',
                from_columns=['b_id'],
                to_table='b',
                to_columns=['id'],
            ),
            ForeignKeyRelationship(
                from_table='b',
                from_columns=['c_id'],
                to_table='c',
                to_columns=['id'],
            ),
        ]
        # From 'a', only 'b' is directly reachable
        result = service.get_suggested_tables('db', 'a', relationships=custom)
        assert result == ['b']

        # With 'b' already joined, 'c' becomes reachable
        result = service.get_suggested_tables('db', 'a', already_joined=['b'], relationships=custom)
        assert result == ['c']


class TestCreateVirtualTableWithCustomRelationships:

    def test_custom_relationships_used_in_virtual_table(self):
        service, mock_connector = _make_service()

        custom = [
            ForeignKeyRelationship(
                from_table='t1',
                from_columns=['slot', 'sfn'],
                to_table='t2',
                to_columns=['slot', 'sfn'],
            ),
        ]
        vt = service.create_virtual_table(
            'db', 't1', joined_tables=['t2'], relationships=custom
        )

        mock_connector.detect_foreign_keys.assert_not_called()
        assert len(vt.joined_tables) == 1
        assert vt.joined_tables[0].table_name == 't2'
        assert vt.joined_tables[0].on_conditions == ['t1.slot = t2.slot', 't1.sfn = t2.sfn']

    def test_empty_relationships_no_joins(self):
        service, mock_connector = _make_service()

        vt = service.create_virtual_table(
            'db', 'orders', joined_tables=['customers'], relationships=[]
        )

        mock_connector.detect_foreign_keys.assert_not_called()
        assert len(vt.joined_tables) == 0


class TestGetMergedColumnsWithVirtualCustomRelationships:

    def test_custom_relationships_passed_through(self):
        """custom_relationships flows from get_merged_columns_with_virtual to create_virtual_table."""
        service, mock_connector = _make_service()

        # Mock list_columns for the merge columns call
        from backend.models.data_source import Column
        mock_connector.list_columns.return_value = [
            Column(name='id', data_type='INTEGER'),
            Column(name='name', data_type='VARCHAR'),
        ]

        custom = [
            ForeignKeyRelationship(
                from_table='t1',
                from_columns=['t2_id'],
                to_table='t2',
                to_columns=['id'],
            ),
        ]
        result = service.get_merged_columns_with_virtual(
            'db', 't1', joined_tables=['t2'], custom_relationships=custom
        )

        mock_connector.detect_foreign_keys.assert_not_called()
        assert result.virtual_table.joined_tables[0].table_name == 't2'
        assert result.virtual_table.joined_tables[0].on_conditions == ['t1.t2_id = t2.id']
