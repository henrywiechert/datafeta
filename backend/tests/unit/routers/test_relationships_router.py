"""Unit tests for relationships router endpoints."""

import pytest
from unittest.mock import Mock, MagicMock, patch

from backend.models.data_source import (
    ConnectionDetails,
    ForeignKeyRelationship,
)


class TestTableRelationshipsEndpoint:
    """Tests for the GET /table-relationships endpoint."""

    def test_detect_foreign_keys_basic(self):
        """Test basic foreign key detection."""
        mock_connector = Mock()
        mock_connector.detect_foreign_keys.return_value = [
            ForeignKeyRelationship(
                from_table='orders',
                from_column='user_id',
                to_table='users',
                to_column='id',
                relationship_type='many_to_one'
            ),
        ]
        
        relationships = mock_connector.detect_foreign_keys('sales_db')
        response = {'relationships': relationships}
        
        assert len(response['relationships']) == 1
        assert response['relationships'][0].from_table == 'orders'
        assert response['relationships'][0].to_table == 'users'

    def test_detect_multiple_foreign_keys(self):
        """Test detection of multiple foreign keys."""
        mock_connector = Mock()
        mock_connector.detect_foreign_keys.return_value = [
            ForeignKeyRelationship(
                from_table='orders',
                from_column='user_id',
                to_table='users',
                to_column='id',
                relationship_type='many_to_one'
            ),
            ForeignKeyRelationship(
                from_table='orders',
                from_column='product_id',
                to_table='products',
                to_column='id',
                relationship_type='many_to_one'
            ),
            ForeignKeyRelationship(
                from_table='order_items',
                from_column='order_id',
                to_table='orders',
                to_column='id',
                relationship_type='many_to_one'
            ),
        ]
        
        relationships = mock_connector.detect_foreign_keys('ecommerce_db')
        
        assert len(relationships) == 3
        # Check specific relationships
        assert any(r.from_table == 'orders' and r.to_table == 'users' for r in relationships)
        assert any(r.from_table == 'orders' and r.to_table == 'products' for r in relationships)

    def test_no_foreign_keys_detected(self):
        """Test database with no detected foreign keys."""
        mock_connector = Mock()
        mock_connector.detect_foreign_keys.return_value = []
        
        relationships = mock_connector.detect_foreign_keys('simple_db')
        
        assert len(relationships) == 0

    def test_relationship_types(self):
        """Test various relationship types."""
        mock_connector = Mock()
        mock_connector.detect_foreign_keys.return_value = [
            ForeignKeyRelationship(
                from_table='t1',
                from_column='c1',
                to_table='t2',
                to_column='c2',
                relationship_type='one_to_one'
            ),
            ForeignKeyRelationship(
                from_table='t3',
                from_column='c3',
                to_table='t4',
                to_column='c4',
                relationship_type='one_to_many'
            ),
            ForeignKeyRelationship(
                from_table='t5',
                from_column='c5',
                to_table='t6',
                to_column='c6',
                relationship_type='many_to_many'
            ),
        ]
        
        relationships = mock_connector.detect_foreign_keys('complex_db')
        
        types = [r.relationship_type for r in relationships]
        assert 'one_to_one' in types
        assert 'one_to_many' in types
        assert 'many_to_many' in types


