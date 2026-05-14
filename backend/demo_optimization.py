# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
#!/usr/bin/env python3
"""
Demo script to showcase the query optimization module.

This script demonstrates how the QueryOptimizer works by creating
sample queries and showing the optimized SQL output.
"""

import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from pypika import Query, Table
from models.query import QueryDescription, Dimension, Measure
from services.optimization.config import OptimizerConfig
from services.optimization.optimizer import QueryOptimizer


def print_section(title):
    """Print a formatted section header."""
    print("\n" + "="*80)
    print(f"  {title}")
    print("="*80 + "\n")


def demo_scatter_plot_optimization():
    """Demonstrate DISTINCT optimization for scatter plots."""
    print_section("SCATTER PLOT OPTIMIZATION (DISTINCT)")
    
    # Create a scatter plot query description
    query_desc = QueryDescription(
        target_table='sales_data',
        dimensions=[
            Dimension(field='price', flavour='continuous', axis='x'),
            Dimension(field='quantity', flavour='continuous', axis='y')
        ],
        measures=[]
    )
    
    # Create original query (without optimization)
    table = Table('sales_data')
    original_query = Query.from_(table).select(table.price, table.quantity)
    
    print("Original Query Description:")
    print(f"  Chart Type: Scatter Plot")
    print(f"  Dimensions: price (x-axis), quantity (y-axis)")
    print(f"  Measures: None")
    print()
    
    print("Original SQL:")
    print(f"  {original_query.get_sql(quote_char='`')}")
    print()
    
    # Create optimizer and apply optimizations
    config = OptimizerConfig(enable_distinct_pairs=True)
    optimizer = QueryOptimizer(connector=None, config=config)
    
    plan = optimizer.create_plan(query_desc)
    optimized_query = plan.apply(original_query, query_desc, table)
    
    print("Optimized SQL:")
    print(f"  {optimized_query.get_sql(quote_char='`')}")
    print()
    
    metadata = plan.get_metadata_summary()
    print("Optimization Metadata:")
    for opt in metadata:
        print(f"  Strategy: {opt['strategy']}")
        print(f"  Estimated Reduction: {opt['reduction']*100:.0f}%")
        if opt.get('parameters'):
            print(f"  Parameters: {opt['parameters']}")
    print()
    
    print("Expected Result:")
    print("  ✅ SQL now includes 'DISTINCT' keyword")
    print("  ✅ Duplicate (price, quantity) pairs eliminated")
    print("  ✅ Dataset size reduced by ~70%")


def demo_bar_chart_no_optimization():
    """Demonstrate that bar charts don't get DISTINCT optimization."""
    print_section("BAR CHART (NO OPTIMIZATION)")
    
    # Create a bar chart query description
    query_desc = QueryDescription(
        target_table='sales_data',
        dimensions=[
            Dimension(field='category', flavour='discrete', axis='x')
        ],
        measures=[
            Measure(field='revenue', aggregation='sum', alias='total_revenue')
        ]
    )
    
    table = Table('sales_data')
    original_query = (Query.from_(table)
                     .select(table.category)
                     .groupby(table.category))
    
    print("Query Description:")
    print(f"  Chart Type: Bar Chart")
    print(f"  Dimensions: category (x-axis)")
    print(f"  Measures: SUM(revenue)")
    print()
    
    print("Original SQL:")
    print(f"  {original_query.get_sql(quote_char='`')}")
    print()
    
    # Create optimizer
    config = OptimizerConfig(enable_distinct_pairs=True)
    optimizer = QueryOptimizer(connector=None, config=config)
    
    plan = optimizer.create_plan(query_desc)
    optimized_query = plan.apply(original_query, query_desc, table)
    
    print("Optimized SQL:")
    print(f"  {optimized_query.get_sql(quote_char='`')}")
    print()
    
    metadata = plan.get_metadata_summary()
    print("Optimization Metadata:")
    if metadata:
        for opt in metadata:
            print(f"  Strategy: {opt['strategy']}")
    else:
        print("  No optimizations applied (aggregated query)")
    print()
    
    print("Expected Result:")
    print("  ✅ No DISTINCT added (already aggregated)")
    print("  ✅ Query remains unchanged")


