"""Integration test for adaptive rounding in query generation."""

import pytest
from unittest.mock import Mock, MagicMock
from backend.models.query import QueryDescription, Dimension
from backend.services.query_service import QueryService
from backend.services.optimization.optimizer import QueryOptimizer
from backend.services.optimization.config import OptimizerConfig


def test_rounding_applied_in_sql():
    """Test that rounding is applied to continuous dimensions in SQL."""
    
    # Create a mock connector with estimator capabilities
    mock_connector = Mock()
    mock_connector.db_type = 'clickhouse'
    mock_connector.execute_query = Mock(return_value=[
        {'min_val': 0.0, 'max_val': 1000.0}  # For first dimension
    ])
    
    # Configure optimizer with rounding enabled
    config = OptimizerConfig(
        enable_adaptive_rounding=True,
        rounding_threshold=100,  # Low threshold to trigger rounding
        target_buckets=100
    )
    optimizer = QueryOptimizer(mock_connector, config)
    
    # Mock the estimator to return high cardinality with dimension ranges
    from backend.services.optimization.strategies.base import EstimationResult
    optimizer.estimator = Mock()
    optimizer.estimator.estimate_size = Mock(return_value=EstimationResult(
        total_rows=10000,
        unique_pairs=5000,  # Above threshold
        dimension_ranges={
            'price': (0.0, 1000.0),
            'quantity': (0.0, 100.0)
        }
    ))
    
    # Create a scatter plot query
    query_desc = QueryDescription(
        target_table='sales',
        target_database='testdb',
        dimensions=[
            Dimension(field='price', axis='x', flavour='continuous'),
            Dimension(field='quantity', axis='y', flavour='continuous')
        ],
        measures=[],
        filters=[]
    )
    
    # Generate SQL with optimization
    query_service = QueryService()
    sql, metadata = query_service.translate_to_sql(
        query_desc=query_desc,
        table_name='sales',
        db_type='clickhouse',
        with_optimization=True,
        optimizer=optimizer
    )
    
    # Verify ROUND function is in the SQL
    assert 'ROUND' in sql, f"Expected ROUND in SQL but got: {sql}"
    assert 'price' in sql
    assert 'quantity' in sql
    
    # Verify DISTINCT is applied
    assert 'DISTINCT' in sql.upper()
    
    # Verify metadata includes adaptive rounding
    assert len(metadata) >= 1
    strategy_names = [m['strategy'] for m in metadata]
    assert 'adaptive_rounding' in strategy_names
    
    print(f"Generated SQL: {sql}")
    print(f"Metadata: {metadata}")


def test_no_rounding_when_below_threshold():
    """Test that rounding is NOT applied when cardinality is low."""
    
    # Create a mock connector
    mock_connector = Mock()
    mock_connector.db_type = 'clickhouse'
    
    # Configure optimizer with rounding enabled
    config = OptimizerConfig(
        enable_adaptive_rounding=True,
        rounding_threshold=5000,  # High threshold
        target_buckets=100
    )
    optimizer = QueryOptimizer(mock_connector, config)
    
    # Mock the estimator to return LOW cardinality
    optimizer.estimator = Mock()
    optimizer.estimator.estimate_size = Mock(return_value=Mock(
        total_rows=1000,
        unique_pairs=500  # Below threshold
    ))
    
    # Create a scatter plot query
    query_desc = QueryDescription(
        target_table='sales',
        target_database='testdb',
        dimensions=[
            Dimension(field='price', axis='x', flavour='continuous'),
            Dimension(field='quantity', axis='y', flavour='continuous')
        ],
        measures=[],
        filters=[]
    )
    
    # Generate SQL with optimization
    query_service = QueryService()
    sql, metadata = query_service.translate_to_sql(
        query_desc=query_desc,
        table_name='sales',
        db_type='clickhouse',
        with_optimization=True,
        optimizer=optimizer
    )
    
    # Verify ROUND function is NOT in the SQL
    assert 'ROUND' not in sql, f"Did not expect ROUND in SQL but got: {sql}"
    
    # Verify DISTINCT is still applied
    assert 'DISTINCT' in sql.upper()
    
    # Verify metadata includes only distinct_pairs, not adaptive_rounding
    strategy_names = [m['strategy'] for m in metadata]
    assert 'adaptive_rounding' not in strategy_names
    assert 'distinct_pairs' in strategy_names
    
    print(f"Generated SQL: {sql}")
    print(f"Metadata: {metadata}")


def test_rounding_disabled():
    """Test that rounding is not applied when disabled in config."""
    
    # Create a mock connector
    mock_connector = Mock()
    mock_connector.db_type = 'clickhouse'
    
    # Configure optimizer with rounding DISABLED
    config = OptimizerConfig(
        enable_adaptive_rounding=False,
        rounding_threshold=100,
        target_buckets=100
    )
    optimizer = QueryOptimizer(mock_connector, config)
    
    # Mock the estimator to return high cardinality
    optimizer.estimator = Mock()
    optimizer.estimator.estimate_size = Mock(return_value=Mock(
        total_rows=10000,
        unique_pairs=5000  # Above threshold, but rounding disabled
    ))
    
    # Create a scatter plot query
    query_desc = QueryDescription(
        target_table='sales',
        target_database='testdb',
        dimensions=[
            Dimension(field='price', axis='x', flavour='continuous'),
            Dimension(field='quantity', axis='y', flavour='continuous')
        ],
        measures=[],
        filters=[]
    )
    
    # Generate SQL with optimization
    query_service = QueryService()
    sql, metadata = query_service.translate_to_sql(
        query_desc=query_desc,
        table_name='sales',
        db_type='clickhouse',
        with_optimization=True,
        optimizer=optimizer
    )
    
    # Verify ROUND function is NOT in the SQL
    assert 'ROUND' not in sql, f"Did not expect ROUND in SQL but got: {sql}"
    
    # Verify metadata does not include adaptive_rounding
    strategy_names = [m['strategy'] for m in metadata]
    assert 'adaptive_rounding' not in strategy_names
    
    print(f"Generated SQL: {sql}")
    print(f"Metadata: {metadata}")


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
