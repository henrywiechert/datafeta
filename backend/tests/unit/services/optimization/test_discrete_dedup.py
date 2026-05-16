# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
from __future__ import annotations

from backend.models.query import Dimension, QueryDescription
from backend.services.optimization.config import OptimizerConfig
from backend.services.optimization.planners.dedup_planner import DedupStrategyPlanner
from backend.services.optimization.strategies.category_dedup import (
    CategoryDeduplicationStrategy,
)
from backend.services.optimization.strategies.distinct_pairs import DistinctPairStrategy


def _make_query(dimensions: list[Dimension]) -> QueryDescription:
    return QueryDescription(target_table="events", dimensions=dimensions, measures=[])


def _make_planner(config: OptimizerConfig) -> DedupStrategyPlanner:
    return DedupStrategyPlanner(
        config=config,
        estimator=None,
        db_type="duckdb",
    )


def test_plan_simple_adds_distinct_when_enabled() -> None:
    config = OptimizerConfig(enable_distinct_pairs=True)
    planner = _make_planner(config)

    query = _make_query([Dimension(field="category", flavour="discrete")])

    strategies = planner.plan_simple(query)

    assert strategies and isinstance(strategies[0], DistinctPairStrategy)


def test_plan_simple_returns_empty_when_disabled() -> None:
    config = OptimizerConfig(enable_distinct_pairs=False)
    planner = _make_planner(config)

    query = _make_query([Dimension(field="category", flavour="discrete")])

    assert planner.plan_simple(query) == []


def test_plan_multi_dimensional_adds_distinct_without_timeline_dims() -> None:
    config = OptimizerConfig(enable_distinct_pairs=True)
    planner = _make_planner(config)

    query = _make_query(
        [
            Dimension(field="x", flavour="continuous", axis="x"),
            Dimension(field="y", flavour="continuous", axis="y"),
        ]
    )

    leading, trailing, has_category = planner.plan_multi_dimensional(query)

    assert leading and isinstance(leading[0], DistinctPairStrategy)
    assert trailing == []
    assert has_category is False


def test_plan_multi_dimensional_adds_category_strategy_when_applicable() -> None:
    config = OptimizerConfig(enable_distinct_pairs=True)
    planner = _make_planner(config)

    query = _make_query(
        [
            Dimension(field="x", flavour="continuous", axis="x"),
            Dimension(field="y", flavour="continuous", axis="y"),
            Dimension(field="color", flavour="discrete"),
        ]
    )

    leading, trailing, has_category = planner.plan_multi_dimensional(query)

    assert trailing and isinstance(trailing[0], CategoryDeduplicationStrategy)
    assert has_category is True


def test_plan_multi_dimensional_skips_distinct_for_timeline_dims() -> None:
    config = OptimizerConfig(enable_distinct_pairs=True)
    planner = _make_planner(config)

    query = _make_query(
        [
            Dimension(field="ts", flavour="continuous", axis="x", date_mode="timeline"),
            Dimension(field="value", flavour="continuous", axis="y", date_mode="timeline"),
        ]
    )

    leading, trailing, has_category = planner.plan_multi_dimensional(query)

    assert leading == []
    assert trailing == []
    assert has_category is False
