#!/usr/bin/env python
"""
Debug script to test adaptive rounding with a mock scenario matching user's case.
This simulates a scatter plot query with >100k rows to see if rounding applies.

Run from data-slicer directory:
  python debug_rounding.py
"""

import sys
sys.path.insert(0, '.')

from unittest.mock import Mock
from backend.models.query import QueryDescription, Dimension
from backend.services.query_service import QueryService
from backend.services.optimization.optimizer import QueryOptimizer
from backend.services.optimization.config import OptimizerConfig
from backend.services.optimization.strategies.base import EstimationResult

print("=" * 70)
print("ADAPTIVE ROUNDING DEBUG - Simulating User's Scenario")
print("=" * 70)
print("\nScenario: Scatter plot with 2 continuous dimensions")
print("Expected result: >100k rows without optimization")
print("Expected with rounding: <10k rows")
print("=" * 70)

# Create a mock connector
mock_connector = Mock()
mock_connector.db_type = 'clickhouse'
mock_connector.__class__.__name__ = 'ClickHouseConnector'

# Load config (should have rounding enabled now)
config = OptimizerConfig.from_env()
print(f"\n✓ Config loaded:")
print(f"  enable_adaptive_rounding: {config.enable_adaptive_rounding}")
print(f"  rounding_threshold: {config.rounding_threshold}")

# Create optimizer
optimizer = QueryOptimizer(mock_connector, config)
print(f"\n✓ Optimizer created with estimator: {optimizer.estimator.__class__.__name__}")

# Mock the estimator to return HIGH cardinality (like user's case: >100k)
optimizer.estimator = Mock()
optimizer.estimator.estimate_size = Mock(return_value=EstimationResult(
    total_rows=150000,      # 150k total rows
    unique_pairs=120000,    # 120k unique pairs after DISTINCT
    dimension_ranges={
        'field_x': (0.0, 1000.0),  # Example range
        'field_y': (0.0, 500.0)    # Example range
    }
))

print(f"✓ Estimator mocked to return:")
print(f"  total_rows: 150,000")
print(f"  unique_pairs: 120,000 (> threshold of {config.rounding_threshold})")
print(f"  dimension_ranges: field_x=[0, 1000], field_y=[0, 500]")

# Create a scatter plot query (2 continuous dimensions on X and Y)
query_desc = QueryDescription(
    target_table='my_table',
    target_database='my_database',
    dimensions=[
        Dimension(field='field_x', axis='x', flavour='continuous'),
        Dimension(field='field_y', axis='y', flavour='continuous')
    ],
    measures=[],
    filters=[]
)

print("\n✓ Query created: Scatter plot with X and Y continuous dimensions")

# Generate SQL with optimization
query_service = QueryService()
try:
    sql, metadata = query_service.translate_to_sql(
        query_desc=query_desc,
        table_name='my_table',
        db_type='clickhouse',
        with_optimization=True,
        optimizer=optimizer
    )
    
    print("\n" + "=" * 70)
    print("GENERATED SQL:")
    print("=" * 70)
    print(sql)
    print("=" * 70)
    
    # Check if ROUND is in SQL
    has_round = 'ROUND' in sql
    has_distinct = 'DISTINCT' in sql.upper()
    
    print("\n✓ SQL Analysis:")
    print(f"  Contains ROUND:    {has_round} {'✓' if has_round else '✗ PROBLEM!'}")
    print(f"  Contains DISTINCT: {has_distinct} {'✓' if has_distinct else '✗'}")
    
    # Show optimization metadata
    print("\n✓ Optimization Metadata:")
    for i, opt in enumerate(metadata, 1):
        print(f"\n  {i}. {opt['strategy']}")
        print(f"     - Reduction: {opt['reduction']*100:.0f}%")
        if 'rounding_config' in opt.get('parameters', {}):
            print(f"     - Rounding: {opt['parameters']['rounding_config']}")
    
    # Final verdict
    print("\n" + "=" * 70)
    if has_round:
        print("✓ SUCCESS: Rounding is applied!")
        print("  Your scatter plots should now load much faster.")
    else:
        print("✗ PROBLEM: Rounding is NOT applied!")
        print("\nPossible causes:")
        print("  1. Estimator is not working (check logs)")
        print("  2. Cardinality estimate is below threshold")
        print("  3. Dimension ranges are not available")
        print("  4. Exception occurred during optimization")
        print("\nCheck backend logs for more details.")
    print("=" * 70)
    
except Exception as e:
    print(f"\n✗ ERROR generating SQL: {e}")
    import traceback
    traceback.print_exc()
