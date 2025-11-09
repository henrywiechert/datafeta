"""
Unit tests for adaptive rounding strategy.
"""

import sys
from pathlib import Path
from unittest.mock import Mock

# Ensure backend package imports resolve in legacy tests
CURRENT_FILE = Path(__file__).resolve()
BACKEND_ROOT = CURRENT_FILE.parents[2]
PROJECT_ROOT = CURRENT_FILE.parents[3]
sys.path.insert(0, str(BACKEND_ROOT))
sys.path.insert(0, str(PROJECT_ROOT))

import pytest
from pypika import Query, Table

from models.query import QueryDescription, Dimension
from services.optimization.strategies.adaptive_rounding import (
    AdaptiveRoundingStrategy,
    RoundingHelper
)
from services.optimization.optimizer import QueryOptimizer
from services.optimization.config import OptimizerConfig


class TestAdaptiveRoundingStrategy:
    """Tests for AdaptiveRoundingStrategy."""
    
    def test_can_apply_to_scatter_plot(self):
        """Test that strategy applies to scatter plots."""
        strategy = AdaptiveRoundingStrategy()
        
        query_desc = QueryDescription(
            target_table='data',
            dimensions=[
                Dimension(field='x', flavour='continuous', axis='x'),
                Dimension(field='y', flavour='continuous', axis='y')
            ],
            measures=[]
        )
        
        assert strategy.can_apply(query_desc) is True
    
    def test_does_not_apply_with_measures(self):
        """Test that strategy doesn't apply with measures."""
        from models.query import Measure
        
        strategy = AdaptiveRoundingStrategy()
        
        query_desc = QueryDescription(
            target_table='data',
            dimensions=[
                Dimension(field='x', flavour='continuous', axis='x')
            ],
            measures=[
                Measure(field='value', aggregation='sum', alias='total')
            ]
        )
        
        assert strategy.can_apply(query_desc) is False
    
    def test_does_not_apply_to_single_dimension(self):
        """Test that strategy doesn't apply to single dimension."""
        strategy = AdaptiveRoundingStrategy()
        
        query_desc = QueryDescription(
            target_table='data',
            dimensions=[
                Dimension(field='x', flavour='continuous', axis='x')
            ],
            measures=[]
        )
        
        assert strategy.can_apply(query_desc) is False
    
    def test_calculate_rounding_precision_small_range(self):
        """Test precision calculation for small range (0-1)."""
        strategy = AdaptiveRoundingStrategy(
            target_buckets=100,
            dimension_ranges={'value': (0.0, 1.0)}
        )
        
        dim = Dimension(field='value', flavour='continuous', axis='x')
        precision = strategy._calculate_rounding_precision(dim)
        
        # Range = 1.0, buckets = 100, bucket_size = 0.01
        # magnitude = -2, precision = 2
        assert precision == 2
    
    def test_calculate_rounding_precision_large_range(self):
        """Test precision calculation for large range (0-10000)."""
        strategy = AdaptiveRoundingStrategy(
            target_buckets=100,
            dimension_ranges={'value': (0.0, 10000.0)}
        )
        
        dim = Dimension(field='value', flavour='continuous', axis='x')
        precision = strategy._calculate_rounding_precision(dim)
        
        # Range = 10000, buckets = 100, bucket_size = 100
        # magnitude = 2, precision = -2 (round to nearest 100)
        assert precision == -2
    
    def test_calculate_rounding_precision_medium_range(self):
        """Test precision calculation for medium range (0-100)."""
        strategy = AdaptiveRoundingStrategy(
            target_buckets=100,
            dimension_ranges={'price': (0.0, 100.0)}
        )
        
        dim = Dimension(field='price', flavour='continuous', axis='x')
        precision = strategy._calculate_rounding_precision(dim)
        
        # Range = 100, buckets = 100, bucket_size = 1
        # magnitude = 0, precision = 0 (round to integer)
        assert precision == 0
    
    def test_apply_creates_rounding_config(self):
        """Test that apply creates rounding configuration."""
        strategy = AdaptiveRoundingStrategy(
            target_buckets=50,
            dimension_ranges={
                'x': (0.0, 100.0),
                'y': (0.0, 1.0)
            }
        )
        
        query_desc = QueryDescription(
            target_table='test',
            dimensions=[
                Dimension(field='x', flavour='continuous', axis='x'),
                Dimension(field='y', flavour='continuous', axis='y')
            ],
            measures=[]
        )
        
        table = Table('test')
        query = Query.from_(table).select(table.x, table.y)
        
        strategy.apply(query, query_desc, table)
        
        config = strategy.get_rounding_config()
        assert 'x' in config
        assert 'y' in config
        # x: range=100, buckets=50, size=2, precision=-1 or 0
        # y: range=1, buckets=50, size=0.02, precision=2
    
    def test_get_metadata(self):
        """Test metadata generation."""
        strategy = AdaptiveRoundingStrategy()
        metadata = strategy.get_metadata()
        
        assert metadata.strategy_name == 'adaptive_rounding'
        assert metadata.estimated_reduction == 0.80
        assert 'target_buckets' in metadata.parameters


