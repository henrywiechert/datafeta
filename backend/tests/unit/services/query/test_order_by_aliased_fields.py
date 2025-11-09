"""Unit tests covering ORDER BY behaviour when aliases are involved."""

from __future__ import annotations

from typing import Dict, List, Optional, Tuple

import pytest

from backend.models.query import Dimension, OrderBy, QueryDescription
from backend.services.query_service import QueryService


@pytest.fixture
def query_service() -> QueryService:
    return QueryService()


def _make_query_description() -> QueryDescription:
    return QueryDescription(
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


class DummyRoundingStrategy:
    """Test double that exposes rounding/binning hooks used by QueryService."""

    def __init__(
        self,
        rounding_config: Optional[Dict[str, int]] = None,
        binning_config: Optional[Dict[str, str]] = None,
        strategy_name: str = "adaptive_rounding",
    ) -> None:
        self._rounding_config = rounding_config or {}
        self._binning_config = binning_config or {}
        self.strategy_name = strategy_name

    def prepare_rounding_config(self, query_desc: QueryDescription) -> Dict[str, int]:
        return self._rounding_config

    def prepare_binning_config(self, query_desc: QueryDescription) -> Dict[str, str]:
        return self._binning_config


class DummyOptimizationPlan:
    """Minimal optimization plan satisfying QueryService expectations."""

    def __init__(
        self,
        *,
        strategies: Optional[List[DummyRoundingStrategy]] = None,
        metadata: Optional[List[Dict[str, str]]] = None,
    ) -> None:
        self.strategies = strategies or []
        self._metadata = metadata or []
        self.hints_used = None
        self.override = None

    def apply(self, query, query_desc, primary_table):
        return query

    def get_metadata_summary(self) -> List[Dict[str, str]]:
        return self._metadata


class DummyOptimizer:
    """Simple optimizer stub returning a preconfigured plan."""

    def __init__(self, plan: DummyOptimizationPlan) -> None:
        self._plan = plan

    def create_plan(self, query_desc: QueryDescription) -> DummyOptimizationPlan:
        return self._plan


def _render_sql(
    query_service: QueryService,
    optimizer: QueryOptimizer,
    query_desc: QueryDescription,
) -> tuple[str, dict]:
    return query_service.translate_to_sql(
        query_desc=query_desc,
        table_name="test",
        db_type="clickhouse",
        with_optimization=True,
        optimizer=optimizer,
    )


def _extract_order_clause(sql: str) -> str:
    _, _, tail = sql.partition("ORDER BY")
    return tail.strip()


def test_order_by_with_rounded_fields(query_service: QueryService) -> None:
    """ORDER BY should reference rounded dimension aliases without backticks."""
    optimizer = DummyOptimizer(
        DummyOptimizationPlan(
            strategies=[
                DummyRoundingStrategy(rounding_config={"field_x": 2, "field_y": 2})
            ],
            metadata=[
                {"strategy": "distinct_pairs"},
                {"strategy": "adaptive_rounding"},
            ],
        )
    )
    sql, metadata = _render_sql(query_service, optimizer, _make_query_description())

    assert "ROUND" in sql.upper()
    order_clause = _extract_order_clause(sql)

    assert order_clause.count("field_x") == 1
    assert order_clause.count("field_y") == 1

    strategies = {entry["strategy"] for entry in metadata["optimizations"]}
    assert "distinct_pairs" in strategies
    assert "adaptive_rounding" in strategies


def test_order_by_with_mixed_aliased_and_raw_fields(query_service: QueryService) -> None:
    """Mixed discrete/continuous ordering should avoid backticks for aliases."""
    optimizer = DummyOptimizer(
        DummyOptimizationPlan(
            strategies=[
                DummyRoundingStrategy(rounding_config={"field_x": 1, "field_y": 1})
            ],
            metadata=[{"strategy": "adaptive_rounding"}],
        )
    )
    query_desc = _make_query_description()
    query_desc.dimensions.append(Dimension(field="color_field", flavour="discrete"))
    query_desc.orderBy = [
        OrderBy(field="color_field", direction="asc"),
        OrderBy(field="field_x", direction="asc"),
        OrderBy(field="field_y", direction="asc"),
    ]

    sql, metadata = _render_sql(query_service, optimizer, query_desc)
    order_clause = _extract_order_clause(sql)

    assert order_clause.split(",")[0].lower().startswith("`color_field`")
    assert order_clause.count("field_x") == 1
    assert order_clause.count("field_y") == 1

    strategies = {entry["strategy"] for entry in metadata["optimizations"]}
    assert "adaptive_rounding" in strategies


def test_order_by_without_rounding(query_service: QueryService) -> None:
    """When rounding is skipped, raw fields should remain quoted."""
    optimizer = DummyOptimizer(DummyOptimizationPlan(metadata=[{"strategy": "distinct_pairs"}]))

    sql, metadata = _render_sql(query_service, optimizer, _make_query_description())

    assert "ROUND" not in sql.upper()
    order_clause = _extract_order_clause(sql)

    assert "`field_x`" in order_clause
    assert "`field_y`" in order_clause

    strategies = {entry["strategy"] for entry in metadata["optimizations"]}
    assert "adaptive_rounding" not in strategies
