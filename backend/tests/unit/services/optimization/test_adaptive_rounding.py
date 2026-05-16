# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
from __future__ import annotations

from unittest.mock import Mock

from backend.models.query import Dimension, QueryDescription
from backend.services.optimization.config import OptimizerConfig
from backend.services.optimization.planners.adaptive_rounding_planner import (
    AdaptiveRoundingPlanner,
)
from backend.services.optimization.strategies.adaptive_rounding import AdaptiveRoundingStrategy
from backend.services.optimization.strategies.datetime_binning import DateTimeBinningStrategy


def _make_query(dimensions: list[Dimension]) -> QueryDescription:
    return QueryDescription(target_table="events", dimensions=dimensions, measures=[])


def _make_planner(config: OptimizerConfig) -> AdaptiveRoundingPlanner:
    connector = Mock()
    return AdaptiveRoundingPlanner(
        config=config,
        connector=connector,
        estimator=None,
        db_type="duckdb",
    )


def test_plan_multi_dimensional_returns_rounding_strategy_when_above_threshold() -> None:
    config = OptimizerConfig(rounding_threshold=500, target_buckets=25)
    planner = _make_planner(config)
    planner._get_actual_unique_pair_count = Mock(return_value=900)
    planner._fetch_dimension_ranges = Mock(return_value={"x": (0.0, 100.0), "y": (0.0, 1.0)})

    query = _make_query(
        [
            Dimension(field="x", flavour="continuous", axis="x"),
            Dimension(field="y", flavour="continuous", axis="y"),
        ]
    )

    strategies = planner.plan_multi_dimensional(query, category_expected=False)

    assert strategies and isinstance(strategies[0], AdaptiveRoundingStrategy)
    planner._get_actual_unique_pair_count.assert_called_once_with(query)
    planner._fetch_dimension_ranges.assert_called_once_with(query)


def test_plan_multi_dimensional_prefers_binning_for_timeline_dimensions() -> None:
    config = OptimizerConfig(rounding_threshold=250, target_buckets=50)
    planner = _make_planner(config)
    planner._get_actual_unique_pair_count = Mock(return_value=500)
    planner._fetch_dimension_ranges = Mock(return_value={"ts": (0.0, 10.0)})

    query = _make_query(
        [
            Dimension(field="ts", flavour="continuous", axis="x", date_mode="timeline"),
            Dimension(field="value", flavour="continuous", axis="y", date_mode="timeline"),
        ]
    )

    strategies = planner.plan_multi_dimensional(query, category_expected=False)

    assert strategies and isinstance(strategies[0], DateTimeBinningStrategy)


def test_plan_multi_dimensional_respects_category_threshold_adjustment() -> None:
    config = OptimizerConfig(rounding_threshold=800)
    planner = _make_planner(config)
    planner._get_actual_unique_pair_count = Mock(return_value=900)
    planner._fetch_dimension_ranges = Mock(return_value={"x": (0.0, 50.0), "y": (0.0, 5.0)})

    query = _make_query(
        [
            Dimension(field="x", flavour="continuous", axis="x"),
            Dimension(field="y", flavour="continuous", axis="y"),
        ]
    )

    strategies = planner.plan_multi_dimensional(query, category_expected=True)

    assert strategies and isinstance(strategies[0], AdaptiveRoundingStrategy)
    planner._get_actual_unique_pair_count.assert_called_once()


def test_plan_single_dimension_returns_strategy_when_unique_count_exceeds_threshold() -> None:
    config = OptimizerConfig(rounding_threshold=250)
    planner = _make_planner(config)
    planner._get_actual_unique_single_count = Mock(return_value=500)
    planner._fetch_dimension_ranges = Mock(return_value={"value": (0.0, 100.0)})

    query = _make_query([Dimension(field="value", flavour="continuous", axis="x")])

    strategy = planner.plan_single_dimension(query, threshold=300)

    assert isinstance(strategy, AdaptiveRoundingStrategy)
    planner._get_actual_unique_single_count.assert_called_once_with(query)


def test_plan_binning_returns_strategy_for_timeline_dimension() -> None:
    config = OptimizerConfig(rounding_threshold=100)
    planner = _make_planner(config)
    planner._get_actual_unique_single_count = Mock(return_value=250)
    planner._fetch_dimension_ranges = Mock(return_value={"ts": (0.0, 1000.0)})

    query = _make_query([
        Dimension(field="ts", flavour="continuous", axis="x", date_mode="timeline"),
    ])

    strategy = planner.plan_binning(query)

    assert isinstance(strategy, DateTimeBinningStrategy)
    planner._get_actual_unique_single_count.assert_called_once_with(query)


def test_plan_binning_returns_none_when_disabled() -> None:
    config = OptimizerConfig(enable_adaptive_rounding=False)
    planner = _make_planner(config)

    query = _make_query([
        Dimension(field="ts", flavour="continuous", axis="x", date_mode="timeline"),
    ])

    assert planner.plan_binning(query) is None
