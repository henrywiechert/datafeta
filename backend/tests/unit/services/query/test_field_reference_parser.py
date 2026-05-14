# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Unit tests for FieldReferenceParser."""

import pytest
from unittest.mock import Mock, MagicMock
from pypika import Table

from backend.services.query_components.field_reference_parser import FieldReferenceParser


class TestFieldReferenceParser:
    """Test suite for FieldReferenceParser."""
    
    def test_simple_field_name_single_table(self):
        """Should return field from default table for simple names."""
        sales_table = Table("sales")
        table_map = {"sales": sales_table}
        
        parser = FieldReferenceParser(table_map, sales_table)
        field = parser.parse("amount")
        
        assert field == sales_table["amount"]
        assert field.get_sql(quote_char='"') == '"amount"'
    
    def test_dotted_field_name_single_table(self):
        """Single-table queries should treat dotted names as full column names."""
        sales_table = Table("sales")
        table_map = {"sales": sales_table}
        
        parser = FieldReferenceParser(table_map, sales_table)
        field = parser.parse("sales.metric.value")
        
        # Should not split - entire string is the column name
        assert field.get_sql(quote_char='"') == '"sales.metric.value"'
    
    def test_table_prefix_multi_table(self):
        """Multi-table queries should split table.column references."""
        customers_table = Table("customers")
        orders_table = Table("orders")
        table_map = {
            "customers": customers_table,
            "orders": orders_table
        }
        
        parser = FieldReferenceParser(table_map, customers_table)
        field = parser.parse("orders.total")
        
        # Should resolve to orders table's total field
        assert field == orders_table["total"]
    
    def test_unknown_table_prefix_multi_table(self):
        """Unknown table prefixes should be treated as column names."""
        customers_table = Table("customers")
        orders_table = Table("orders")
        table_map = {
            "customers": customers_table,
            "orders": orders_table
        }
        
        parser = FieldReferenceParser(table_map, customers_table)
        field = parser.parse("products.name")
        
        # 'products' is not in table_map, so treat entire string as column name
        assert field == customers_table["products.name"]
        assert field.get_sql(quote_char='"') == '"products.name"'
    
    def test_default_table_prefix_single_table(self):
        """Single-table query with matching table prefix should not split."""
        sales_table = Table("sales")
        table_map = {"sales": sales_table}
        
        parser = FieldReferenceParser(table_map, sales_table)
        field = parser.parse("sales.revenue")
        
        # Single table and prefix matches default - don't split
        assert field.get_sql(quote_char='"') == '"sales.revenue"'
    
    def test_default_table_prefix_multi_table(self):
        """Multi-table query with default table prefix should split."""
        customers_table = Table("customers")
        orders_table = Table("orders")
        table_map = {
            "customers": customers_table,
            "orders": orders_table
        }
        
        parser = FieldReferenceParser(table_map, customers_table)
        field = parser.parse("customers.name")
        
        # Multi-table query - should split even if it's the default table
        assert field == customers_table["name"]
    
    def test_virtual_column_resolution(self):
        """Should resolve virtual columns before field reference logic."""
        sales_table = Table("sales")
        table_map = {"sales": sales_table}
        
        # Mock virtual column builder
        vc_builder = Mock()
        vc_builder.is_virtual_column.return_value = True
        mock_vc_term = MagicMock()
        mock_vc_term.get_sql.return_value = "CASE WHEN amount > 1000 THEN 'High' ELSE 'Low' END"
        vc_builder.get_virtual_column_term.return_value = mock_vc_term
        
        parser = FieldReferenceParser(table_map, sales_table, vc_builder)
        field = parser.parse("category")
        
        # Should return virtual column term
        assert field == mock_vc_term
        vc_builder.is_virtual_column.assert_called_once_with("category")
        vc_builder.get_virtual_column_term.assert_called_once_with("category")
    
    def test_virtual_column_not_found_fallback(self):
        """Should fallback to regular field if virtual column returns None."""
        sales_table = Table("sales")
        table_map = {"sales": sales_table}
        
        # Mock virtual column builder that returns None
        vc_builder = Mock()
        vc_builder.is_virtual_column.return_value = True
        vc_builder.get_virtual_column_term.return_value = None
        
        parser = FieldReferenceParser(table_map, sales_table, vc_builder)
        field = parser.parse("category")
        
        # Should fallback to regular field
        assert field == sales_table["category"]
    
    def test_no_virtual_column_builder(self):
        """Should work normally without virtual column builder."""
        sales_table = Table("sales")
        table_map = {"sales": sales_table}
        
        parser = FieldReferenceParser(table_map, sales_table, vc_builder=None)
        field = parser.parse("amount")
        
        assert field == sales_table["amount"]
    
    def test_nested_clickhouse_column_single_table(self):
        """Should preserve ClickHouse nested column names in single-table queries."""
        events_table = Table("events")
        table_map = {"events": events_table}
        
        parser = FieldReferenceParser(table_map, events_table)
        field = parser.parse("events.properties.user_id")
        
        # Should treat entire string as column name
        assert field.get_sql(quote_char='`') == '`events.properties.user_id`'
    
    def test_three_way_join(self):
        """Should handle three-table joins correctly."""
        orders_table = Table("orders")
        customers_table = Table("customers")
        products_table = Table("products")
        table_map = {
            "orders": orders_table,
            "customers": customers_table,
            "products": products_table
        }
        
        parser = FieldReferenceParser(table_map, orders_table)
        
        # Each should resolve to correct table
        field1 = parser.parse("orders.amount")
        field2 = parser.parse("customers.name")
        field3 = parser.parse("products.price")
        
        assert field1 == orders_table["amount"]
        assert field2 == customers_table["name"]
        assert field3 == products_table["price"]
    
    def test_field_with_multiple_dots_multi_table(self):
        """Should only split on first dot in multi-table queries."""
        orders_table = Table("orders")
        metrics_table = Table("metrics")
        table_map = {
            "orders": orders_table,
            "metrics": metrics_table
        }
        
        parser = FieldReferenceParser(table_map, orders_table)
        field = parser.parse("metrics.nested.field.name")
        
        # Should split only on first dot
        assert field == metrics_table["nested.field.name"]
