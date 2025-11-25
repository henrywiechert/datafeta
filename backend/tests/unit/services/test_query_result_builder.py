"""Unit tests for QueryResultBuilder."""

import pytest
from backend.services.query_result_builder import QueryResultBuilder
from backend.models.query import QueryResult, ResultDimensions


class TestQueryResultBuilder:
    """Test suite for QueryResultBuilder."""
    
    def test_build_result_basic(self):
        """Should build basic QueryResult with no optimizations."""
        builder = QueryResultBuilder()
        
        columns = [
            {"name": "id", "type": "INTEGER"},
            {"name": "name", "type": "VARCHAR"},
            {"name": "value", "type": "INTEGER"}
        ]
        rows = [
            {"id": 1, "name": "Alice", "value": 100},
            {"id": 2, "name": "Bob", "value": 200},
            {"id": 3, "name": "Charlie", "value": 300}
        ]
        sql_query = "SELECT id, name, value FROM table"
        
        result = builder.build_result(
            columns=columns,
            rows=rows,
            sql_query=sql_query,
            extended_metadata=None
        )
        
        assert isinstance(result, QueryResult)
        assert result.columns == columns
        assert result.rows == rows
        assert result.row_count == 3
        assert result.query_sql == sql_query
        assert result.error is None
        assert result.optimizations_applied is None
        assert result.reduction_factor is None
        assert result.original_estimate is None
        
        # Check result dimensions
        assert result.result_dimensions.rows == 3
        assert result.result_dimensions.columns == 3
        assert result.result_dimensions.size_display == "3 × 3"
    
    def test_build_result_with_optimizations(self):
        """Should build QueryResult with optimization metadata."""
        builder = QueryResultBuilder()
        
        columns = [
            {"name": "category", "type": "VARCHAR"},
            {"name": "count", "type": "INTEGER"}
        ]
        rows = [
            {"category": "A", "count": 50},
            {"category": "B", "count": 75}
        ]
        sql_query = "SELECT category, COUNT(*) FROM table GROUP BY category"
        
        extended_metadata = {
            'optimizations': [
                {
                    "strategy": "adaptive_rounding",
                    "field": "value",
                    "reduction": 0.75,
                    "details": {"precision": 2}
                }
            ]
        }
        
        result = builder.build_result(
            columns=columns,
            rows=rows,
            sql_query=sql_query,
            extended_metadata=extended_metadata
        )
        
        assert result.optimizations_applied is not None
        assert len(result.optimizations_applied) == 1
        assert result.optimizations_applied[0]["strategy"] == "adaptive_rounding"
        assert result.reduction_factor == 0.75
    
    def test_build_result_empty_rows(self):
        """Should handle empty result set."""
        builder = QueryResultBuilder()
        
        columns = [
            {"name": "id", "type": "INTEGER"},
            {"name": "name", "type": "VARCHAR"}
        ]
        rows = []
        sql_query = "SELECT id, name FROM table WHERE 1=0"
        
        result = builder.build_result(
            columns=columns,
            rows=rows,
            sql_query=sql_query
        )
        
        assert result.row_count == 0
        assert result.result_dimensions.rows == 0
        assert result.result_dimensions.columns == 2
        assert result.result_dimensions.size_display == "0 × 2"
    
    def test_build_result_large_dataset(self):
        """Should handle large datasets and format properly."""
        builder = QueryResultBuilder()
        
        columns = [
            {"name": f"col{i}", "type": "INTEGER"}
            for i in range(1, 6)
        ]
        rows = [
            {f"col{i}": j*i for i in range(1, 6)}
            for j in range(1000)
        ]
        sql_query = "SELECT * FROM large_table"
        
        result = builder.build_result(
            columns=columns,
            rows=rows,
            sql_query=sql_query
        )
        
        assert result.row_count == 1000
        assert result.result_dimensions.size_display == "1,000 × 5"  # Comma formatting
    
    def test_build_result_multiple_optimizations(self):
        """Should handle multiple optimization strategies."""
        builder = QueryResultBuilder()
        
        columns = [
            {"name": "field1", "type": "INTEGER"},
            {"name": "field2", "type": "VARCHAR"}
        ]
        rows = [
            {"field1": 1, "field2": "a"},
            {"field2": 3, "field2": "b"}
        ]
        sql_query = "SELECT field1, field2 FROM table"
        
        extended_metadata = {
            'optimizations': [
                {
                    "strategy": "adaptive_rounding",
                    "field": "field1",
                    "reduction": 0.5
                },
                {
                    "strategy": "category_dedup",
                    "field": "field2",
                    "reduction": 0.3
                }
            ]
        }
        
        result = builder.build_result(
            columns=columns,
            rows=rows,
            sql_query=sql_query,
            extended_metadata=extended_metadata
        )
        
        assert len(result.optimizations_applied) == 2
        # Should use first reduction factor found
        assert result.reduction_factor == 0.5
    
    def test_build_result_optimization_without_reduction(self):
        """Should handle optimization metadata without reduction factor."""
        builder = QueryResultBuilder()
        
        columns = [{"name": "x", "type": "INTEGER"}]
        rows = [{"x": 1}]
        sql_query = "SELECT x FROM table"
        
        extended_metadata = {
            'optimizations': [
                {
                    "strategy": "some_strategy",
                    "field": "x"
                    # No 'reduction' key
                }
            ]
        }
        
        result = builder.build_result(
            columns=columns,
            rows=rows,
            sql_query=sql_query,
            extended_metadata=extended_metadata
        )
        
        assert result.optimizations_applied is not None
        assert result.reduction_factor is None  # No reduction found
    
    def test_build_result_invalid_metadata_type(self):
        """Should handle non-list metadata gracefully."""
        builder = QueryResultBuilder()
        
        columns = [{"name": "a", "type": "INTEGER"}]
        rows = [{"a": 1}]
        sql_query = "SELECT a FROM table"
        
        # Pass dict instead of list
        extended_metadata = {"not": "a list"}
        
        result = builder.build_result(
            columns=columns,
            rows=rows,
            sql_query=sql_query,
            extended_metadata=extended_metadata
        )
        
        # Should not crash, should treat as no optimizations
        assert result.optimizations_applied is None
    
    def test_build_result_single_column(self):
        """Should handle single column results."""
        builder = QueryResultBuilder()
        
        columns = [{"name": "count", "type": "INTEGER"}]
        rows = [{"count": 42}]
        sql_query = "SELECT COUNT(*) as count FROM table"
        
        result = builder.build_result(
            columns=columns,
            rows=rows,
            sql_query=sql_query
        )
        
        assert result.result_dimensions.columns == 1
        assert result.result_dimensions.size_display == "1 × 1"
    
    def test_build_result_preserves_hints_and_override_as_none(self):
        """Should set deprecated fields to None."""
        builder = QueryResultBuilder()
        
        result = builder.build_result(
            columns=[{"name": "x", "type": "INTEGER"}],
            rows=[{"x": 1}],
            sql_query="SELECT x FROM t"
        )
        
        # These fields are deprecated/not used anymore
        assert result.optimization_hints_used is None
        assert result.optimization_override is None
