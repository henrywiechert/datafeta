"""Test ORDER BY with aliased fields (rounding and temporal binning)."""

import pytest
from unittest.mock import Mock
from backend.models.query import QueryDescription, Dimension, OrderBy
from backend.services.query_service import QueryService
from backend.services.optimization.optimizer import QueryOptimizer
from backend.services.optimization.config import OptimizerConfig
from backend.services.optimization.strategies.base import EstimationResult


def test_order_by_with_rounded_fields():
    """Test that ORDER BY references aliases (not raw fields) when rounding is applied."""
    # Setup mock connector
    mock_connector = Mock()
    mock_connector.db_type = 'clickhouse'
    mock_connector.__class__.__name__ = 'ClickHouseConnector'
    
    # Create optimizer with high cardinality estimate to trigger rounding
    config = OptimizerConfig(enable_adaptive_rounding=True, rounding_threshold=1000)
    optimizer = QueryOptimizer(mock_connector, config)
    
    optimizer.estimator = Mock()
    optimizer.estimator.estimate_size = Mock(return_value=EstimationResult(
        total_rows=50000,
        unique_pairs=8000,  # Above threshold to trigger rounding
        dimension_ranges={'field_x': (0.0, 100.0), 'field_y': (0.0, 50.0)}
    ))
    
    # Query with 2 continuous dims + ORDER BY
    query_desc = QueryDescription(
        target_table='test',
        target_database='db',
        dimensions=[
            Dimension(field='field_x', axis='x', flavour='continuous'),
            Dimension(field='field_y', axis='y', flavour='continuous'),
        ],
        measures=[],
        filters=[],
        orderBy=[
            OrderBy(field='field_x', direction='asc'),
            OrderBy(field='field_y', direction='asc')
        ]
    )
    
    # Generate SQL
    query_service = QueryService()
    sql, metadata = query_service.translate_to_sql(
        query_desc=query_desc,
        table_name='test',
        db_type='clickhouse',
        with_optimization=True,
        optimizer=optimizer
    )
    
    # Verify ROUND is applied
    assert 'ROUND' in sql, f"Expected ROUND in SQL: {sql}"
    
    # Extract ORDER BY clause
    assert 'ORDER BY' in sql, f"Expected ORDER BY in SQL: {sql}"
    order_clause = sql.split('ORDER BY')[1].strip()
    
    # Verify ORDER BY uses unquoted aliases, not backticked raw fields
    # When field is aliased (rounded), should be: field_x ASC (no backticks)
    # Not: `field_x` ASC (backticks indicate raw field reference)
    assert 'field_x ASC' in order_clause or 'field_x DESC' in order_clause, \
        f"Expected unquoted field_x in ORDER BY, got: {order_clause}"
    assert 'field_y ASC' in order_clause or 'field_y DESC' in order_clause, \
        f"Expected unquoted field_y in ORDER BY, got: {order_clause}"
    
    # Should NOT have backticks for aliased fields
    assert '`field_x`' not in order_clause, \
        f"ORDER BY should not have backticks for aliased fields, got: {order_clause}"
    assert '`field_y`' not in order_clause, \
        f"ORDER BY should not have backticks for aliased fields, got: {order_clause}"


def test_order_by_with_mixed_aliased_and_raw_fields():
    """Test ORDER BY with both aliased (rounded) and raw (discrete) fields."""
    mock_connector = Mock()
    mock_connector.db_type = 'clickhouse'
    mock_connector.__class__.__name__ = 'ClickHouseConnector'
    
    config = OptimizerConfig(enable_adaptive_rounding=True, rounding_threshold=1000)
    optimizer = QueryOptimizer(mock_connector, config)
    
    optimizer.estimator = Mock()
    optimizer.estimator.estimate_size = Mock(return_value=EstimationResult(
        total_rows=50000,
        unique_pairs=8000,
        dimension_ranges={'field_x': (0.0, 100.0), 'field_y': (0.0, 50.0)}
    ))
    
    # Query with 2 continuous + 1 discrete dimension
    query_desc = QueryDescription(
        target_table='test',
        target_database='db',
        dimensions=[
            Dimension(field='field_x', axis='x', flavour='continuous'),
            Dimension(field='field_y', axis='y', flavour='continuous'),
            Dimension(field='color_field', flavour='discrete')
        ],
        measures=[],
        filters=[],
        orderBy=[
            OrderBy(field='color_field', direction='asc'),
            OrderBy(field='field_x', direction='asc'),
            OrderBy(field='field_y', direction='asc')
        ]
    )
    
    query_service = QueryService()
    sql, metadata = query_service.translate_to_sql(
        query_desc=query_desc,
        table_name='test',
        db_type='clickhouse',
        with_optimization=True,
        optimizer=optimizer
    )
    
    order_clause = sql.split('ORDER BY')[1].strip()
    
    # With category deduplication enabled, discrete field is ALSO aliased (wrapped in any())
    # So all fields in ORDER BY should be unquoted
    assert '`color_field`' not in order_clause, \
        f"Expected no backticks for aliased discrete field (any()), got: {order_clause}"
    
    # Rounded fields should NOT have backticks (aliased)
    assert '`field_x`' not in order_clause, \
        f"ORDER BY should not have backticks for rounded field_x, got: {order_clause}"
    assert '`field_y`' not in order_clause, \
        f"ORDER BY should not have backticks for rounded field_y, got: {order_clause}"


def test_order_by_without_rounding():
    """Test ORDER BY when rounding is NOT applied (low cardinality)."""
    mock_connector = Mock()
    mock_connector.db_type = 'clickhouse'
    mock_connector.__class__.__name__ = 'ClickHouseConnector'
    
    config = OptimizerConfig(enable_adaptive_rounding=True, rounding_threshold=5000)
    optimizer = QueryOptimizer(mock_connector, config)
    
    optimizer.estimator = Mock()
    optimizer.estimator.estimate_size = Mock(return_value=EstimationResult(
        total_rows=2000,
        unique_pairs=1500,  # Below threshold, no rounding
        dimension_ranges={'field_x': (0.0, 100.0), 'field_y': (0.0, 50.0)}
    ))
    
    query_desc = QueryDescription(
        target_table='test',
        target_database='db',
        dimensions=[
            Dimension(field='field_x', axis='x', flavour='continuous'),
            Dimension(field='field_y', axis='y', flavour='continuous'),
        ],
        measures=[],
        filters=[],
        orderBy=[
            OrderBy(field='field_x', direction='asc'),
            OrderBy(field='field_y', direction='asc')
        ]
    )
    
    query_service = QueryService()
    sql, metadata = query_service.translate_to_sql(
        query_desc=query_desc,
        table_name='test',
        db_type='clickhouse',
        with_optimization=True,
        optimizer=optimizer
    )
    
    # No rounding should be applied
    assert 'ROUND' not in sql, f"Expected no ROUND in SQL: {sql}"
    
    # ORDER BY should use raw fields with backticks
    order_clause = sql.split('ORDER BY')[1].strip()
    assert '`field_x`' in order_clause, \
        f"Expected backticks for raw field_x, got: {order_clause}"
    assert '`field_y`' in order_clause, \
        f"Expected backticks for raw field_y, got: {order_clause}"


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