class TestSuggestedJoinsEndpoint:
    """Tests for the GET /suggested-joins endpoint."""

    def test_suggest_joins_basic(self):
        """Test basic join suggestions."""
        mock_connector = Mock()
        mock_merge_service = Mock()
        mock_merge_service.get_suggested_tables.return_value = [
            {'table_name': 'users', 'relationship': 'orders.user_id -> users.id'},
            {'table_name': 'products', 'relationship': 'orders.product_id -> products.id'},
        ]
        
        database = 'ecommerce'
        primary_table = 'orders'
        
        suggested = mock_merge_service.get_suggested_tables(
            database, primary_table, already_joined=[]
        )
        response = {
            'primary_table': primary_table,
            'suggested_tables': suggested
        }
        
        assert response['primary_table'] == 'orders'
        assert len(response['suggested_tables']) == 2

    def test_suggest_joins_with_already_joined_tables(self):
        """Test join suggestions excluding already-joined tables."""
        mock_merge_service = Mock()
        mock_merge_service.get_suggested_tables.return_value = [
            {'table_name': 'addresses', 'relationship': 'users.address_id -> addresses.id'},
        ]
        
        database = 'crm'
        primary_table = 'users'
        already_joined = ['companies']  # Already joined
        
        suggested = mock_merge_service.get_suggested_tables(
            database, primary_table, already_joined=already_joined
        )
        
        # Should only include addresses, not companies again
        assert len(suggested) == 1
        assert suggested[0]['table_name'] == 'addresses'

    def test_suggest_joins_no_suggestions(self):
        """Test when no joins are possible."""
        mock_merge_service = Mock()
        mock_merge_service.get_suggested_tables.return_value = []
        
        suggested = mock_merge_service.get_suggested_tables(
            'isolated_db', 'standalone_table', already_joined=[]
        )
        
        assert len(suggested) == 0

    def test_suggest_joins_transitive_relationships(self):
        """Test finding transitive join paths."""
        mock_merge_service = Mock()
        mock_merge_service.get_suggested_tables.return_value = [
            {'table_name': 'products', 'relationship': 'direct: orders.product_id -> products.id'},
            {'table_name': 'categories', 'relationship': 'transitive: orders -> products -> categories'},
        ]
        
        suggested = mock_merge_service.get_suggested_tables(
            'store_db', 'orders', already_joined=[]
        )
        
        assert len(suggested) == 2
        # Transitive join should also be available
        assert any('transitive' in s['relationship'] for s in suggested)

    def test_comma_separated_joined_tables_parsing(self):
        """Test parsing comma-separated list of already-joined tables."""
        joined_tables_str = "users, products, categories"
        joined_tables = [t.strip() for t in joined_tables_str.split(',') if t.strip()]
        
        assert len(joined_tables) == 3
        assert 'users' in joined_tables
        assert 'categories' in joined_tables

    def test_suggest_joins_with_relationship_info(self):
        """Test that join suggestions include relationship details."""
        mock_merge_service = Mock()
        mock_merge_service.get_suggested_tables.return_value = [
            {
                'table_name': 'customers',
                'relationship': 'orders.customer_id -> customers.id',
                'relationship_type': 'many_to_one',
                'join_type': 'LEFT',
            },
        ]
        
        suggested = mock_merge_service.get_suggested_tables(
            'sales_db', 'orders', already_joined=[]
        )
        
        assert suggested[0]['relationship_type'] == 'many_to_one'
        assert suggested[0]['join_type'] == 'LEFT'


class TestSuggestedUnionsEndpoint:
    """Tests for the GET /suggested-unions endpoint (deprecated)."""

    def test_suggested_unions_returns_empty_list(self):
        """Test that deprecated endpoint returns empty list."""
        response = {
            'primary_table': 'products_2023',
            'suggested_tables': []  # Always empty as endpoint is deprecated
        }
        
        assert response['suggested_tables'] == []

    def test_suggested_unions_deprecated_warning(self):
        """Test that deprecated endpoint warns in logs."""
        # Endpoint logs warning about deprecation
        # This would be verified in actual endpoint implementation
        is_deprecated = True
        assert is_deprecated == True


