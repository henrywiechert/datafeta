"""Unit tests for GroupingOrderingBuilder behavior."""

from backend.services.query_components.grouping_ordering_builder import GroupingOrderingBuilder
from backend.services.query_service import QueryService
from backend.models.query import QueryDescription, Dimension, Measure


def test_grouping_added_for_measures():
    qs = QueryService()
    desc = QueryDescription(
        target_table="sales",
        dimensions=[Dimension(field="category", flavour="discrete")],
        measures=[Measure(field="revenue", aggregation="sum", alias="total_revenue")],
    )

    ctx = qs._build_table_context(desc, "duckdb", "sales")
    q = ctx.query.select(ctx.primary_table["category"], ctx.primary_table["revenue"])

    builder = GroupingOrderingBuilder()
    q2 = builder.apply_grouping(
        q,
        query_desc=desc,
        db_type="duckdb",
        primary_table=ctx.primary_table,
        use_category_dedup=False,
        groupby_field_info_for_dedup=[],
        with_optimization=False,
        optimizer=None,
    )

    sql = q2.get_sql()
    assert "GROUP BY" in sql.upper()
