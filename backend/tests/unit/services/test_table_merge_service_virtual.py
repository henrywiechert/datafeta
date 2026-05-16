# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Unit tests for TableMergeService.get_merged_columns_with_virtual method."""

import pytest
from unittest.mock import Mock, MagicMock
from backend.exceptions import InvalidInputError
from backend.services.table_merge_service import TableMergeService
from backend.models.data_source import (
    Column,
    VirtualTableDefinition,
    MergedColumnsResponse,
    TableJoinDefinition,
    UnionTableDefinition
)


class TestTableMergeServiceVirtual:
    """Test suite for TableMergeService.get_merged_columns_with_virtual."""
    
    def setup_method(self):
        """Set up test fixtures."""
        self.mock_connector = Mock()
        self.service = TableMergeService(self.mock_connector)
    
    def test_get_merged_columns_with_virtual_join_mode(self):
        """Should create JOIN virtual table and return merged columns."""
        # Mock the methods that would be called
        mock_virtual_table = VirtualTableDefinition(
            primary_table="orders",
            mode="join",
            joined_tables=[
                TableJoinDefinition(
                    table_name="customers",
                    join_type="LEFT",
                    on_conditions=["orders.customer_id = customers.id"]
                )
            ]
        )
        
        mock_columns = [
            Column(name="orders.id", data_type="INTEGER", is_datetime=False),
            Column(name="orders.total", data_type="DECIMAL", is_datetime=False),
            Column(name="customers.name", data_type="VARCHAR", is_datetime=False)
        ]
        
        mock_response = MergedColumnsResponse(
            columns=mock_columns,
            virtual_table=mock_virtual_table
        )
        
        self.service.create_virtual_table = Mock(return_value=mock_virtual_table)
        self.service.get_merged_columns = Mock(return_value=mock_response)
        
        result = self.service.get_merged_columns_with_virtual(
            database="shop_db",
            primary_table="orders",
            joined_tables=["customers"],
            union_tables=None,
            auto_detect=False
        )
        
        # Verify correct methods called
        self.service.create_virtual_table.assert_called_once_with(
            database="shop_db",
            primary_table="orders",
            joined_tables=["customers"],
            auto_detect=False,
            relationships=None
        )
        
        self.service.get_merged_columns.assert_called_once()
        
        # Should add _source_database and _source_table virtual columns for ALL modes
        assert len(result.columns) == 5
        assert any(col.name == "_source_database" for col in result.columns)
        assert any(col.name == "_source_table" for col in result.columns)
    
    def test_get_merged_columns_with_virtual_union_mode(self):
        """Should create UNION virtual table and add _source_table column."""
        # Mock the methods
        mock_virtual_table = VirtualTableDefinition(
            primary_table="logs_2024_01",
            mode="union",
            union_tables=[
                UnionTableDefinition(table_name="logs_2024_02"),
                UnionTableDefinition(table_name="logs_2024_03")
            ]
        )
        
        mock_columns = [
            Column(name="timestamp", data_type="TIMESTAMP", is_datetime=True),
            Column(name="level", data_type="VARCHAR", is_datetime=False),
            Column(name="message", data_type="TEXT", is_datetime=False)
        ]
        
        mock_response = MergedColumnsResponse(
            columns=mock_columns,
            virtual_table=mock_virtual_table
        )
        
        self.service.create_union_virtual_table = Mock(return_value=mock_virtual_table)
        self.service.get_merged_columns = Mock(return_value=mock_response)
        
        result = self.service.get_merged_columns_with_virtual(
            database="logs_db",
            primary_table="logs_2024_01",
            joined_tables=None,
            union_tables=["logs_2024_02", "logs_2024_03"],
            auto_detect=True
        )
        
        # Verify correct methods called
        self.service.create_union_virtual_table.assert_called_once_with(
            database="logs_db",
            primary_table="logs_2024_01",
            union_tables=["logs_2024_02", "logs_2024_03"]
        )
        
        self.service.get_merged_columns.assert_called_once()
        
        # Should ADD _source_database and _source_table for UNION mode
        assert len(result.columns) == 5
        
        source_db_col = next((col for col in result.columns if col.name == "_source_database"), None)
        assert source_db_col is not None
        assert source_db_col.data_type == "String"
        assert source_db_col.is_datetime is False
        assert source_db_col.table_name is None
        
        source_table_col = next((col for col in result.columns if col.name == "_source_table"), None)
        assert source_table_col is not None
        assert source_table_col.data_type == "String"
        assert source_table_col.is_datetime is False
        assert source_table_col.table_name is None
    
    def test_get_merged_columns_with_virtual_auto_detect_joins(self):
        """Should auto-detect joins when requested."""
        mock_virtual_table = VirtualTableDefinition(
            primary_table="products",
            mode="join",
            joined_tables=[
                TableJoinDefinition(
                    table_name="categories",
                    join_type="LEFT",
                    on_conditions=["products.category_id = categories.id"]
                )
            ]
        )
        
        mock_response = MergedColumnsResponse(
            columns=[],
            virtual_table=mock_virtual_table
        )
        
        self.service.create_virtual_table = Mock(return_value=mock_virtual_table)
        self.service.get_merged_columns = Mock(return_value=mock_response)
        
        result = self.service.get_merged_columns_with_virtual(
            database="shop_db",
            primary_table="products",
            joined_tables=None,
            union_tables=None,
            auto_detect=True
        )
        
        # Should call with auto_detect=True
        self.service.create_virtual_table.assert_called_once_with(
            database="shop_db",
            primary_table="products",
            joined_tables=None,
            auto_detect=True,
            relationships=None
        )
    
    def test_get_merged_columns_with_virtual_default_join_mode(self):
        """Should default to JOIN mode when no union_tables provided."""
        mock_virtual_table = VirtualTableDefinition(
            primary_table="employees",
            mode="join",
            joined_tables=[]
        )
        
        mock_response = MergedColumnsResponse(
            columns=[],
            virtual_table=mock_virtual_table
        )
        
        self.service.create_virtual_table = Mock(return_value=mock_virtual_table)
        self.service.get_merged_columns = Mock(return_value=mock_response)
        
        result = self.service.get_merged_columns_with_virtual(
            database="hr_db",
            primary_table="employees"
        )
        
        # Should use create_virtual_table (JOIN mode)
        self.service.create_virtual_table.assert_called_once()
        assert result.virtual_table.mode == "join"
    
    def test_get_merged_columns_with_virtual_union_priority(self):
        """Should use UNION mode when union_tables provided, even if joined_tables also provided."""
        mock_virtual_table = VirtualTableDefinition(
            primary_table="events",
            mode="union",
            union_tables=[UnionTableDefinition(table_name="events2")]
        )
        
        mock_response = MergedColumnsResponse(
            columns=[Column(name="id", data_type="INT", is_datetime=False)],
            virtual_table=mock_virtual_table
        )
        
        self.service.create_union_virtual_table = Mock(return_value=mock_virtual_table)
        self.service.get_merged_columns = Mock(return_value=mock_response)
        
        result = self.service.get_merged_columns_with_virtual(
            database="analytics_db",
            primary_table="events",
            joined_tables=["some_table"],  # This should be ignored
            union_tables=["events2"]
        )
        
        # Should use create_union_virtual_table
        self.service.create_union_virtual_table.assert_called_once()
        # Should NOT call create_virtual_table
        assert not hasattr(self.service.create_virtual_table, 'called') or \
               not self.service.create_virtual_table.called
        
        # Should add _source_table
        assert any(col.name == "_source_table" for col in result.columns)
    
    def test_get_merged_columns_with_virtual_empty_union_list(self):
        """Should handle empty union tables list."""
        mock_virtual_table = VirtualTableDefinition(
            primary_table="data",
            mode="union",
            union_tables=[]
        )
        
        mock_response = MergedColumnsResponse(
            columns=[],
            virtual_table=mock_virtual_table
        )
        
        self.service.create_union_virtual_table = Mock(return_value=mock_virtual_table)
        self.service.get_merged_columns = Mock(return_value=mock_response)
        
        result = self.service.get_merged_columns_with_virtual(
            database="test_db",
            primary_table="data",
            union_tables=[]
        )
        
        # Should still add _source_table for UNION mode
        assert any(col.name == "_source_table" for col in result.columns)

    def test_get_merged_columns_with_virtual_rejects_oversized_union_list(self):
        """Should reject union requests that exceed the backend safety limit."""
        oversized_union = [f'table_{index}' for index in range(self.service.MAX_UNION_TABLES + 1)]

        with pytest.raises(InvalidInputError, match='safety limit'):
            self.service.get_merged_columns_with_virtual(
                database='test_db',
                primary_table='data',
                union_tables=oversized_union,
            )
