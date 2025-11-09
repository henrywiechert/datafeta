"""
Unit tests for discrete deduplication strategy (legacy).
"""

import sys
from pathlib import Path

# Ensure backend package imports resolve in legacy tests
CURRENT_FILE = Path(__file__).resolve()
BACKEND_ROOT = CURRENT_FILE.parents[2]
PROJECT_ROOT = CURRENT_FILE.parents[3]
sys.path.insert(0, str(BACKEND_ROOT))
sys.path.insert(0, str(PROJECT_ROOT))

import pytest
from pypika import Query, Table

from models.query import QueryDescription, Dimension, Measure
from services.optimization.strategies.discrete_dedup import DiscreteDeduplicationStrategy
from services.optimization.optimizer import QueryOptimizer


class TestDiscreteDeduplicationStrategy:
    """Tests for DiscreteDeduplicationStrategy."""
    
    def test_can_apply_to_discrete_only(self):
        """Test that strategy applies to discrete-only queries."""
        strategy = DiscreteDeduplicationStrategy()
        
        query_desc = QueryDescription(
            target_table='products',
            dimensions=[
                Dimension(field='category', flavour='discrete', axis='x')
            ],
            measures=[]
        )
        
        assert strategy.can_apply(query_desc) is True
    
    def test_can_apply_to_multiple_discrete(self):
        """Test that strategy applies to multiple discrete dimensions."""
        strategy = DiscreteDeduplicationStrategy()
        
        query_desc = QueryDescription(
            target_table='sales',
            dimensions=[
                Dimension(field='region', flavour='discrete', axis='x'),
                Dimension(field='category', flavour='discrete', axis='y')
            ],
            measures=[]
        )
        
        assert strategy.can_apply(query_desc) is True
    
    def test_does_not_apply_with_measures(self):
        """Test that strategy doesn't apply when measures are present."""
        strategy = DiscreteDeduplicationStrategy()
        
        query_desc = QueryDescription(
            target_table='sales',
            dimensions=[
                Dimension(field='category', flavour='discrete', axis='x')
            ],
            measures=[
                Measure(field='revenue', aggregation='sum', alias='total')
            ]
        )
        
        assert strategy.can_apply(query_desc) is False
    
    def test_does_not_apply_with_continuous(self):
        """Test that strategy doesn't apply when continuous dimensions present."""
        strategy = DiscreteDeduplicationStrategy()
        
        query_desc = QueryDescription(
            target_table='data',
            dimensions=[
                Dimension(field='category', flavour='discrete', axis='x'),
                Dimension(field='value', flavour='continuous', axis='y')
            ],
            measures=[]
        )
        
        assert strategy.can_apply(query_desc) is False
    
    def test_does_not_apply_with_no_dimensions(self):
        """Test that strategy doesn't apply with no dimensions."""
        strategy = DiscreteDeduplicationStrategy()
        
        query_desc = QueryDescription(
            target_table='data',
            dimensions=[],
            measures=[]
        )
        
        assert strategy.can_apply(query_desc) is False
    
    def test_apply_adds_distinct(self):
        """Test that applying strategy adds DISTINCT to query."""
        strategy = DiscreteDeduplicationStrategy()
        table = Table('categories')
        
        query = Query.from_(table).select(table.category)
        query_desc = QueryDescription(
            target_table='categories',
            dimensions=[
                Dimension(field='category', flavour='discrete', axis='x')
            ],
            measures=[]
        )
        
        optimized = strategy.apply(query, query_desc, table)
        sql = optimized.get_sql(quote_char='`')
        
        assert 'DISTINCT' in sql.upper()
        assert '`category`' in sql
    
    def test_get_metadata(self):
        """Test metadata generation."""
        strategy = DiscreteDeduplicationStrategy()
        metadata = strategy.get_metadata()
        
        assert metadata.strategy_name == 'discrete_deduplication'
        assert metadata.estimated_reduction == 0.85  # Default estimate
        assert 'purpose' in metadata.parameters


