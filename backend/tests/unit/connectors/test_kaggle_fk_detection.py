"""Unit tests for Kaggle connector FK detection."""
import pytest
from unittest.mock import patch
from backend.connectors.kaggle_connector import KaggleConnector
from backend.models.data_source import Column, Table


class TestKaggleFKDetection:
    """Test FK detection in Kaggle connector."""

    @pytest.fixture
    def kaggle_connector(self):
        """Create a Kaggle connector instance."""
        return KaggleConnector()
    
    def test_detect_foreign_keys_basic(self, kaggle_connector):
        """Test basic FK detection with customer_id -> customers.id pattern."""
        # Mock list_tables to return orders and customers
        with patch.object(kaggle_connector, 'list_tables') as mock_list_tables, \
             patch.object(kaggle_connector, 'list_columns') as mock_list_columns:
            
            mock_list_tables.return_value = [
                Table(name='orders'),
                Table(name='customers')
            ]
            
            # Define columns for each table
            def list_columns_side_effect(database, table):
                if table == 'orders':
                    return [
                        Column(name='id', data_type='INTEGER'),
                        Column(name='customer_id', data_type='INTEGER'),
                        Column(name='total', data_type='DOUBLE')
                    ]
                elif table == 'customers':
                    return [
                        Column(name='id', data_type='INTEGER'),
                        Column(name='name', data_type='VARCHAR'),
                        Column(name='email', data_type='VARCHAR')
                    ]
                return []
            
            mock_list_columns.side_effect = list_columns_side_effect
            
            # Run FK detection
            relationships = kaggle_connector.detect_foreign_keys('kaggle')
            
            # Verify results
            assert len(relationships) == 1
            assert relationships[0].from_table == 'orders'
            assert relationships[0].from_columns == ['customer_id']
            assert relationships[0].to_table == 'customers'
            assert relationships[0].to_columns == ['id']
            assert relationships[0].relationship_type == 'many_to_one'
    
    def test_detect_foreign_keys_multiple_relationships(self, kaggle_connector):
        """Test FK detection with multiple relationships."""
        with patch.object(kaggle_connector, 'list_tables') as mock_list_tables, \
             patch.object(kaggle_connector, 'list_columns') as mock_list_columns:
            
            mock_list_tables.return_value = [
                Table(name='orders'),
                Table(name='customers'),
                Table(name='products'),
                Table(name='order_items')
            ]
            
            def list_columns_side_effect(database, table):
                if table == 'orders':
                    return [
                        Column(name='id', data_type='INTEGER'),
                        Column(name='customer_id', data_type='INTEGER'),
                        Column(name='order_date', data_type='DATE')
                    ]
                elif table == 'customers':
                    return [
                        Column(name='id', data_type='INTEGER'),
                        Column(name='name', data_type='VARCHAR')
                    ]
                elif table == 'products':
                    return [
                        Column(name='id', data_type='INTEGER'),
                        Column(name='name', data_type='VARCHAR'),
                        Column(name='price', data_type='DOUBLE')
                    ]
                elif table == 'order_items':
                    return [
                        Column(name='id', data_type='INTEGER'),
                        Column(name='order_id', data_type='INTEGER'),
                        Column(name='product_id', data_type='INTEGER'),
                        Column(name='quantity', data_type='INTEGER')
                    ]
                return []
            
            mock_list_columns.side_effect = list_columns_side_effect
            
            # Run FK detection
            relationships = kaggle_connector.detect_foreign_keys('kaggle')
            
            # Verify results - should find 3 relationships
            assert len(relationships) == 3
            
            # Check specific relationships
            rel_dict = {(r.from_table, r.from_columns[0]): (r.to_table, r.to_columns[0]) for r in relationships}
            assert ('orders', 'customer_id') in rel_dict
            assert ('order_items', 'order_id') in rel_dict
            assert ('order_items', 'product_id') in rel_dict
            
            assert rel_dict[('orders', 'customer_id')] == ('customers', 'id')
            assert rel_dict[('order_items', 'order_id')] == ('orders', 'id')
            assert rel_dict[('order_items', 'product_id')] == ('products', 'id')
    
    def test_detect_foreign_keys_no_relationships(self, kaggle_connector):
        """Test FK detection when no relationships exist."""
        with patch.object(kaggle_connector, 'list_tables') as mock_list_tables, \
             patch.object(kaggle_connector, 'list_columns') as mock_list_columns:
            
            mock_list_tables.return_value = [
                Table(name='sales_data'),
                Table(name='inventory')
            ]
            
            def list_columns_side_effect(database, table):
                if table == 'sales_data':
                    return [
                        Column(name='date', data_type='DATE'),
                        Column(name='amount', data_type='DOUBLE'),
                        Column(name='region', data_type='VARCHAR')
                    ]
                elif table == 'inventory':
                    return [
                        Column(name='item_code', data_type='VARCHAR'),
                        Column(name='quantity', data_type='INTEGER')
                    ]
                return []
            
            mock_list_columns.side_effect = list_columns_side_effect
            
            # Run FK detection
            relationships = kaggle_connector.detect_foreign_keys('kaggle')
            
            # Should find no relationships
            assert len(relationships) == 0
    
    def test_detect_foreign_keys_invalid_database(self, kaggle_connector):
        """Test FK detection with invalid database name."""
        from backend.exceptions import InvalidInputError
        
        with pytest.raises(InvalidInputError, match="Invalid database"):
            kaggle_connector.detect_foreign_keys('wrong_database')
    
    def test_detect_foreign_keys_handles_errors_gracefully(self, kaggle_connector):
        """Test that FK detection returns empty list on errors."""
        with patch.object(kaggle_connector, 'list_tables') as mock_list_tables:
            mock_list_tables.side_effect = Exception("Connection error")
            
            # Should not raise exception, just return empty list
            relationships = kaggle_connector.detect_foreign_keys('kaggle')
            assert relationships == []
    
    def test_detect_foreign_keys_plural_variations(self, kaggle_connector):
        """Test FK detection with plural table names."""
        with patch.object(kaggle_connector, 'list_tables') as mock_list_tables, \
             patch.object(kaggle_connector, 'list_columns') as mock_list_columns:
            
            mock_list_tables.return_value = [
                Table(name='posts'),
                Table(name='users'),
                Table(name='categories')  # ends with 'ies'
            ]
            
            def list_columns_side_effect(database, table):
                if table == 'posts':
                    return [
                        Column(name='id', data_type='INTEGER'),
                        Column(name='user_id', data_type='INTEGER'),
                        Column(name='category_id', data_type='INTEGER'),
                        Column(name='title', data_type='VARCHAR')
                    ]
                elif table == 'users':
                    return [
                        Column(name='id', data_type='INTEGER'),
                        Column(name='username', data_type='VARCHAR')
                    ]
                elif table == 'categories':
                    return [
                        Column(name='id', data_type='INTEGER'),
                        Column(name='name', data_type='VARCHAR')
                    ]
                return []
            
            mock_list_columns.side_effect = list_columns_side_effect
            
            # Run FK detection
            relationships = kaggle_connector.detect_foreign_keys('kaggle')
            
            # Should detect user_id relationship (simple plural match)
            # Note: category_id -> categories won't match because it requires -y/+ies transformation
            # which is not currently implemented in the heuristic
            assert len(relationships) == 1
            
            assert relationships[0].from_table == 'posts'
            assert relationships[0].from_columns == ['user_id']
            assert relationships[0].to_table == 'users'
    
    def test_detect_foreign_keys_capital_id_suffix(self, kaggle_connector):
        """Test FK detection with capital Id suffix (e.g., CustomerId, OrderId)."""
        with patch.object(kaggle_connector, 'list_tables') as mock_list_tables, \
             patch.object(kaggle_connector, 'list_columns') as mock_list_columns:
            
            mock_list_tables.return_value = [
                Table(name='orders'),
                Table(name='customers'),
                Table(name='products')
            ]
            
            def list_columns_side_effect(database, table):
                if table == 'orders':
                    return [
                        Column(name='id', data_type='INTEGER'),
                        Column(name='CustomerId', data_type='INTEGER'),  # Capital Id
                        Column(name='ProductId', data_type='INTEGER'),   # Capital Id
                        Column(name='total', data_type='DOUBLE')
                    ]
                elif table == 'customers':
                    return [
                        Column(name='id', data_type='INTEGER'),
                        Column(name='name', data_type='VARCHAR')
                    ]
                elif table == 'products':
                    return [
                        Column(name='id', data_type='INTEGER'),
                        Column(name='name', data_type='VARCHAR'),
                        Column(name='price', data_type='DOUBLE')
                    ]
                return []
            
            mock_list_columns.side_effect = list_columns_side_effect
            
            # Run FK detection
            relationships = kaggle_connector.detect_foreign_keys('kaggle')
            
            # Should detect both relationships
            assert len(relationships) == 2
            
            rel_dict = {(r.from_table, r.from_columns[0]): (r.to_table, r.to_columns[0]) for r in relationships}
            assert ('orders', 'CustomerId') in rel_dict
            assert ('orders', 'ProductId') in rel_dict
            
            assert rel_dict[('orders', 'CustomerId')] == ('customers', 'id')
            assert rel_dict[('orders', 'ProductId')] == ('products', 'id')
