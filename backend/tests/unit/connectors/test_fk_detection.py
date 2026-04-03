"""Unit tests for the shared FK detection utility."""
import pytest
from backend.connectors.fk_detection import detect_foreign_keys_by_naming_convention
from backend.models.data_source import Column, ForeignKeyRelationship


class TestDetectForeignKeysByNamingConvention:
    """Tests for the extracted, database-agnostic FK detection function."""

    # -- basic patterns --------------------------------------------------------

    def test_basic_underscore_id(self):
        """customer_id -> customers.id"""
        table_columns = {
            'orders': [
                Column(name='id', data_type='INTEGER'),
                Column(name='customer_id', data_type='INTEGER'),
                Column(name='total', data_type='DOUBLE'),
            ],
            'customers': [
                Column(name='id', data_type='INTEGER'),
                Column(name='name', data_type='VARCHAR'),
            ],
        }
        rels = detect_foreign_keys_by_naming_convention(table_columns)
        assert len(rels) == 1
        assert rels[0].from_table == 'orders'
        assert rels[0].from_columns == ['customer_id']
        assert rels[0].to_table == 'customers'
        assert rels[0].to_columns == ['id']
        assert rels[0].relationship_type == 'many_to_one'

    def test_camel_case_id(self):
        """CustomerId -> customers.id"""
        table_columns = {
            'orders': [
                Column(name='id', data_type='INTEGER'),
                Column(name='CustomerId', data_type='INTEGER'),
                Column(name='ProductId', data_type='INTEGER'),
                Column(name='total', data_type='DOUBLE'),
            ],
            'customers': [
                Column(name='id', data_type='INTEGER'),
                Column(name='name', data_type='VARCHAR'),
            ],
            'products': [
                Column(name='id', data_type='INTEGER'),
                Column(name='name', data_type='VARCHAR'),
            ],
        }
        rels = detect_foreign_keys_by_naming_convention(table_columns)
        assert len(rels) == 2
        rel_dict = {(r.from_table, r.from_columns[0]): (r.to_table, r.to_columns[0]) for r in rels}
        assert ('orders', 'CustomerId') in rel_dict
        assert ('orders', 'ProductId') in rel_dict
        assert rel_dict[('orders', 'CustomerId')] == ('customers', 'id')
        assert rel_dict[('orders', 'ProductId')] == ('products', 'id')

    # -- plural handling -------------------------------------------------------

    def test_singular_fk_to_plural_table(self):
        """user_id -> users.id (singular FK prefix matches plural table)."""
        table_columns = {
            'posts': [
                Column(name='id', data_type='INTEGER'),
                Column(name='user_id', data_type='INTEGER'),
            ],
            'users': [
                Column(name='id', data_type='INTEGER'),
                Column(name='username', data_type='VARCHAR'),
            ],
        }
        rels = detect_foreign_keys_by_naming_convention(table_columns)
        assert len(rels) == 1
        assert rels[0].from_columns == ['user_id']
        assert rels[0].to_table == 'users'

    def test_plural_es_suffix(self):
        """status_id -> statuses.id"""
        table_columns = {
            'tickets': [
                Column(name='id', data_type='INTEGER'),
                Column(name='status_id', data_type='INTEGER'),
            ],
            'statuses': [
                Column(name='id', data_type='INTEGER'),
                Column(name='label', data_type='VARCHAR'),
            ],
        }
        rels = detect_foreign_keys_by_naming_convention(table_columns)
        assert len(rels) == 1
        assert rels[0].to_table == 'statuses'

    # -- PK column resolution --------------------------------------------------

    def test_pk_column_named_table_id(self):
        """FK resolves to camelCase PK like constructorId."""
        table_columns = {
            'results': [
                Column(name='constructor_id', data_type='INTEGER'),
            ],
            'constructors': [
                Column(name='constructorId', data_type='INTEGER'),
                Column(name='name', data_type='VARCHAR'),
            ],
        }
        rels = detect_foreign_keys_by_naming_convention(table_columns)
        assert len(rels) == 1
        assert rels[0].to_columns == ['constructorId']

    def test_pk_column_underscore_id(self):
        """Target table has _id as PK."""
        table_columns = {
            'orders': [
                Column(name='customer_id', data_type='INTEGER'),
            ],
            'customers': [
                Column(name='_id', data_type='INTEGER'),
                Column(name='name', data_type='VARCHAR'),
            ],
        }
        rels = detect_foreign_keys_by_naming_convention(table_columns)
        assert len(rels) == 1
        assert rels[0].to_columns == ['_id']

    # -- multiple relationships ------------------------------------------------

    def test_multiple_fks(self):
        """order_items has FK to both orders and products."""
        table_columns = {
            'orders': [
                Column(name='id', data_type='INTEGER'),
                Column(name='customer_id', data_type='INTEGER'),
            ],
            'customers': [
                Column(name='id', data_type='INTEGER'),
            ],
            'products': [
                Column(name='id', data_type='INTEGER'),
            ],
            'order_items': [
                Column(name='id', data_type='INTEGER'),
                Column(name='order_id', data_type='INTEGER'),
                Column(name='product_id', data_type='INTEGER'),
            ],
        }
        rels = detect_foreign_keys_by_naming_convention(table_columns)
        rel_dict = {(r.from_table, r.from_columns[0]): (r.to_table, r.to_columns[0]) for r in rels}
        assert ('orders', 'customer_id') in rel_dict
        assert ('order_items', 'order_id') in rel_dict
        assert ('order_items', 'product_id') in rel_dict
        assert len(rels) == 3

    # -- edge cases / no matches -----------------------------------------------

    def test_no_relationships(self):
        """Tables with no FK-like columns produce empty result."""
        table_columns = {
            'sales_data': [
                Column(name='date', data_type='DATE'),
                Column(name='amount', data_type='DOUBLE'),
            ],
            'inventory': [
                Column(name='item_code', data_type='VARCHAR'),
                Column(name='quantity', data_type='INTEGER'),
            ],
        }
        rels = detect_foreign_keys_by_naming_convention(table_columns)
        assert rels == []

    def test_empty_input(self):
        assert detect_foreign_keys_by_naming_convention({}) == []

    def test_single_table(self):
        """A single table can't produce any relationships."""
        table_columns = {
            'orders': [
                Column(name='id', data_type='INTEGER'),
                Column(name='customer_id', data_type='INTEGER'),
            ],
        }
        rels = detect_foreign_keys_by_naming_convention(table_columns)
        assert rels == []

    def test_column_named_just_id_skipped(self):
        """A column literally named 'id' should not be treated as a FK to some table."""
        table_columns = {
            'orders': [
                Column(name='id', data_type='INTEGER'),
                Column(name='total', data_type='DOUBLE'),
            ],
            'customers': [
                Column(name='id', data_type='INTEGER'),
            ],
        }
        rels = detect_foreign_keys_by_naming_convention(table_columns)
        assert rels == []

    def test_no_pk_in_target_table(self):
        """FK-like column found but target table has no id column -> no match."""
        table_columns = {
            'orders': [
                Column(name='customer_id', data_type='INTEGER'),
            ],
            'customers': [
                Column(name='name', data_type='VARCHAR'),
                Column(name='email', data_type='VARCHAR'),
            ],
        }
        rels = detect_foreign_keys_by_naming_convention(table_columns)
        assert rels == []

    def test_fk_column_does_not_match_any_table(self):
        """region_id has no 'regions' or 'region' table."""
        table_columns = {
            'orders': [
                Column(name='region_id', data_type='INTEGER'),
            ],
            'customers': [
                Column(name='id', data_type='INTEGER'),
            ],
        }
        rels = detect_foreign_keys_by_naming_convention(table_columns)
        assert rels == []

    def test_table_with_failed_columns_skipped(self):
        """If a table has no columns in the dict, it should be gracefully skipped."""
        table_columns = {
            'orders': [
                Column(name='customer_id', data_type='INTEGER'),
            ],
            # customers exists as a potential target but has no columns parsed
        }
        rels = detect_foreign_keys_by_naming_convention(table_columns)
        assert rels == []
