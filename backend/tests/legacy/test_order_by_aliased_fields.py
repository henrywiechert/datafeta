"""Test ORDER BY with aliased fields (rounding and temporal binning)."""

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

from backend.models.query import QueryDescription, Dimension, OrderBy
from backend.services.query_service import QueryService
from backend.services.optimization.optimizer import QueryOptimizer
from backend.services.optimization.config import OptimizerConfig
from backend.services.optimization.strategies.base import EstimationResult


def test_order_by_with_rounded_fields():
    """Test that ORDER BY references aliases (not raw fields) when rounding is applied."""
    mock_connector = Mock()
    mock_connector.db_type = "clickhouse"
    mock_connector.__class__.__name__ = "ClickHouseConnector"

    config = OptimizerConfig(enable_adaptive_rounding=True, rounding_threshold=1000)
    optimizer = QueryOptimizer(mock_connector, config)

    optimizer.estimator = Mock()
    optimizer.estimator.estimate_size = Mock(
        return_value=EstimationResult(
            total_rows=50000,
            unique_pairs=8000,
            dimension_ranges={"field_x": (0.0, 100.0), "field_y": (0.0, 50.0)},
        )
    )

    query_desc = QueryDescription(
        target_table="test",
        target_database="db",
        dimensions=[
            Dimension(field="field_x", axis="x", flavour="continuous"),
            Dimension(field="field_y", axis="y", flavour="continuous"),
        ],
        measures=[],
        filters=[],
        orderBy=[
            OrderBy(field="field_x", direction="asc"),
            OrderBy(field="field_y", direction="asc"),
        ],
    )

    query_service = QueryService()
    sql, metadata = query_service.translate_to_sql(
        query_desc=query_desc,
        table_name="test",
        db_type="clickhouse",
        with_optimization=True,
        optimizer=optimizer,
    )

    assert "ROUND" in sql, f"Expected ROUND in SQL: {sql}"

    assert "ORDER BY" in sql, f"Expected ORDER BY in SQL: {sql}"
    order_clause = sql.split("ORDER BY")[1].strip()

    assert "field_x ASC" in order_clause or "field_x DESC" in order_clause, (
        "Expected unquoted field_x in ORDER BY, got: {order_clause}"
    )
    assert "field_y ASC" in order_clause or "field_y DESC" in order_clause, (
        "Expected unquoted field_y in ORDER BY, got: {order_clause}"
    )

    assert "`field_x`" not in order_clause, (
        "ORDER BY should not have backticks for aliased fields, got: {order_clause}"
    )
    assert "`field_y`" not in order_clause, (
        "ORDER BY should not have backticks for aliased fields, got: {order_clause}"
    )


def test_order_by_with_mixed_aliased_and_raw_fields():
    """Test ORDER BY with both aliased (rounded) and raw (discrete) fields."""
    mock_connector = Mock()
    mock_connector.db_type = "clickhouse"
    mock_connector.__class__.__name__ = "ClickHouseConnector"

    config = OptimizerConfig(enable_adaptive_rounding=True, rounding_threshold=1000)
    optimizer = QueryOptimizer(mock_connector, config)

    optimizer.estimator = Mock()
    optimizer.estimator.estimate_size = Mock(
        return_value=EstimationResult(
            total_rows=50000,
            unique_pairs=8000,
            dimension_ranges={"field_x": (0.0, 100.0), "field_y": (0.0, 50.0)},
        )
    )

    query_desc = QueryDescription(
        target_table="test",
        target_database="db",
        dimensions=[
            Dimension(field="field_x", axis="x", flavour="continuous"),
            Dimension(field="field_y", axis="y", flavour="continuous"),
            Dimension(field="color_field", flavour="discrete"),
        ],
        measures=[],
        filters=[],
        orderBy=[
            OrderBy(field="color_field", direction="asc"),
            OrderBy(field="field_x", direction="asc"),
            OrderBy(field="field_y", direction="asc"),
        ],
    )

    query_service = QueryService()
    sql, metadata = query_service.translate_to_sql(
        query_desc=query_desc,
        table_name="test",
        db_type="clickhouse",
        with_optimization=True,
        optimizer=optimizer,
    )

    order_clause = sql.split("ORDER BY")[1].strip()

    assert "`color_field`" not in order_clause, (
        "Expected no backticks for aliased discrete field (any()), got: {order_clause}"
    )
    assert "`field_x`" not in order_clause, (
        "ORDER BY should not have backticks for rounded field_x, got: {order_clause}"
    )
    assert "`field_y`" not in order_clause, (
        "ORDER BY should not have backticks for rounded field_y, got: {order_clause}"
    )


def test_order_by_without_rounding():
    """Test ORDER BY when rounding is NOT applied (low cardinality)."""
    mock_connector = Mock()
    mock_connector.db_type = "clickhouse"
    mock_connector.__class__.__name__ = "ClickHouseConnector"

    config = OptimizerConfig(enable_adaptive_rounding=True, rounding_threshold=5000)
    optimizer = QueryOptimizer(mock_connector, config)

    optimizer.estimator = Mock()
    optimizer.estimator.estimate_size = Mock(
        return_value=EstimationResult(
            total_rows=2000,
            unique_pairs=1500,
            dimension_ranges={"field_x": (0.0, 100.0), "field_y": (0.0, 50.0)},
        )
    )

    query_desc = QueryDescription(
        target_table="test",
        target_database="db",
        dimensions=[
            Dimension(field="field_x", axis="x", flavour="continuous"),
            Dimension(field="field_y", axis="y", flavour="continuous"),
        ],
        measures=[],
        filters=[],
        orderBy=[
            OrderBy(field="field_x", direction="asc"),
            OrderBy(field="field_y", direction="asc"),
        ],
    )

    query_service = QueryService()
    sql, metadata = query_service.translate_to_sql(
        query_desc=query_desc,
        table_name="test",
        db_type="clickhouse",
        with_optimization=True,
        optimizer=optimizer,
    )

    assert "ROUND" not in sql, f"Expected no ROUND in SQL: {sql}"

    order_clause = sql.split("ORDER BY")[1].strip()
    assert "`field_x`" in order_clause, (
        "Expected backticks for raw field_x, got: {order_clause}"
    )
    assert "`field_y`" in order_clause, (
        "Expected backticks for raw field_y, got: {order_clause}"
    )


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