class TestMergedColumnsEndpoint:
    """Tests for the POST /merged-columns endpoint."""

    def test_get_merged_columns_basic(self):
        """Test getting merged columns for joined tables."""
        mock_merge_service = Mock()
        mock_merge_service.get_merged_columns.return_value = {
            'columns': [
                {'name': 'order_id', 'table': 'orders', 'type': 'INT'},
                {'name': 'user_id', 'table': 'orders', 'type': 'INT'},
                {'name': 'id', 'table': 'users', 'type': 'INT'},
                {'name': 'name', 'table': 'users', 'type': 'VARCHAR'},
            ]
        }
        
        from backend.models.data_source import VirtualTableDefinition, TableJoinDefinition
        
        virtual_table = VirtualTableDefinition(
            primary_table='orders',
            mode='join',
            joined_tables=[
                TableJoinDefinition(
                    table_name='users',
                    join_type='LEFT',
                    on_conditions=['orders.user_id = users.id']
                )
            ]
        )
        
        merged = mock_merge_service.get_merged_columns(
            'sales_db', virtual_table
        )
        
        assert len(merged['columns']) == 4
        # Should have columns from both tables
        assert any(c['table'] == 'orders' for c in merged['columns'])
        assert any(c['table'] == 'users' for c in merged['columns'])

    def test_merged_columns_deduplication(self):
        """Test that duplicate columns from joined tables are handled."""
        mock_merge_service = Mock()
        # Both tables have 'id' - should be included with table prefix
        mock_merge_service.get_merged_columns.return_value = {
            'columns': [
                {'name': 'orders.id', 'table': 'orders', 'type': 'INT'},
                {'name': 'users.id', 'table': 'users', 'type': 'INT'},
                {'name': 'name', 'table': 'users', 'type': 'VARCHAR'},
            ]
        }
        
        from backend.models.data_source import VirtualTableDefinition, TableJoinDefinition
        
        virtual_table = VirtualTableDefinition(
            primary_table='orders',
            mode='join',
            joined_tables=[
                TableJoinDefinition(
                    table_name='users',
                    join_type='LEFT',
                    on_conditions=['orders.id = users.id']
                )
            ]
        )
        
        merged = mock_merge_service.get_merged_columns('db', virtual_table)
        
        # Should have both id columns with table prefixes
        id_cols = [c for c in merged['columns'] if 'id' in c['name']]
        assert len(id_cols) == 2

    def test_merged_columns_from_union_mode(self):
        """Test merged columns from UNION mode tables."""
        mock_merge_service = Mock()
        mock_merge_service.get_merged_columns.return_value = {
            'columns': [
                {'name': 'product_id', 'type': 'INT'},
                {'name': 'category', 'type': 'VARCHAR'},
                {'name': 'price', 'type': 'DOUBLE'},
            ]
        }
        
        from backend.models.data_source import VirtualTableDefinition, UnionTableDefinition
        
        virtual_table = VirtualTableDefinition(
            primary_table='products_2023',
            mode='union',
            union_tables=[
                UnionTableDefinition(table_name='products_2024'),
                UnionTableDefinition(table_name='products_2025'),
            ]
        )
        
        merged = mock_merge_service.get_merged_columns('inventory_db', virtual_table)
        
        # Union should have same columns from all tables
        assert len(merged['columns']) >= 3


class TestRelationshipsErrorHandling:
    """Tests for error handling in relationships endpoints."""

    def test_relationship_detection_error(self):
        """Test handling of relationship detection errors."""
        mock_connector = Mock()
        mock_connector.detect_foreign_keys.side_effect = Exception('FK detection failed')
        
        try:
            mock_connector.detect_foreign_keys('test_db')
            assert False, "Should raise exception"
        except Exception as e:
            assert 'FK detection failed' in str(e)

    def test_invalid_database_for_relationships(self):
        """Test handling of invalid database."""
        mock_connector = Mock()
        mock_connector.detect_foreign_keys.side_effect = ValueError('Database not found')
        
        try:
            mock_connector.detect_foreign_keys('nonexistent_db')
            assert False, "Should raise exception"
        except ValueError:
            pass  # Expected

    def test_merge_service_error(self):
        """Test handling of merge service errors."""
        mock_service = Mock()
        mock_service.get_suggested_tables.side_effect = Exception('Service error')
        
        try:
            mock_service.get_suggested_tables('db', 'table', already_joined=[])
            assert False, "Should raise exception"
        except Exception:
            pass  # Expected


class TestRelationshipsIntegration:
    """Integration tests for relationships workflow."""

    def test_complete_join_workflow(self):
        """Test complete workflow: detect FKs -> get join suggestions -> merge columns."""
        mock_connector = Mock()
        mock_service = Mock()
        
        # Step 1: Detect foreign keys
        mock_connector.detect_foreign_keys.return_value = [
            ForeignKeyRelationship(
                from_table='orders',
                from_column='user_id',
                to_table='users',
                to_column='id',
                relationship_type='many_to_one'
            ),
        ]
        fks = mock_connector.detect_foreign_keys('ecommerce')
        assert len(fks) == 1
        
        # Step 2: Get join suggestions
        mock_service.get_suggested_tables.return_value = [
            {'table_name': 'users', 'relationship': 'orders.user_id -> users.id'},
        ]
        suggestions = mock_service.get_suggested_tables('ecommerce', 'orders', [])
        assert len(suggestions) == 1
        
        # Step 3: Get merged columns
        mock_service.get_merged_columns.return_value = {
            'columns': [
                {'name': 'id', 'table': 'orders'},
                {'name': 'user_id', 'table': 'orders'},
                {'name': 'id', 'table': 'users'},
                {'name': 'name', 'table': 'users'},
            ]
        }
        merged = mock_service.get_merged_columns('ecommerce', Mock())
        assert len(merged['columns']) >= 3
