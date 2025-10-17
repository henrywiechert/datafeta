"""Test that rounding is applied when category dedup is needed, even with lower estimates."""

from unittest.mock import Mock
from backend.models.query import QueryDescription, Dimension, Filter
from backend.services.query_service import QueryService
from backend.services.optimization.optimizer import QueryOptimizer
from backend.services.optimization.config import OptimizerConfig
from backend.services.optimization.strategies.base import EstimationResult


def test_rounding_with_category_dedup_lower_threshold():
    """Test that rounding uses lower threshold when discrete dimensions present."""
    # Setup
    mock_connector = Mock()
    mock_connector.db_type = 'clickhouse'
    mock_connector.__class__.__name__ = 'ClickHouseConnector'
    
    config = OptimizerConfig(enable_adaptive_rounding=True, rounding_threshold=5000)
    optimizer = QueryOptimizer(mock_connector, config)
    
    # Estimate 2000 unique pairs - above 1000 (5000/5) but below 5000
    optimizer.estimator = Mock()
    optimizer.estimator.estimate_size = Mock(return_value=EstimationResult(
        total_rows=10000,
        unique_pairs=2000,  # Above 1000 (threshold/5) but below 5000
        dimension_ranges={'field_x': (0.0, 100.0), 'field_y': (0.0, 50.0)}
    ))
    
    # Query with filter + 2 continuous + 1 discrete dimension
    query_desc = QueryDescription(
        target_table='test',
        target_database='db',
        dimensions=[
            Dimension(field='field_x', axis='x', flavour='continuous'),
            Dimension(field='field_y', axis='y', flavour='continuous'),
            Dimension(field='color_field', flavour='discrete')
        ],
        measures=[],
        filters=[
            Filter(field='field_x', operator='>=', value=0),
            Filter(field='field_x', operator='<=', value=50)
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
    
    print("=" * 80)
    print("ROUNDING WITH CATEGORY DEDUP (LOWER THRESHOLD)")
    print("=" * 80)
    print(f"\nEstimate: 2000 unique pairs")
    print(f"Normal threshold: 5000 (would skip rounding)")
    print(f"Category dedup threshold: 1000 (5000/5)")
    print(f"Expected: Rounding SHOULD be applied (2000 > 1000)")
    print()
    print("Generated SQL:")
    print(sql)
    print()
    
    # Verify ROUND is applied
    if 'ROUND' in sql:
        print("✅ ROUND applied (correct!)")
    else:
        print("❌ ROUND not applied (wrong!)")
        assert False, f"Expected ROUND in SQL when estimate (2000) > threshold/5 (1000): {sql}"
    
    # Verify any() for discrete field
    assert 'any(' in sql.lower(), f"Expected any() aggregate: {sql}"
    print("✅ any() aggregate present")
    
    # Verify GROUP BY
    assert 'GROUP BY' in sql, f"Expected GROUP BY: {sql}"
    print("✅ GROUP BY present")
    
    print()
    print("Result: With discrete dimension, rounding threshold is 5x more aggressive!")
    print("=" * 80)


if __name__ == '__main__':
    test_rounding_with_category_dedup_lower_threshold()
