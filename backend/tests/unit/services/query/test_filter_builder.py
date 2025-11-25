"""Unit tests for FilterBuilder behavior."""

from backend.services.query_components.filter_builder import FilterBuilder
from backend.services.query_service import QueryService
from backend.models.query import QueryDescription, Dimension, Filter


def test_in_filter_with_null_expands_to_is_null():
    qs = QueryService()
    desc = QueryDescription(
        target_table="sales",
        dimensions=[Dimension(field="category", flavour="discrete")],
        filters=[Filter(field="category", operator="in", value=["Books", None])],
    )

    ctx = qs._build_table_context(desc, "duckdb", "sales")

    # Create a simple field parser that resolves to the primary table
    def parse_field(field_name: str):
        return ctx.primary_table.field(field_name)

    builder = FilterBuilder(
        parse_field_reference=parse_field,
        apply_cast_if_configured=qs._apply_cast_if_configured,
        get_field_with_cast=qs._get_field_with_cast,
    )

    criteria = builder.build(desc, ctx.table_map, ctx.default_table, "duckdb", ctx.primary_table)
    assert len(criteria) >= 1

    sql = criteria[0].get_sql(quote_char='"')
    assert 'IS NULL' in sql or 'ISNULL' in sql or 'is null' in sql.lower()
    assert 'IN' in sql