def demo_chart_type_detection():
    """Demonstrate chart type detection logic."""
    print_section("CHART TYPE DETECTION")
    
    optimizer = QueryOptimizer(connector=None)
    
    test_cases = [
        {
            "name": "Scatter Plot",
            "query": QueryDescription(
                target_table='data',
                dimensions=[
                    Dimension(field='x', flavour='continuous', axis='x'),
                    Dimension(field='y', flavour='continuous', axis='y')
                ],
                measures=[]
            ),
            "expected": "scatter"
        },
        {
            "name": "Bar Chart",
            "query": QueryDescription(
                target_table='data',
                dimensions=[
                    Dimension(field='cat', flavour='discrete', axis='x')
                ],
                measures=[
                    Measure(field='val', aggregation='sum', alias='total')
                ]
            ),
            "expected": "bar"
        },
        {
            "name": "Tick Strip",
            "query": QueryDescription(
                target_table='data',
                dimensions=[
                    Dimension(field='x1', flavour='continuous', axis='x'),
                    Dimension(field='x2', flavour='continuous', axis='x')
                ],
                measures=[]
            ),
            "expected": "tick_strip"
        }
    ]
    
    for case in test_cases:
        chart_type = optimizer._detect_chart_type(case["query"])
        status = "✅" if chart_type == case["expected"] else "❌"
        print(f"{status} {case['name']}: detected as '{chart_type}' (expected '{case['expected']}')")
    print()


def demo_config_management():
    """Demonstrate configuration management."""
    print_section("CONFIGURATION MANAGEMENT")
    
    print("Default Configuration:")
    default_config = OptimizerConfig()
    print(f"  enable_distinct_pairs: {default_config.enable_distinct_pairs}")
    print(f"  enable_adaptive_rounding: {default_config.enable_adaptive_rounding}")
    print(f"  rounding_threshold: {default_config.rounding_threshold}")
    print(f"  target_buckets: {default_config.target_buckets}")
    print()
    
    print("Custom Configuration:")
    custom_config = OptimizerConfig(
        enable_distinct_pairs=True,
        enable_adaptive_rounding=True,
        rounding_threshold=10000,
        target_buckets=50
    )
    print(f"  enable_distinct_pairs: {custom_config.enable_distinct_pairs}")
    print(f"  enable_adaptive_rounding: {custom_config.enable_adaptive_rounding}")
    print(f"  rounding_threshold: {custom_config.rounding_threshold}")
    print(f"  target_buckets: {custom_config.target_buckets}")
    print()
    
    print("Environment Variable Support:")
    print("  Set OPTIMIZER_ENABLE_DISTINCT_PAIRS=false to disable")
    print("  Set OPTIMIZER_ROUNDING_THRESHOLD=5000 to customize")
    print()


def main():
    """Run all demonstrations."""
    print("\n" + "#"*80)
    print("#" + " "*78 + "#")
    print("#" + "  QUERY OPTIMIZATION MODULE - DEMONSTRATION".center(78) + "#")
    print("#" + " "*78 + "#")
    print("#"*80)
    
    try:
        demo_chart_type_detection()
        demo_scatter_plot_optimization()
        demo_bar_chart_no_optimization()
        demo_config_management()
        
        print("\n" + "#"*80)
        print("#" + " "*78 + "#")
        print("#" + "  DEMONSTRATION COMPLETE".center(78) + "#")
        print("#" + " "*78 + "#")
        print("#"*80 + "\n")
        
        print("Next Steps:")
        print("  1. Run unit tests: pytest backend/tests/test_optimization.py")
        print("  2. Start backend server with optimization enabled")
        print("  3. Test with real data sources")
        print("  4. Monitor optimization metadata in API responses")
        print()
        
    except Exception as e:
        print(f"\n❌ Error during demonstration: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()