class TestRoundingHelper:
    """Tests for RoundingHelper."""
    
    def test_should_round_dimension(self):
        """Test checking if dimension should be rounded."""
        dim = Dimension(field='price', flavour='continuous', axis='x')
        config = {'price': 2}
        
        assert RoundingHelper.should_round_dimension(dim, config) is True
    
    def test_should_not_round_discrete(self):
        """Test that discrete dimensions are not rounded."""
        dim = Dimension(field='category', flavour='discrete', axis='x')
        config = {'category': 0}
        
        assert RoundingHelper.should_round_dimension(dim, config) is False
    
    def test_should_not_round_missing_config(self):
        """Test that dimensions without config are not rounded."""
        dim = Dimension(field='value', flavour='continuous', axis='x')
        config = {'other_field': 2}
        
        assert RoundingHelper.should_round_dimension(dim, config) is False
    
    def test_get_rounding_precision(self):
        """Test getting precision from config."""
        config = {'price': 2, 'quantity': 0}
        
        assert RoundingHelper.get_rounding_precision('price', config) == 2
        assert RoundingHelper.get_rounding_precision('quantity', config) == 0
        assert RoundingHelper.get_rounding_precision('missing', config) == 0


class TestOptimizerAdaptiveRounding:
    """Integration tests for adaptive rounding in optimizer."""
    
    def test_optimizer_applies_rounding_when_above_threshold(self):
        """Test that optimizer applies rounding when unique count > threshold."""
        # Create mock estimator that returns high unique count
        connector = Mock()
        connector.__class__.__name__ = 'ClickHouseConnector'
        connector.fetch_data = Mock(return_value=([], [
            {'total_rows': 10000, 'unique_pairs': 6000}  # Above threshold
        ]))
        
        config = OptimizerConfig(
            enable_distinct_pairs=True,
            enable_adaptive_rounding=True,
            rounding_threshold=5000,
            target_buckets=100
        )
        
        optimizer = QueryOptimizer(connector=connector, config=config)
        
        # Mock the range fetching
        optimizer._fetch_dimension_ranges = Mock(return_value={
            'x': (0.0, 100.0),
            'y': (0.0, 1.0)
        })
        
        query_desc = QueryDescription(
            target_table='data',
            dimensions=[
                Dimension(field='x', flavour='continuous', axis='x'),
                Dimension(field='y', flavour='continuous', axis='y')
            ],
            measures=[]
        )
        
        plan = optimizer.create_plan(query_desc)
        
        # Should have both DISTINCT and ROUNDING strategies
        assert len(plan.strategies) == 2
        assert any(s.__class__.__name__ == 'DistinctPairStrategy' for s in plan.strategies)
        assert any(s.__class__.__name__ == 'AdaptiveRoundingStrategy' for s in plan.strategies)
    
    def test_optimizer_skips_rounding_when_below_threshold(self):
        """Test that optimizer skips rounding when unique count <= threshold."""
        # Create mock estimator that returns low unique count
        connector = Mock()
        connector.__class__.__name__ = 'ClickHouseConnector'
        connector.fetch_data = Mock(return_value=([], [
            {'total_rows': 10000, 'unique_pairs': 3000}  # Below threshold
        ]))
        
        config = OptimizerConfig(
            enable_distinct_pairs=True,
            enable_adaptive_rounding=True,
            rounding_threshold=5000,
            target_buckets=100
        )
        
        optimizer = QueryOptimizer(connector=connector, config=config)
        
        query_desc = QueryDescription(
            target_table='data',
            dimensions=[
                Dimension(field='x', flavour='continuous', axis='x'),
                Dimension(field='y', flavour='continuous', axis='y')
            ],
            measures=[]
        )
        
        plan = optimizer.create_plan(query_desc)
        
        # Should only have DISTINCT strategy
        assert len(plan.strategies) == 1
        assert plan.strategies[0].__class__.__name__ == 'DistinctPairStrategy'
    
    def test_optimizer_skips_rounding_when_disabled(self):
        """Test that optimizer skips rounding when disabled in config."""
        connector = Mock()
        connector.__class__.__name__ = 'ClickHouseConnector'
        
        config = OptimizerConfig(
            enable_distinct_pairs=True,
            enable_adaptive_rounding=False,  # Disabled
            rounding_threshold=5000
        )
        
        optimizer = QueryOptimizer(connector=connector, config=config)
        
        query_desc = QueryDescription(
            target_table='data',
            dimensions=[
                Dimension(field='x', flavour='continuous', axis='x'),
                Dimension(field='y', flavour='continuous', axis='y')
            ],
            measures=[]
        )
        
        plan = optimizer.create_plan(query_desc)
        
        # Should only have DISTINCT strategy
        assert len(plan.strategies) == 1
        assert plan.strategies[0].__class__.__name__ == 'DistinctPairStrategy'


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
