"""
Unit tests for query optimization module.
"""

import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest
from pypika import Query, Table

from models.query import QueryDescription, Dimension
from services.optimization.config import OptimizerConfig
from services.optimization.strategies.distinct_pairs import DistinctPairStrategy
from services.optimization.optimizer import QueryOptimizer


class TestDistinctPairStrategy:
    """Tests for DistinctPairStrategy."""

    def test_can_apply_to_scatter_plot(self):
        """Test that strategy applies to scatter plot queries."""
        strategy = DistinctPairStrategy()

        query_desc = QueryDescription(
            target_table="test",
            dimensions=[
                Dimension(field="x", flavour="continuous", axis="x"),
                Dimension(field="y", flavour="continuous", axis="y"),
            ],
            measures=[],
        )

        assert strategy.can_apply(query_desc) is True

    def test_does_not_apply_to_bar_chart(self):
        """Test that strategy doesn't apply to aggregated queries."""
        from models.query import Measure

        strategy = DistinctPairStrategy()

        query_desc = QueryDescription(
            target_table="test",
            dimensions=[
                Dimension(field="category", flavour="discrete", axis="x"),
            ],
            measures=[
                Measure(field="revenue", aggregation="sum", alias="total_revenue"),
            ],
        )

        assert strategy.can_apply(query_desc) is False

    def test_does_not_apply_to_single_dimension(self):
        """Test that strategy doesn't apply to single dimension queries."""
        strategy = DistinctPairStrategy()

        query_desc = QueryDescription(
            target_table="test",
            dimensions=[
                Dimension(field="x", flavour="continuous", axis="x"),
            ],
            measures=[],
        )

        assert strategy.can_apply(query_desc) is False

    def test_does_not_apply_to_same_axis(self):
        """Test that strategy doesn't apply when dims are on same axis."""
        strategy = DistinctPairStrategy()

        query_desc = QueryDescription(
            target_table="test",
            dimensions=[
                Dimension(field="x", flavour="continuous", axis="x"),
                Dimension(field="z", flavour="continuous", axis="x"),
            ],
            measures=[],
        )

        assert strategy.can_apply(query_desc) is False

    def test_apply_adds_distinct(self):
        """Test that applying strategy adds DISTINCT to query."""
        strategy = DistinctPairStrategy()
        table = Table("test_table")

        query = Query.from_(table).select(table.x, table.y)
        query_desc = QueryDescription(
            target_table="test_table",
            dimensions=[
                Dimension(field="x", flavour="continuous", axis="x"),
                Dimension(field="y", flavour="continuous", axis="y"),
            ],
        )

        optimized = strategy.apply(query, query_desc, table)
        sql = optimized.get_sql(quote_char="`")

        assert "DISTINCT" in sql.upper()
        assert "`x`" in sql
        assert "`y`" in sql


class TestOptimizerConfig:
    """Tests for OptimizerConfig."""

    def test_default_config(self):
        """Test default configuration values."""
        config = OptimizerConfig()

        assert config.enable_distinct_pairs is True
        assert config.enable_adaptive_rounding is True  # Changed to True by default in Phase 3
        assert config.rounding_threshold == 5000
        assert config.target_buckets == 100

    def test_from_env(self):
        """Test loading configuration from environment."""
        import os

        # Set test environment variables
        os.environ["OPTIMIZER_ENABLE_DISTINCT_PAIRS"] = "false"
        os.environ["OPTIMIZER_ROUNDING_THRESHOLD"] = "10000"

        config = OptimizerConfig.from_env()

        assert config.enable_distinct_pairs is False
        assert config.rounding_threshold == 10000

        # Clean up
        del os.environ["OPTIMIZER_ENABLE_DISTINCT_PAIRS"]
        del os.environ["OPTIMIZER_ROUNDING_THRESHOLD"]


class TestQueryOptimizer:
    """Tests for QueryOptimizer."""

    def test_detect_scatter_chart(self):
        """Test scatter chart type detection."""
        optimizer = QueryOptimizer(connector=None)

        query_desc = QueryDescription(
            target_table="test",
            dimensions=[
                Dimension(field="price", flavour="continuous", axis="x"),
                Dimension(field="quantity", flavour="continuous", axis="y"),
            ],
            measures=[],
        )

        chart_type = optimizer._detect_chart_type(query_desc)
        assert chart_type == "scatter"

    def test_detect_bar_chart(self):
        """Test bar chart type detection."""
        from models.query import Measure

        optimizer = QueryOptimizer(connector=None)

        query_desc = QueryDescription(
            target_table="test",
            dimensions=[
                Dimension(field="category", flavour="discrete", axis="x"),
            ],
            measures=[
                Measure(field="revenue", aggregation="sum", alias="total_revenue"),
            ],
        )

        chart_type = optimizer._detect_chart_type(query_desc)
        assert chart_type == "bar"

    def test_detect_tick_strip(self):
        """Test tick strip type detection."""
        optimizer = QueryOptimizer(connector=None)

        query_desc = QueryDescription(
            target_table="test",
            dimensions=[
                Dimension(field="price", flavour="continuous", axis="x"),
                Dimension(field="quantity", flavour="continuous", axis="x"),
            ],
            measures=[],
        )

        chart_type = optimizer._detect_chart_type(query_desc)
        assert chart_type == "tick_strip"

    def test_create_scatter_plan(self):
        """Test creating optimization plan for scatter plot."""
        config = OptimizerConfig(enable_distinct_pairs=True)
        optimizer = QueryOptimizer(connector=None, config=config)

        query_desc = QueryDescription(
            target_table="test",
            dimensions=[
                Dimension(field="price", flavour="continuous", axis="x"),
                Dimension(field="quantity", flavour="continuous", axis="y"),
            ],
            measures=[],
        )

        plan = optimizer.create_plan(query_desc)

        assert len(plan.strategies) == 1
        assert isinstance(plan.strategies[0], DistinctPairStrategy)

    def test_optimization_plan_apply(self):
        """Test applying optimization plan to query."""
        config = OptimizerConfig(enable_distinct_pairs=True)
        optimizer = QueryOptimizer(connector=None, config=config)

        query_desc = QueryDescription(
            target_table="test",
            dimensions=[
                Dimension(field="price", flavour="continuous", axis="x"),
                Dimension(field="quantity", flavour="continuous", axis="y"),
            ],
            measures=[],
        )

        table = Table("test")
        query = Query.from_(table).select(table.price, table.quantity)

        plan = optimizer.create_plan(query_desc)
        optimized = plan.apply(query, query_desc, table)

        sql = optimized.get_sql(quote_char="`")
        assert "DISTINCT" in sql.upper()

    def test_optimization_metadata(self):
        """Test that optimization metadata is generated."""
        config = OptimizerConfig(enable_distinct_pairs=True)
        optimizer = QueryOptimizer(connector=None, config=config)

        query_desc = QueryDescription(
            target_table="test",
            dimensions=[
                Dimension(field="price", flavour="continuous", axis="x"),
                Dimension(field="quantity", flavour="continuous", axis="y"),
            ],
            measures=[],
        )

        table = Table("test")
        query = Query.from_(table).select(table.price, table.quantity)

        plan = optimizer.create_plan(query_desc)
        plan.apply(query, query_desc, table)

        metadata = plan.get_metadata_summary()

        assert len(metadata) == 1
        assert metadata[0]["strategy"] == "distinct_pairs"
        assert "reduction" in metadata[0]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