class TestOptimizerDiscreteDetection:
    """Tests for optimizer detection of discrete-only queries."""
    
    def test_detect_discrete_only(self):
        """Test that optimizer detects discrete-only queries."""
        optimizer = QueryOptimizer(connector=None)
        
        query_desc = QueryDescription(
            target_table='data',
            dimensions=[
                Dimension(field='category', flavour='discrete', axis='x')
            ],
            measures=[]
        )
        
        chart_type = optimizer._detect_chart_type(query_desc)
        assert chart_type == 'discrete_only'
    
    def test_detect_multiple_discrete(self):
        """Test detection with multiple discrete dimensions."""
        optimizer = QueryOptimizer(connector=None)
        
        query_desc = QueryDescription(
            target_table='data',
            dimensions=[
                Dimension(field='category', flavour='discrete', axis='x'),
                Dimension(field='region', flavour='discrete', axis='y')
            ],
            measures=[]
        )
        
        chart_type = optimizer._detect_chart_type(query_desc)
        assert chart_type == 'discrete_only'
    
    def test_does_not_detect_with_continuous(self):
        """Test that mixed discrete/continuous is not detected as discrete_only."""
        optimizer = QueryOptimizer(connector=None)
        
        query_desc = QueryDescription(
            target_table='data',
            dimensions=[
                Dimension(field='category', flavour='discrete', axis='x'),
                Dimension(field='value', flavour='continuous', axis='y')
            ],
            measures=[]
        )
        
        chart_type = optimizer._detect_chart_type(query_desc)
        assert chart_type != 'discrete_only'
    
    def test_create_discrete_plan(self):
        """Test creating optimization plan for discrete-only query."""
        from services.optimization.config import OptimizerConfig
        
        config = OptimizerConfig(enable_distinct_pairs=True)
        optimizer = QueryOptimizer(connector=None, config=config)
        
        query_desc = QueryDescription(
            target_table='products',
            dimensions=[
                Dimension(field='category', flavour='discrete', axis='x')
            ],
            measures=[]
        )
        
        plan = optimizer.create_plan(query_desc)
        
        assert len(plan.strategies) == 1
        assert isinstance(plan.strategies[0], DiscreteDeduplicationStrategy)
    
    def test_optimization_plan_apply_discrete(self):
        """Test applying discrete optimization plan."""
        from services.optimization.config import OptimizerConfig
        
        config = OptimizerConfig(enable_distinct_pairs=True)
        optimizer = QueryOptimizer(connector=None, config=config)
        
        query_desc = QueryDescription(
            target_table='items',
            dimensions=[
                Dimension(field='type', flavour='discrete', axis='x')
            ],
            measures=[]
        )
        
        table = Table('items')
        query = Query.from_(table).select(table.type)
        
        plan = optimizer.create_plan(query_desc)
        optimized = plan.apply(query, query_desc, table)
        
        sql = optimized.get_sql(quote_char='`')
        assert 'DISTINCT' in sql.upper()
    
    def test_optimization_metadata_discrete(self):
        """Test that discrete optimization metadata is generated."""
        from services.optimization.config import OptimizerConfig
        
        config = OptimizerConfig(enable_distinct_pairs=True)
        optimizer = QueryOptimizer(connector=None, config=config)
        
        query_desc = QueryDescription(
            target_table='categories',
            dimensions=[
                Dimension(field='name', flavour='discrete', axis='x')
            ],
            measures=[]
        )
        
        table = Table('categories')
        query = Query.from_(table).select(table.name)
        
        plan = optimizer.create_plan(query_desc)
        plan.apply(query, query_desc, table)
        
        metadata = plan.get_metadata_summary()
        
        assert len(metadata) == 1
        assert metadata[0]['strategy'] == 'discrete_deduplication'
        assert 'reduction' in metadata[0]


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
