"""Unit tests for SamplingAndLimitsBuilder behavior."""

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
    q2 = builder.apply(q, desc, db_type="clickhouse", primary_table=ctx.primary_table, with_sampling=True)

    sql = q2.get_sql()
    assert "rand" in sql.lower() or "RAND" in sql or "order by" in sql.lower()
    assert "LIMIT 5000" in sql or "limit 5000" in sql.lower()
