"""
Test suite for column casting solution.

Tests the ability to cast columns at query time, handling:
- Quoted numbers with thousands separators
- Custom number formats
- Regional formats
"""

import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(__file__))

from backend.services.query_service import QueryService, CastField
from backend.models.query import QueryDescription, Measure, Dimension, OrderBy
from pypika import Table, Field


class TestCastFieldRendering:
    """Test that CastField generates correct SQL."""
    
    def test_cast_field_with_replacement_pattern(self):
        """Test CAST with REPLACE pattern."""
        field = Field('revenue')
        cast_field = CastField(field, 'BIGINT', ',')
        sql = cast_field.get_sql(quote_char='"')
        
        # Should render as: CAST(REPLACE(revenue, ',', '') AS BIGINT)
        assert 'CAST' in sql
        assert 'REPLACE' in sql
        assert 'BIGINT' in sql
        print(f"✓ CAST with replacement: {sql}")
    
    def test_cast_field_without_replacement_pattern(self):
        """Test simple CAST without REPLACE."""
        field = Field('amount')
        cast_field = CastField(field, 'DOUBLE')
        sql = cast_field.get_sql(quote_char='"')
        
        # Should render as: CAST(amount AS DOUBLE)
        assert 'CAST' in sql
        assert 'REPLACE' not in sql
        assert 'DOUBLE' in sql
        print(f"✓ Simple CAST: {sql}")
    
    def test_cast_field_with_quoted_field_name(self):
        """Test CAST with quoted field names (spaces, special chars)."""
        field = Field('revenue amount')
        cast_field = CastField(field, 'DECIMAL(10,2)', ',')
        sql = cast_field.get_sql(quote_char='"')
        
        # Should handle quoted field name
        assert 'CAST' in sql
        assert 'REPLACE' in sql
        assert 'DECIMAL' in sql
        print(f"✓ CAST with quoted field: {sql}")
    
    def test_cast_field_with_alias(self):
        """Test CAST with alias."""
        field = Field('revenue')
        cast_field = CastField(field, 'BIGINT', ',')
        cast_field.alias = 'revenue_numeric'
        sql = cast_field.get_sql(quote_char='"')
        
        # Should include alias
        assert 'CAST' in sql
        assert 'revenue_numeric' in sql
        print(f"✓ CAST with alias: {sql}")


class TestGetFieldWithCast:
    """Test the _get_field_with_cast helper method."""
    
    def test_get_field_without_casts_configured(self):
        """When no casts configured, should return regular field."""
        service = QueryService()
        table = Table('test_table')
        
        field = service._get_field_with_cast(table, 'revenue', None)
        sql = field.get_sql(quote_char='"')
        
        # Should be simple field reference
        assert 'CAST' not in sql
        assert 'revenue' in sql
        print(f"✓ Field without casts: {sql}")
    
    def test_get_field_with_cast_configured(self):
        """When cast configured, should return CastField."""
        service = QueryService()
        table = Table('test_table')
        
        column_casts = {
            'revenue': {
                'cast_type': 'BIGINT',
                'replacement_pattern': ','
            }
        }
        
        field = service._get_field_with_cast(table, 'revenue', column_casts)
        sql = field.get_sql(quote_char='"')
        
        # Should be CAST expression
        assert 'CAST' in sql
        assert 'REPLACE' in sql
        assert 'BIGINT' in sql
        print(f"✓ Field with cast configured: {sql}")
    
    def test_get_field_with_cast_not_in_column_list(self):
        """When column not in cast list, should return regular field."""
        service = QueryService()
        table = Table('test_table')
        
        column_casts = {
            'other_column': {
                'cast_type': 'BIGINT'
            }
        }
        
        field = service._get_field_with_cast(table, 'revenue', column_casts)
        sql = field.get_sql(quote_char='"')
        
        # Should be simple field reference
        assert 'CAST' not in sql
        print(f"✓ Field not in cast list: {sql}")


