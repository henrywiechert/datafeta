# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Unit tests for SamplingAndLimitsBuilder behavior."""

from backend.dialects import get_dialect
from backend.services.query_components.sampling_limits_builder import SamplingAndLimitsBuilder
from backend.services.query_service import QueryService
from backend.models.query import QueryDescription, Dimension


def test_sampling_applies_rand_and_limit_for_clickhouse():
    qs = QueryService()
    desc = QueryDescription(
        target_table="sales",
        dimensions=[Dimension(field="price", flavour="continuous")],
        measures=[],
        filters=[],
    )

    ctx = qs._build_table_context(desc, "clickhouse", "sales")
    q = ctx.query.select(ctx.primary_table["price"])  # raw query

    builder = SamplingAndLimitsBuilder()
    dialect = get_dialect("clickhouse")
    q2 = builder.apply(q, desc, dialect=dialect, primary_table=ctx.primary_table, with_sampling=True)

    sql = q2.get_sql()
    assert "rand" in sql.lower() or "RAND" in sql or "order by" in sql.lower()
    assert "LIMIT 5000" in sql or "limit 5000" in sql.lower()


def test_filter_value_queries_skip_automatic_sampling():
    qs = QueryService()
    desc = QueryDescription(
        target_table="sales",
        dimensions=[Dimension(field="category", flavour="discrete")],
        measures=[],
        filters=[],
        fetch_filter_values=True,
    )

    ctx = qs._build_table_context(desc, "clickhouse", "sales")
    q = ctx.query.select(ctx.primary_table["category"])

    builder = SamplingAndLimitsBuilder()
    dialect = get_dialect("clickhouse")
    q2 = builder.apply(q, desc, dialect=dialect, primary_table=ctx.primary_table, with_sampling=True)

    sql = q2.get_sql().lower()
    assert "order by" not in sql
    assert "limit 5000" not in sql
