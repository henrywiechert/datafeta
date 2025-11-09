from __future__ import annotations

from unittest.mock import Mock

from backend.models.query import Dimension, OptimizationHints, QueryDescription
from backend.services.optimization.config import OptimizerConfig
from backend.services.optimization.optimizer import QueryOptimizer
from backend.services.optimization.strategy_planner import StrategyPlanner
from backend.services.optimization.strategies.adaptive_rounding import AdaptiveRoundingStrategy
from backend.services.optimization.strategies.category_dedup import CategoryDeduplicationStrategy
from backend.services.optimization.strategies.datetime_binning import DateTimeBinningStrategy
from backend.services.optimization.strategies.distinct_pairs import DistinctPairStrategy


def _make_query(dimensions: list[Dimension], *, hints: OptimizationHints | None = None) -> QueryDescription:
    return QueryDescription(target_table="events", dimensions=dimensions, measures=[], optimization_hints=hints)


def _make_optimizer(config: OptimizerConfig) -> QueryOptimizer:
    connector = Mock()
    connector.__class__.__name__ = "ClickHouseConnector"
    optimizer = QueryOptimizer(connector=connector, config=config)
    optimizer._strategy_planner._dedup_planner._logger = Mock()
    optimizer._strategy_planner._rounding_planner._logger = Mock()
    return optimizer


def test_default_plan_for_multi_continuous_includes_distinct_and_rounding() -> None:
    config = OptimizerConfig(rounding_threshold=200, target_buckets=50)
    optimizer = _make_optimizer(config)
    planner: StrategyPlanner = optimizer._strategy_planner
    planner._rounding_planner._get_actual_unique_pair_count = Mock(return_value=300)
    planner._rounding_planner._fetch_dimension_ranges = Mock(return_value={"x": (0.0, 5.0), "y": (0.0, 5.0)})

    query = _make_query([
        Dimension(field="x", flavour="continuous", axis="x"),
        Dimension(field="y", flavour="continuous", axis="y"),
    ])

    plan = optimizer.create_plan(query)

    assert isinstance(plan.strategies[0], DistinctPairStrategy)
    assert any(isinstance(strategy, AdaptiveRoundingStrategy) for strategy in plan.strategies)


def test_category_dedup_included_after_rounding() -> None:
    config = OptimizerConfig(rounding_threshold=200)
    optimizer = _make_optimizer(config)
    planner: StrategyPlanner = optimizer._strategy_planner
    planner._rounding_planner._get_actual_unique_pair_count = Mock(return_value=500)
    planner._rounding_planner._fetch_dimension_ranges = Mock(return_value={"x": (0.0, 1.0), "y": (0.0, 1.0)})

    query = _make_query([
        Dimension(field="x", flavour="continuous", axis="x"),
        Dimension(field="y", flavour="continuous", axis="y"),
        Dimension(field="color", flavour="discrete"),
    ])

    plan = optimizer.create_plan(query)
    classes = [strategy.__class__ for strategy in plan.strategies]

    assert classes == [DistinctPairStrategy, AdaptiveRoundingStrategy, CategoryDeduplicationStrategy]


def test_hint_based_rounding_uses_single_dimension_threshold() -> None:
    config = OptimizerConfig(rounding_threshold=800)
    optimizer = _make_optimizer(config)
    planner: StrategyPlanner = optimizer._strategy_planner
    planner._rounding_planner._get_actual_unique_single_count = Mock(return_value=600)
    planner._rounding_planner._fetch_dimension_ranges = Mock(return_value={"value": (0.0, 10.0)})

    hints = OptimizationHints(enable_rounding=True, rounding_threshold=500)
    query = _make_query([Dimension(field="value", flavour="continuous")], hints=hints)

    plan = optimizer.create_plan(query)

    assert any(isinstance(strategy, AdaptiveRoundingStrategy) for strategy in plan.strategies)
    planner._rounding_planner._get_actual_unique_single_count.assert_called_once()


def test_hint_based_binning_delegates_to_rounding_planner() -> None:
    config = OptimizerConfig(rounding_threshold=100)
    optimizer = _make_optimizer(config)
    planner: StrategyPlanner = optimizer._strategy_planner
    planner._rounding_planner.plan_binning = Mock(return_value=DateTimeBinningStrategy(
        db_type="clickhouse",
        estimator=None,
        target_buckets=100,
        dimension_ranges={},
    ))

    hints = OptimizationHints(enable_binning=True)
    query = _make_query([
        Dimension(field="ts", flavour="continuous", axis="x", date_mode="timeline"),
    ], hints=hints)

    plan = optimizer.create_plan(query)

    assert any(isinstance(strategy, DateTimeBinningStrategy) for strategy in plan.strategies)
    planner._rounding_planner.plan_binning.assert_called_once()