class TestQueryBuilding:
    """Test complete query building with column casts."""
    
    def test_query_with_measure_casting(self):
        """Test query with measure (SUM) applied to cast field."""
        service = QueryService()
        
        query_desc = QueryDescription(
            target_table='sales',
            measures=[
                Measure(
                    field='revenue',
                    aggregation='sum',
                    alias='total_revenue'
                )
            ],
            column_casts={
                'revenue': {
                    'cast_type': 'BIGINT',
                    'replacement_pattern': ','
                }
            }
        )
        
        sql, metadata = service.translate_to_sql(
            query_desc,
            'sales',
            db_type='duckdb'
        )
        
        # Should contain CAST inside SUM
        assert 'SUM' in sql
        assert 'CAST' in sql
        assert 'REPLACE' in sql
        print(f"✓ Query with measure cast:\n{sql}\n")
    
    def test_query_with_dimension_casting(self):
        """Test query with dimension (GROUP BY) applied to cast field."""
        service = QueryService()
        
        query_desc = QueryDescription(
            target_table='sales',
            dimensions=[
                Dimension(
                    field='category',
                    flavour='discrete'
                )
            ],
            measures=[
                Measure(
                    field='amount',
                    aggregation='sum',
                    alias='total'
                )
            ],
            column_casts={
                'amount': {
                    'cast_type': 'DOUBLE',
                    'replacement_pattern': ','
                }
            }
        )
        
        sql, metadata = service.translate_to_sql(
            query_desc,
            'sales',
            db_type='duckdb'
        )
        
        # Should contain CAST in SELECT and GROUP BY
        assert 'CAST' in sql
        assert 'SUM' in sql
        print(f"✓ Query with dimension cast:\n{sql}\n")
    
    def test_query_with_filter_casting(self):
        """Test query with filter applied to cast field."""
        from backend.models.query import Filter
        
        service = QueryService()
        
        query_desc = QueryDescription(
            target_table='sales',
            dimensions=[
                Dimension(
                    field='date',
                    flavour='discrete'
                )
            ],
            filters=[
                Filter(
                    field='amount',
                    operator='>',
                    value=1000
                )
            ],
            column_casts={
                'amount': {
                    'cast_type': 'INTEGER',
                    'replacement_pattern': ','
                }
            }
        )
        
        sql, metadata = service.translate_to_sql(
            query_desc,
            'sales',
            db_type='duckdb'
        )
        
        # Should contain CAST in WHERE clause
        assert 'CAST' in sql
        assert 'WHERE' in sql
        print(f"✓ Query with filter cast:\n{sql}\n")


class TestScenarios:
    """Test realistic scenarios with quoted numbers."""
    
    def test_scenario_quoted_numbers_with_thousands(self):
        """
        Scenario: CSV with quoted numbers containing thousands separators
        
        Data:
        Period,Revenue,Units
        2025-08-22,"217,351",100
        2025-08-23,"192,615",150
        """
        service = QueryService()
        
        query_desc = QueryDescription(
            target_table='5g_data',
            dimensions=[
                Dimension(field='Period', flavour='discrete')
            ],
            measures=[
                Measure(field='Revenue', aggregation='sum', alias='total_revenue'),
                Measure(field='Units', aggregation='sum', alias='total_units')
            ],
            column_casts={
                'Revenue': {
                    'cast_type': 'BIGINT',
                    'replacement_pattern': ','
                }
            }
        )
        
        sql, _ = service.translate_to_sql(
            query_desc,
            '5g_data',
            db_type='duckdb'
        )
        
        print(f"✓ Scenario - Quoted numbers with thousands:\n{sql}\n")
        
        # Verify SQL contains necessary components
        assert 'CAST' in sql
        assert 'REPLACE' in sql
        assert 'BIGINT' in sql
        assert 'SUM' in sql
        assert 'GROUP BY' in sql
    
    def test_scenario_european_format(self):
        """
        Scenario: European number format with comma as decimal separator
        
        Note: Would need more complex logic for comma→period conversion.
        This demonstrates the simpler case (just removing thousands separator).
        """
        service = QueryService()
        
        query_desc = QueryDescription(
            target_table='european_sales',
            dimensions=[
                Dimension(field='country', flavour='discrete')
            ],
            measures=[
                Measure(field='price', aggregation='avg', alias='avg_price')
            ],
            column_casts={
                'price': {
                    'cast_type': 'DECIMAL(10,2)',
                    'replacement_pattern': ','  # Removes thousands separator
                }
            }
        )
        
        sql, _ = service.translate_to_sql(
            query_desc,
            'european_sales',
            db_type='duckdb'
        )
        
        print(f"✓ Scenario - European format:\n{sql}\n")
        
        assert 'CAST' in sql
        assert 'DECIMAL' in sql


def run_tests():
    """Run all tests."""
    print("=" * 70)
    print("TESTING COLUMN CASTING SOLUTION")
    print("=" * 70)
    
    test_classes = [
        TestCastFieldRendering,
        TestGetFieldWithCast,
        TestQueryBuilding,
        TestScenarios,
    ]
    
    total_tests = 0
    passed_tests = 0
    failed_tests = 0
    
    for test_class in test_classes:
        print(f"\n{test_class.__name__}:")
        print("-" * 70)
        
        instance = test_class()
        test_methods = [m for m in dir(instance) if m.startswith('test_')]
        
        for method_name in test_methods:
            total_tests += 1
            try:
                method = getattr(instance, method_name)
                method()
                passed_tests += 1
            except AssertionError as e:
                failed_tests += 1
                print(f"✗ {method_name}: {e}")
            except Exception as e:
                failed_tests += 1
                print(f"✗ {method_name}: {type(e).__name__}: {e}")
    
    print("\n" + "=" * 70)
    print(f"RESULTS: {passed_tests}/{total_tests} tests passed")
    if failed_tests > 0:
        print(f"⚠️  {failed_tests} tests failed")
    else:
        print("✓ All tests passed!")
    print("=" * 70)


if __name__ == '__main__':
    run_tests()
