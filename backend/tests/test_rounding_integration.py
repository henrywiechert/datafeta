from __future__ import annotations

from typing import Dict, Tuple
from unittest.mock import Mock

from backend.models.query import Dimension, QueryDescription
from backend.services.optimization.config import OptimizerConfig
from backend.services.optimization.optimizer import QueryOptimizer
from backend.services.query_service import QueryService


def _make_query_service() -> QueryService:
    return QueryService()


def _make_query_description() -> QueryDescription:
    return QueryDescription(
        target_table="sales",
        target_database="testdb",
        dimensions=[
            Dimension(field="price", axis="x", flavour="continuous"),
            Dimension(field="quantity", axis="y", flavour="continuous"),
        ],
        measures=[],
        filters=[],
    )


def _make_optimizer(
    *,
    enable_rounding: bool,
    rounding_threshold: int,
    unique_pairs: int,
    dimension_ranges: Dict[str, Tuple[float, float]],
) -> QueryOptimizer:
    connector = Mock()
    connector.__class__.__name__ = "ClickHouseConnector"
    config = OptimizerConfig(
        enable_adaptive_rounding=enable_rounding,
        enable_distinct_pairs=True,
        rounding_threshold=rounding_threshold,
        target_buckets=100,
    )
    optimizer = QueryOptimizer(connector=connector, config=config)
    planner = optimizer._strategy_planner
    planner._rounding_planner._get_actual_unique_pair_count = Mock(return_value=unique_pairs)
    planner._rounding_planner._fetch_dimension_ranges = Mock(return_value=dimension_ranges)
    return optimizer


def _render_sql(optimizer: QueryOptimizer) -> tuple[str, dict]:
    service = _make_query_service()
    query_desc = _make_query_description()
    return service.translate_to_sql(
        query_desc=query_desc,
        table_name="sales",
        db_type="clickhouse",
        with_optimization=True,
        optimizer=optimizer,
    )


def test_rounding_applied_when_unique_pairs_exceed_threshold() -> None:
    optimizer = _make_optimizer(
        enable_rounding=True,
        rounding_threshold=100,
        unique_pairs=500,
        dimension_ranges={"price": (0.0, 1000.0), "quantity": (0.0, 100.0)},
    )

    sql, metadata = _render_sql(optimizer)

    assert "ROUND" in sql
    assert "DISTINCT" in sql.upper()
    strategies = {entry["strategy"] for entry in metadata["optimizations"]}
    assert "distinct_pairs" in strategies
    assert "adaptive_rounding" in strategies


def test_rounding_skipped_when_below_threshold() -> None:
    optimizer = _make_optimizer(
        enable_rounding=True,
        rounding_threshold=1000,
        unique_pairs=200,
        dimension_ranges={"price": (0.0, 1000.0), "quantity": (0.0, 100.0)},
    )

    sql, metadata = _render_sql(optimizer)

    assert "ROUND" not in sql
    strategies = {entry["strategy"] for entry in metadata["optimizations"]}
    assert "distinct_pairs" in strategies
    assert "adaptive_rounding" not in strategies


def test_rounding_skipped_when_disabled() -> None:
    optimizer = _make_optimizer(
        enable_rounding=False,
        rounding_threshold=100,
        unique_pairs=500,
        dimension_ranges={"price": (0.0, 1000.0), "quantity": (0.0, 100.0)},
    )

    sql, metadata = _render_sql(optimizer)

    assert "ROUND" not in sql
    strategies = {entry["strategy"] for entry in metadata["optimizations"]}
    assert "adaptive_rounding" not in strategies
