"""Integration tests for adaptive rounding in query generation."""

import sys
from pathlib import Path
from unittest.mock import Mock

import pytest

# Ensure backend package imports resolve in legacy tests
CURRENT_FILE = Path(__file__).resolve()
BACKEND_ROOT = CURRENT_FILE.parents[2]
PROJECT_ROOT = CURRENT_FILE.parents[3]
sys.path.insert(0, str(BACKEND_ROOT))
sys.path.insert(0, str(PROJECT_ROOT))

from backend.models.query import QueryDescription, Dimension
from backend.services.query_service import QueryService
from backend.services.optimization.optimizer import QueryOptimizer
from backend.services.optimization.config import OptimizerConfig
from backend.services.optimization.strategies.base import EstimationResult


def _make_query_service():
    """Return a QueryService instance for reuse."""
    return QueryService()


def _build_optimizer(
    *,
    enable_rounding: bool,
    rounding_threshold: int,
    estimate_result: EstimationResult,
) -> QueryOptimizer:
    """Construct a QueryOptimizer with a mocked estimator."""
    mock_connector = Mock()
    mock_connector.db_type = "clickhouse"

    config = OptimizerConfig(
        enable_adaptive_rounding=enable_rounding,
        rounding_threshold=rounding_threshold,
        target_buckets=100,
    )
    optimizer = QueryOptimizer(mock_connector, config)

    optimizer.estimator = Mock()
    optimizer.estimator.estimate_size = Mock(return_value=estimate_result)
    return optimizer


def _scatter_query_description(unique_only: bool = True) -> QueryDescription:
    """Create a scatter-plot style QueryDescription."""
    dims = [
        Dimension(field="price", axis="x", flavour="continuous"),
        Dimension(field="quantity", axis="y", flavour="continuous"),
    ]
    return QueryDescription(
        target_table="sales",
        target_database="testdb",
        dimensions=dims,
        measures=[],
        filters=[],
    )


def _assert_rounding_present(sql: str) -> None:
    assert "ROUND" in sql, f"Expected ROUND in SQL but got: {sql}"


def _assert_rounding_absent(sql: str) -> None:
    assert "ROUND" not in sql, f"Did not expect ROUND in SQL but got: {sql}"


def _render_query(optimizer: QueryOptimizer) -> tuple[str, list[dict]]:
    query_service = _make_query_service()
    query_desc = _scatter_query_description()
    sql, metadata = query_service.translate_to_sql(
        query_desc=query_desc,
        table_name="sales",
        db_type="clickhouse",
        with_optimization=True,
        optimizer=optimizer,
    )
    return sql, metadata


def test_rounding_applied_in_sql():
    """Rounding should be applied when the estimator reports high cardinality."""
    estimate = EstimationResult(
        total_rows=10000,
        unique_pairs=5000,
        dimension_ranges={
            "price": (0.0, 1000.0),
            "quantity": (0.0, 100.0),
        },
    )
    optimizer = _build_optimizer(
        enable_rounding=True, rounding_threshold=100, estimate_result=estimate
    )

    sql, metadata = _render_query(optimizer)

    _assert_rounding_present(sql)
    assert "DISTINCT" in sql.upper()
    assert "adaptive_rounding" in {m["strategy"] for m in metadata}


def test_no_rounding_when_below_threshold():
    """Rounding should not be applied when unique_pairs <= threshold."""
    estimate = EstimationResult(
        total_rows=1000,
        unique_pairs=500,
        dimension_ranges={
            "price": (0.0, 1000.0),
            "quantity": (0.0, 100.0),
        },
    )
    optimizer = _build_optimizer(
        enable_rounding=True, rounding_threshold=5000, estimate_result=estimate
    )

    sql, metadata = _render_query(optimizer)

    _assert_rounding_absent(sql)
    assert "distinct_pairs" in {m["strategy"] for m in metadata}
    assert "adaptive_rounding" not in {m["strategy"] for m in metadata}


def test_rounding_disabled():
    """Rounding should not be applied when disabled in configuration."""
    estimate = EstimationResult(
        total_rows=10000,
        unique_pairs=5000,
        dimension_ranges={
            "price": (0.0, 1000.0),
            "quantity": (0.0, 100.0),
        },
    )
    optimizer = _build_optimizer(
        enable_rounding=False, rounding_threshold=100, estimate_result=estimate
    )

    sql, metadata = _render_query(optimizer)

    _assert_rounding_absent(sql)
    assert "adaptive_rounding" not in {m["strategy"] for m in metadata}


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
