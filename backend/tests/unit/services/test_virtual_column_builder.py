"""Unit tests for VirtualColumnExpressionBuilder."""

import pytest
from pypika import Table
from pypika.terms import Term

from backend.services.query_components.virtual_column_builder import VirtualColumnExpressionBuilder
from backend.models.data_source import VirtualColumnDefinition
from backend.exceptions import QueryGenerationError


class TestVirtualColumnExpressionBuilder:
    """Test suite for VirtualColumnExpressionBuilder."""
    
    def setup_method(self):
        """Set up test fixtures."""
        self.table = Table('sales')
        self.table_map = {'sales': self.table}
        self.builder = VirtualColumnExpressionBuilder(self.table_map, self.table)
    
    # ========================================================================
    # Basic Arithmetic Operations
    # ========================================================================
    
    def test_simple_subtraction(self):
        """Test basic subtraction operation."""
        vc = VirtualColumnDefinition(
            name='profit',
            expression='(revenue - cost)',
        )
        
        term = self.builder.register_virtual_column(vc)
        assert isinstance(term, Term)
        assert self.builder.is_virtual_column('profit')
    
    def test_simple_multiplication(self):
        """Test basic multiplication operation."""
        vc = VirtualColumnDefinition(
            name='total',
            expression='(price * quantity)',
        )
        
        term = self.builder.register_virtual_column(vc)
        assert isinstance(term, Term)
        sql = term.get_sql(quote_char='"')
        assert 'price' in sql
        assert 'quantity' in sql
    
    def test_complex_arithmetic(self):
        """Test complex arithmetic with multiple operations."""
        vc = VirtualColumnDefinition(
            name='margin',
            expression='((revenue - cost) / revenue * 100)',
        )
        
        term = self.builder.register_virtual_column(vc)
        assert isinstance(term, Term)
        sql = term.get_sql(quote_char='"')
        assert 'revenue' in sql
        assert 'cost' in sql
    
    def test_arithmetic_with_type_cast(self):
        """Test arithmetic with output type casting."""
        vc = VirtualColumnDefinition(
            name='profit',
            expression='(revenue - cost)',
            output_type='DOUBLE'
        )
        
        term = self.builder.register_virtual_column(vc)
        sql = term.get_sql(quote_char='"')
        assert 'CAST' in sql
        assert 'DOUBLE' in sql
    
    # ========================================================================
    # Function Calls
    # ========================================================================
    
    def test_round_function(self):
        """Test ROUND function."""
        vc = VirtualColumnDefinition(
            name='rounded_price',
            expression='ROUND(price, 2)',
        )
        
        term = self.builder.register_virtual_column(vc)
        sql = term.get_sql(quote_char='"')
        assert 'ROUND' in sql
        assert 'price' in sql
    
    def test_abs_function(self):
        """Test ABS function."""
        vc = VirtualColumnDefinition(
            name='abs_value',
            expression='ABS(difference)',
        )
        
        term = self.builder.register_virtual_column(vc)
        sql = term.get_sql(quote_char='"')
        assert 'ABS' in sql
    
    def test_coalesce_function(self):
        """Test COALESCE function for NULL handling."""
        vc = VirtualColumnDefinition(
            name='safe_discount',
            expression='COALESCE(discount, 0)',
        )
        
        term = self.builder.register_virtual_column(vc)
        sql = term.get_sql(quote_char='"')
        assert 'COALESCE' in sql
        assert 'discount' in sql
    
    def test_string_functions(self):
        """Test string manipulation functions."""
        vc = VirtualColumnDefinition(
            name='upper_name',
            expression='UPPER(name)',
            output_type='VARCHAR'
        )
        
        term = self.builder.register_virtual_column(vc)
        sql = term.get_sql(quote_char='"')
        assert 'UPPER' in sql
        assert 'name' in sql

    def test_split_function_clickhouse_positive_index(self):
        """SPLIT should extract the requested part for ClickHouse dialect."""
        builder = VirtualColumnExpressionBuilder(self.table_map, self.table, db_type='clickhouse')
        vc = VirtualColumnDefinition(
            name='process_segment',
            expression='SPLIT(process_name, ":", 2)'
        )

        term = builder.register_virtual_column(vc)
        sql = term.get_sql(quote_char='`')
        assert 'splitByString' in sql
        assert 'arraySlice' in sql

    def test_split_function_clickhouse_negative_index(self):
        """Negative SPLIT index should count from the end for ClickHouse."""
        builder = VirtualColumnExpressionBuilder(self.table_map, self.table, db_type='clickhouse')
        vc = VirtualColumnDefinition(
            name='last_segment',
            expression='SPLIT(process_name, ":", -1)'
        )

        term = builder.register_virtual_column(vc)
        sql = term.get_sql(quote_char='`')
        assert 'toInt64' in sql  # Ensures safe length casting for negative math
        assert 'arraySlice' in sql

    def test_split_function_duckdb(self):
        """SPLIT should map to split_part on DuckDB-compatible sources."""
        builder = VirtualColumnExpressionBuilder(self.table_map, self.table, db_type='duckdb')
        vc = VirtualColumnDefinition(
            name='file_prefix',
            expression='SPLIT(file_name, "_", -1)'
        )

        term = builder.register_virtual_column(vc)
        sql = term.get_sql(quote_char='"')
        assert 'split_part' in sql

    def test_split_function_alias_rendering(self):
        """Custom split term must honor aliases assigned downstream."""
        builder = VirtualColumnExpressionBuilder(self.table_map, self.table, db_type='clickhouse')
        vc = VirtualColumnDefinition(
            name='device_segment',
            expression='SPLIT(device_id, "-", 1)'
        )

        term = builder.register_virtual_column(vc)
        sql = term.as_('device_segment').get_sql(quote_char='`')
        assert 'device_segment' in sql
        assert sql.strip().endswith('`device_segment`')
    
    # ========================================================================
    # Conditional Expressions (CASE WHEN)
    # ========================================================================
    
    def test_simple_case_when(self):
        """Test simple CASE WHEN conditional."""
        vc = VirtualColumnDefinition(
            name='status_label',
            expression='CASE().when(active == 1, "Active").else_("Inactive")',
            output_type='VARCHAR'
        )
        
        term = self.builder.register_virtual_column(vc)
        sql = term.get_sql(quote_char='"')
        assert 'CASE' in sql
        assert 'active' in sql
    
    def test_multi_condition_case_when(self):
        """Test CASE WHEN with multiple conditions."""
        vc = VirtualColumnDefinition(
            name='price_category',
            expression='CASE().when(price < 10, "Low").when(price < 100, "Medium").else_("High")',
            output_type='VARCHAR'
        )
        
        term = self.builder.register_virtual_column(vc)
        sql = term.get_sql(quote_char='"')
        assert 'CASE' in sql
        assert 'price' in sql
    
    def test_case_with_arithmetic(self):
        """Test CASE WHEN with arithmetic in conditions."""
        vc = VirtualColumnDefinition(
            name='adjusted_price',
            expression='CASE().when((revenue - cost) > 1000, price * 1.1).else_(price)',
        )
        
        term = self.builder.register_virtual_column(vc)
        assert isinstance(term, Term)
    
    # ========================================================================
    # Qualified Column Names (Multi-table)
    # ========================================================================
    
    def test_qualified_column_names(self):
        """Test table.column syntax for multi-table queries."""
        table1 = Table('orders')
        table2 = Table('customers')
        builder = VirtualColumnExpressionBuilder(
            {'orders': table1, 'customers': table2}, 
            table1
        )
        
        vc = VirtualColumnDefinition(
            name='value_per_customer',
            expression='(orders.total / customers.count)',
        )
        
        term = builder.register_virtual_column(vc)
        assert isinstance(term, Term)
    
    def test_mixed_qualified_unqualified(self):
        """Test mix of qualified and unqualified column names."""
        table1 = Table('orders')
        table2 = Table('customers')
        builder = VirtualColumnExpressionBuilder(
            {'orders': table1, 'customers': table2}, 
            table1
        )
        
        vc = VirtualColumnDefinition(
            name='combined',
            expression='(orders.amount + base_fee)',  # base_fee is from default table
        )
        
        term = builder.register_virtual_column(vc)
        assert isinstance(term, Term)
    
    # ========================================================================
    # Security Validation
    # ========================================================================
    
    def test_forbidden_keyword_drop(self):
        """Test that DROP keyword is rejected."""
        vc = VirtualColumnDefinition(
            name='malicious',
            expression='DROP TABLE users'
        )
        
        with pytest.raises(QueryGenerationError, match='Forbidden keyword'):
            self.builder.register_virtual_column(vc)
    
    def test_forbidden_keyword_delete(self):
        """Test that DELETE keyword is rejected."""
        vc = VirtualColumnDefinition(
            name='malicious',
            expression='DELETE FROM sales'
        )
        
        with pytest.raises(QueryGenerationError, match='Forbidden keyword'):
            self.builder.register_virtual_column(vc)
    
    def test_forbidden_keyword_insert(self):
        """Test that INSERT keyword is rejected."""
        vc = VirtualColumnDefinition(
            name='malicious',
            expression='INSERT INTO logs VALUES (1)'
        )
        
        with pytest.raises(QueryGenerationError, match='Forbidden keyword'):
            self.builder.register_virtual_column(vc)
    
    def test_forbidden_sql_comment(self):
        """Test that SQL comments are rejected."""
        vc = VirtualColumnDefinition(
            name='malicious',
            expression='revenue -- comment here'
        )
        
        with pytest.raises(QueryGenerationError, match='Forbidden keyword'):
            self.builder.register_virtual_column(vc)
    
    def test_forbidden_statement_separator(self):
        """Test that statement separator is rejected."""
        vc = VirtualColumnDefinition(
            name='malicious',
            expression='revenue; DROP TABLE users'
        )
        
        with pytest.raises(QueryGenerationError, match='Forbidden keyword'):
            self.builder.register_virtual_column(vc)
    
    def test_forbidden_python_dunder(self):
        """Test that Python dunder methods are rejected."""
        vc = VirtualColumnDefinition(
            name='malicious',
            expression='__import__("os").system("ls")'
        )
        
        with pytest.raises(QueryGenerationError, match='cannot contain'):
            self.builder.register_virtual_column(vc)
    
    # ========================================================================
    # Virtual Column References (Not Allowed)
    # ========================================================================
    
    def test_no_virtual_column_references(self):
        """Test that virtual columns cannot reference other virtual columns."""
        # Register first virtual column
        vc1 = VirtualColumnDefinition(
            name='profit',
            expression='(revenue - cost)'
        )
        self.builder.register_virtual_column(vc1)
        
        # Try to reference it in second virtual column
        vc2 = VirtualColumnDefinition(
            name='margin',
            expression='(profit / revenue * 100)'
        )
        
        with pytest.raises(QueryGenerationError, match='cannot reference other virtual columns'):
            self.builder.register_virtual_column(vc2)
    
    def test_virtual_column_reference_in_complex_expression(self):
        """Test VC reference detection in complex expressions."""
        vc1 = VirtualColumnDefinition(
            name='adjusted_cost',
            expression='(cost * 1.1)'
        )
        self.builder.register_virtual_column(vc1)
        
        vc2 = VirtualColumnDefinition(
            name='final_profit',
            expression='(revenue - adjusted_cost)'  # References vc1
        )
        
        with pytest.raises(QueryGenerationError, match='cannot reference other virtual columns'):
            self.builder.register_virtual_column(vc2)
    
    # ========================================================================
    # Duplicate Names
    # ========================================================================
    
    def test_duplicate_names_rejected(self):
        """Test that duplicate virtual column names are rejected."""
        vc1 = VirtualColumnDefinition(
            name='profit',
            expression='(revenue - cost)'
        )
        self.builder.register_virtual_column(vc1)
        
        # Try to register another with same name
        vc2 = VirtualColumnDefinition(
            name='profit',
            expression='(price * quantity)'
        )
        
        with pytest.raises(QueryGenerationError, match='Duplicate'):
            self.builder.register_virtual_column(vc2)
    
    # ========================================================================
    # Column Reference Extraction
    # ========================================================================
    
    def test_extract_column_references_simple(self):
        """Test extraction of simple column references."""
        expression = '(revenue - cost)'
        columns = self.builder._extract_column_references(expression)
        
        assert 'revenue' in columns
        assert 'cost' in columns
        assert len(columns) == 2
    
    def test_extract_column_references_with_functions(self):
        """Test that function names are not extracted as columns."""
        expression = 'ROUND(price, 2)'
        columns = self.builder._extract_column_references(expression)
        
        assert 'price' in columns
        assert 'ROUND' not in columns
    
    def test_extract_qualified_columns(self):
        """Test extraction of qualified column names."""
        expression = '(orders.amount + customers.discount)'
        columns = self.builder._extract_column_references(expression)
        
        assert 'orders.amount' in columns
        assert 'customers.discount' in columns
    
    def test_extract_ignores_keywords(self):
        """Test that SQL keywords are not extracted as columns."""
        expression = 'CASE WHEN price > 100 THEN 1 ELSE 0 END'
        columns = self.builder._extract_column_references(expression)
        
        assert 'price' in columns
        assert 'CASE' not in columns
        assert 'WHEN' not in columns
        assert 'THEN' not in columns
        assert 'ELSE' not in columns
        assert 'END' not in columns
    
    # ========================================================================
    # Error Handling
    # ========================================================================
    
    def test_invalid_syntax_error(self):
        """Test that invalid syntax raises appropriate error."""
        vc = VirtualColumnDefinition(
            name='invalid',
            expression='(revenue -)'  # Incomplete expression
        )
        
        with pytest.raises(QueryGenerationError, match='Invalid virtual column expression'):
            self.builder.register_virtual_column(vc)
    
    def test_undefined_column_warning(self):
        """Test handling of references to undefined columns."""
        # Note: This doesn't fail at registration time because we can't validate
        # column existence without schema info. It would fail at query execution.
        vc = VirtualColumnDefinition(
            name='test',
            expression='(nonexistent_column + 1)'
        )
        
        # Should register successfully - validation happens at execution
        term = self.builder.register_virtual_column(vc)
        assert isinstance(term, Term)
    
    # ========================================================================
    # Retrieval and Lookup
    # ========================================================================
    
    def test_get_virtual_column_term(self):
        """Test retrieving a registered virtual column term."""
        vc = VirtualColumnDefinition(
            name='profit',
            expression='(revenue - cost)'
        )
        registered_term = self.builder.register_virtual_column(vc)
        
        retrieved_term = self.builder.get_virtual_column_term('profit')
        assert retrieved_term is registered_term
    
    def test_get_nonexistent_virtual_column(self):
        """Test retrieving a non-existent virtual column returns None."""
        term = self.builder.get_virtual_column_term('nonexistent')
        assert term is None
    
    def test_is_virtual_column_true(self):
        """Test is_virtual_column for registered column."""
        vc = VirtualColumnDefinition(
            name='profit',
            expression='(revenue - cost)'
        )
        self.builder.register_virtual_column(vc)
        
        assert self.builder.is_virtual_column('profit') is True
    
    def test_is_virtual_column_false(self):
        """Test is_virtual_column for non-registered column."""
        assert self.builder.is_virtual_column('revenue') is False
    
    # ========================================================================
    # Multiple Virtual Columns
    # ========================================================================
    
    def test_register_multiple_virtual_columns(self):
        """Test registering multiple independent virtual columns."""
        vc1 = VirtualColumnDefinition(
            name='profit',
            expression='(revenue - cost)'
        )
        vc2 = VirtualColumnDefinition(
            name='total',
            expression='(price * quantity)'
        )
        vc3 = VirtualColumnDefinition(
            name='discount_amount',
            expression='(price * discount_pct / 100)'
        )
        
        self.builder.register_virtual_column(vc1)
        self.builder.register_virtual_column(vc2)
        self.builder.register_virtual_column(vc3)
        
        assert self.builder.is_virtual_column('profit')
        assert self.builder.is_virtual_column('total')
        assert self.builder.is_virtual_column('discount_amount')
        assert len(self.builder._registered_names) == 3
    
    # ========================================================================
    # Edge Cases
    # ========================================================================
    
    def test_expression_with_numbers(self):
        """Test expressions with numeric literals."""
        vc = VirtualColumnDefinition(
            name='tax',
            expression='(price * 0.08)'
        )
        
        term = self.builder.register_virtual_column(vc)
        sql = term.get_sql(quote_char='"')
        assert 'price' in sql
    
    def test_expression_with_negative_numbers(self):
        """Test expressions with negative numbers."""
        vc = VirtualColumnDefinition(
            name='adjusted',
            expression='(value + -10)'
        )
        
        term = self.builder.register_virtual_column(vc)
        assert isinstance(term, Term)
    
    def test_empty_table_map(self):
        """Test builder with empty table map (edge case)."""
        default_table = Table('default')
        builder = VirtualColumnExpressionBuilder({}, default_table)
        
        vc = VirtualColumnDefinition(
            name='test',
            expression='(a + b)'
        )
        
        term = builder.register_virtual_column(vc)
        assert isinstance(term, Term)
    
    # ========================================================================
    # SQL CASE WHEN Syntax Support
    # ========================================================================
    
    def test_sql_case_when_simple(self):
        """Test SQL CASE WHEN syntax with simple condition."""
        vc = VirtualColumnDefinition(
            name='category',
            expression='CASE WHEN amount > 1000 THEN \'High\' ELSE \'Low\' END',
            output_type='VARCHAR'
        )
        
        term = self.builder.register_virtual_column(vc)
        sql = term.get_sql(quote_char='"')
        assert 'CASE' in sql
        assert 'amount' in sql
    
    def test_sql_case_when_multiple_conditions(self):
        """Test SQL CASE WHEN with multiple WHEN clauses."""
        vc = VirtualColumnDefinition(
            name='grade',
            expression='CASE WHEN score >= 90 THEN \'A\' WHEN score >= 80 THEN \'B\' WHEN score >= 70 THEN \'C\' ELSE \'F\' END',
            output_type='VARCHAR'
        )
        
        term = self.builder.register_virtual_column(vc)
        sql = term.get_sql(quote_char='"')
        assert 'CASE' in sql
        assert 'score' in sql
    
    def test_sql_case_when_no_else(self):
        """Test SQL CASE WHEN without ELSE clause."""
        vc = VirtualColumnDefinition(
            name='flag',
            expression='CASE WHEN active = 1 THEN \'Yes\' END',
        )
        
        # Should convert = to ==
        term = self.builder.register_virtual_column(vc)
        assert isinstance(term, Term)
    
    def test_sql_case_when_with_arithmetic(self):
        """Test SQL CASE WHEN with arithmetic in result."""
        vc = VirtualColumnDefinition(
            name='adjusted_price',
            expression='CASE WHEN day = 20 THEN rate * 2 ELSE rate END',
        )
        
        term = self.builder.register_virtual_column(vc)
        sql = term.get_sql(quote_char='"')
        assert 'CASE' in sql
        assert 'day' in sql
        assert 'rate' in sql
    
    def test_sql_case_when_mixed_case_keywords(self):
        """Test SQL CASE WHEN with mixed case keywords."""
        vc = VirtualColumnDefinition(
            name='status',
            expression='case when value > 100 then \'high\' else \'low\' end',
        )
        
        term = self.builder.register_virtual_column(vc)
        assert isinstance(term, Term)
    
    def test_pypika_case_still_works(self):
        """Test that Pypika Python syntax still works."""
        vc = VirtualColumnDefinition(
            name='category',
            expression='CASE().when(amount > 1000, "High").else_("Low")',
            output_type='VARCHAR'
        )
        
        term = self.builder.register_virtual_column(vc)
        sql = term.get_sql(quote_char='"')
        assert 'CASE' in sql

