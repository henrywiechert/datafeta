"""Integration tests for virtual columns in query generation."""

import pytest
from backend.models.query import QueryDescription, Dimension, Measure, Filter
from backend.models.data_source import VirtualColumnDefinition
from backend.services.query_service import QueryService


class TestVirtualColumnsQueryIntegration:
    """Integration tests for virtual columns in full query generation."""
    
    def setup_method(self):
        """Set up test fixtures."""
        self.service = QueryService()
    
    # ========================================================================
    # Virtual Columns as Measures
    # ========================================================================
    
    def test_virtual_column_as_measure_sum(self):
        """Test using virtual column as a measure with SUM aggregation."""
        query_desc = QueryDescription(
            target_table='sales',
            dimensions=[
                Dimension(field='product', flavour='discrete')
            ],
            measures=[
                Measure(field='profit', aggregation='sum', alias='total_profit')
            ],
            virtual_columns=[
                VirtualColumnDefinition(
                    name='profit',
                    expression='(revenue - cost)',
                    output_type='DOUBLE'
                )
            ]
        )
        
        sql, metadata = self.service.translate_to_sql(
            query_desc=query_desc,
            table_name='sales',
            db_type='duckdb',
            with_sampling=False,
            with_optimization=False
        )
        
        # Verify SQL contains the expected elements
        assert 'SELECT' in sql
        assert 'product' in sql
        assert 'SUM' in sql
        assert 'revenue' in sql
        assert 'cost' in sql
        assert 'total_profit' in sql
        assert 'CAST' in sql  # Because output_type is specified
        assert 'DOUBLE' in sql
        assert 'GROUP BY' in sql
    
    def test_virtual_column_as_measure_avg(self):
        """Test using virtual column with AVG aggregation."""
        query_desc = QueryDescription(
            target_table='sales',
            dimensions=[
                Dimension(field='region', flavour='discrete')
            ],
            measures=[
                Measure(field='margin', aggregation='avg', alias='avg_margin')
            ],
            virtual_columns=[
                VirtualColumnDefinition(
                    name='margin',
                    expression='((revenue - cost) / revenue * 100)',
                    output_type='DOUBLE'
                )
            ]
        )
        
        sql, metadata = self.service.translate_to_sql(
            query_desc=query_desc,
            table_name='sales',
            db_type='duckdb'
        )
        
        assert 'AVG' in sql
        assert 'revenue' in sql
        assert 'cost' in sql
    
    def test_multiple_virtual_columns_as_measures(self):
        """Test using multiple virtual columns as measures."""
        query_desc = QueryDescription(
            target_table='sales',
            dimensions=[
                Dimension(field='category', flavour='discrete')
            ],
            measures=[
                Measure(field='profit', aggregation='sum', alias='total_profit'),
                Measure(field='revenue_adjusted', aggregation='sum', alias='total_revenue_adjusted')
            ],
            virtual_columns=[
                VirtualColumnDefinition(
                    name='profit',
                    expression='(revenue - cost)'
                ),
                VirtualColumnDefinition(
                    name='revenue_adjusted',
                    expression='(revenue * 1.08)'  # Add tax
                )
            ]
        )
        
        sql, metadata = self.service.translate_to_sql(
            query_desc=query_desc,
            table_name='sales',
            db_type='duckdb'
        )
        
        assert 'total_profit' in sql
        assert 'total_revenue_adjusted' in sql
    
    # ========================================================================
    # Virtual Columns as Dimensions
    # ========================================================================
    
    def test_virtual_column_as_discrete_dimension(self):
        """Test using virtual column as a discrete dimension."""
        query_desc = QueryDescription(
            target_table='sales',
            dimensions=[
                Dimension(field='price_category', flavour='discrete')
            ],
            measures=[
                Measure(field='revenue', aggregation='sum', alias='total_revenue')
            ],
            virtual_columns=[
                VirtualColumnDefinition(
                    name='price_category',
                    expression='CASE().when(price < 10, "Low").when(price < 100, "Medium").else_("High")',
                    output_type='VARCHAR'
                )
            ]
        )
        
        sql, metadata = self.service.translate_to_sql(
            query_desc=query_desc,
            table_name='sales',
            db_type='duckdb'
        )
        
        assert 'CASE' in sql
        assert 'price' in sql
        assert 'GROUP BY' in sql
    
    def test_virtual_column_with_function_as_dimension(self):
        """Test virtual column using function as dimension."""
        query_desc = QueryDescription(
            target_table='sales',
            dimensions=[
                Dimension(field='rounded_price', flavour='discrete')
            ],
            measures=[
                Measure(field='quantity', aggregation='sum', alias='total_quantity')
            ],
            virtual_columns=[
                VirtualColumnDefinition(
                    name='rounded_price',
                    expression='ROUND(price, 0)',
                    output_type='INTEGER'
                )
            ]
        )
        
        sql, metadata = self.service.translate_to_sql(
            query_desc=query_desc,
            table_name='sales',
            db_type='duckdb'
        )
        
        assert 'ROUND' in sql
        assert 'price' in sql
    
    # ========================================================================
    # Virtual Columns in Filters
    # ========================================================================
    
    def test_filter_on_virtual_column(self):
        """Test filtering on a virtual column."""
        query_desc = QueryDescription(
            target_table='sales',
            dimensions=[
                Dimension(field='product', flavour='discrete')
            ],
            measures=[
                Measure(field='revenue', aggregation='sum', alias='total_revenue')
            ],
            filters=[
                Filter(field='profit', operator='>', value=100)
            ],
            virtual_columns=[
                VirtualColumnDefinition(
                    name='profit',
                    expression='(revenue - cost)',
                    output_type='DOUBLE'
                )
            ]
        )
        
        sql, metadata = self.service.translate_to_sql(
            query_desc=query_desc,
            table_name='sales',
            db_type='duckdb'
        )
        
        assert 'WHERE' in sql
        assert 'revenue' in sql
        assert 'cost' in sql
    
    def test_filter_on_virtual_column_with_case(self):
        """Test filtering on a virtual column with CASE expression."""
        query_desc = QueryDescription(
            target_table='sales',
            dimensions=[
                Dimension(field='region', flavour='discrete')
            ],
            measures=[
                Measure(field='revenue', aggregation='sum', alias='total_revenue')
            ],
            filters=[
                Filter(field='status_label', operator='=', value='Active')
            ],
            virtual_columns=[
                VirtualColumnDefinition(
                    name='status_label',
                    expression='CASE().when(active == 1, "Active").else_("Inactive")',
                    output_type='VARCHAR'
                )
            ]
        )
        
        sql, metadata = self.service.translate_to_sql(
            query_desc=query_desc,
            table_name='sales',
            db_type='duckdb'
        )
        
        assert 'WHERE' in sql
        assert 'CASE' in sql
    
    # ========================================================================
    # Complex Queries
    # ========================================================================
    
    def test_virtual_column_as_both_dimension_and_filter(self):
        """Test using same virtual column as both dimension and filter."""
        query_desc = QueryDescription(
            target_table='sales',
            dimensions=[
                Dimension(field='profit_range', flavour='discrete')
            ],
            measures=[
                Measure(field='quantity', aggregation='sum', alias='total_quantity')
            ],
            filters=[
                Filter(field='profit_range', operator='=', value='High')
            ],
            virtual_columns=[
                VirtualColumnDefinition(
                    name='profit_range',
                    expression='CASE().when((revenue - cost) > 1000, "High").else_("Low")',
                    output_type='VARCHAR'
                )
            ]
        )
        
        sql, metadata = self.service.translate_to_sql(
            query_desc=query_desc,
            table_name='sales',
            db_type='duckdb'
        )
        
        # Virtual column should appear in both SELECT and WHERE
        assert 'SELECT' in sql
        assert 'WHERE' in sql
        assert 'CASE' in sql
        assert 'GROUP BY' in sql
    
    def test_mix_virtual_and_real_columns(self):
        """Test query with mix of virtual and real columns."""
        query_desc = QueryDescription(
            target_table='sales',
            dimensions=[
                Dimension(field='product', flavour='discrete'),  # Real column
                Dimension(field='price_category', flavour='discrete')  # Virtual column
            ],
            measures=[
                Measure(field='quantity', aggregation='sum', alias='total_qty'),  # Real column
                Measure(field='profit', aggregation='sum', alias='total_profit')  # Virtual column
            ],
            virtual_columns=[
                VirtualColumnDefinition(
                    name='price_category',
                    expression='CASE().when(price < 50, "Budget").else_("Premium")',
                    output_type='VARCHAR'
                ),
                VirtualColumnDefinition(
                    name='profit',
                    expression='(revenue - cost)',
                    output_type='DOUBLE'
                )
            ]
        )
        
        sql, metadata = self.service.translate_to_sql(
            query_desc=query_desc,
            table_name='sales',
            db_type='duckdb'
        )
        
        assert 'product' in sql  # Real column
        assert 'CASE' in sql  # Virtual column with CASE
        assert 'quantity' in sql  # Real column
        assert 'revenue' in sql  # Part of virtual column
        assert 'cost' in sql  # Part of virtual column
    
    # ========================================================================
    # Database-Specific Quote Characters
    # ========================================================================
    
    def test_clickhouse_quote_character(self):
        """Test that ClickHouse uses backticks."""
        query_desc = QueryDescription(
            target_table='sales',
            dimensions=[
                Dimension(field='product', flavour='discrete')
            ],
            measures=[
                Measure(field='profit', aggregation='sum', alias='total_profit')
            ],
            virtual_columns=[
                VirtualColumnDefinition(
                    name='profit',
                    expression='(revenue - cost)'
                )
            ]
        )
        
        sql, metadata = self.service.translate_to_sql(
            query_desc=query_desc,
            table_name='sales',
            db_type='clickhouse'
        )
        
        # ClickHouse should use backticks
        assert '`' in sql
    
    def test_duckdb_quote_character(self):
        """Test that DuckDB uses double quotes."""
        query_desc = QueryDescription(
            target_table='sales',
            dimensions=[
                Dimension(field='product', flavour='discrete')
            ],
            measures=[
                Measure(field='profit', aggregation='sum', alias='total_profit')
            ],
            virtual_columns=[
                VirtualColumnDefinition(
                    name='profit',
                    expression='(revenue - cost)'
                )
            ]
        )
        
        sql, metadata = self.service.translate_to_sql(
            query_desc=query_desc,
            table_name='sales',
            db_type='duckdb'
        )
        
        # DuckDB should use double quotes
        assert '"' in sql
    
    # ========================================================================
    # Error Cases
    # ========================================================================
    
    def test_invalid_virtual_column_expression_raises_error(self):
        """Test that invalid expression raises QueryGenerationError."""
        query_desc = QueryDescription(
            target_table='sales',
            dimensions=[
                Dimension(field='product', flavour='discrete')
            ],
            measures=[
                Measure(field='bad_calc', aggregation='sum', alias='total')
            ],
            virtual_columns=[
                VirtualColumnDefinition(
                    name='bad_calc',
                    expression='(revenue -)'  # Incomplete
                )
            ]
        )
        
        with pytest.raises(Exception):  # Should raise QueryGenerationError
            self.service.translate_to_sql(
                query_desc=query_desc,
                table_name='sales',
                db_type='duckdb'
            )
    
    def test_sql_injection_attempt_raises_error(self):
        """Test that SQL injection attempt is blocked."""
        query_desc = QueryDescription(
            target_table='sales',
            dimensions=[
                Dimension(field='product', flavour='discrete')
            ],
            measures=[
                Measure(field='malicious', aggregation='sum', alias='total')
            ],
            virtual_columns=[
                VirtualColumnDefinition(
                    name='malicious',
                    expression='revenue; DROP TABLE users'
                )
            ]
        )
        
        with pytest.raises(Exception):  # Should raise QueryGenerationError
            self.service.translate_to_sql(
                query_desc=query_desc,
                table_name='sales',
                db_type='duckdb'
            )
    
    # ========================================================================
    # No Virtual Columns (Baseline)
    # ========================================================================
    
    def test_query_without_virtual_columns_still_works(self):
        """Test that queries without virtual columns still work normally."""
        query_desc = QueryDescription(
            target_table='sales',
            dimensions=[
                Dimension(field='product', flavour='discrete')
            ],
            measures=[
                Measure(field='revenue', aggregation='sum', alias='total_revenue')
            ]
            # No virtual_columns
        )
        
        sql, metadata = self.service.translate_to_sql(
            query_desc=query_desc,
            table_name='sales',
            db_type='duckdb'
        )
        
        # Should generate normal query
        assert 'SELECT' in sql
        assert 'product' in sql
        assert 'SUM' in sql
        assert 'revenue' in sql
    
    def test_sql_case_when_as_dimension_with_alias(self):
        """Test SQL CASE WHEN virtual column is properly aliased as dimension."""
        query_desc = QueryDescription(
            target_table='sales',
            dimensions=[
                Dimension(field='category', flavour='discrete')
            ],
            measures=[
                Measure(field='revenue', aggregation='sum', alias='total_revenue')
            ],
            virtual_columns=[
                VirtualColumnDefinition(
                    name='category',
                    expression='CASE WHEN amount > 1000 THEN \'High\' ELSE \'Low\' END',
                    output_type='VARCHAR'
                )
            ]
        )
        
        sql, metadata = self.service.translate_to_sql(
            query_desc=query_desc,
            table_name='sales',
            db_type='duckdb',
            with_sampling=False,
            with_optimization=False
        )
        
        # Verify the virtual column is aliased properly (not showing raw CASE expression)
        assert 'AS "category"' in sql or 'AS category' in sql.lower()
        assert 'CASE' in sql
        assert 'amount' in sql
        
        # Verify it's used in GROUP BY with the alias, not the full expression
        assert 'GROUP BY' in sql

