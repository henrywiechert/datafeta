# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Unit tests for measure-value (HAVING) filter support."""

import pytest

from backend.models.query import Dimension, Filter, Measure, QueryDescription
from backend.services.filter_conversion_service import FilterConversionService
from backend.services.query_components.filter_builder import FilterBuilder
from backend.services.query_service import QueryService


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

@pytest.fixture
def qs() -> QueryService:
    return QueryService()


def _desc(**overrides) -> QueryDescription:
    base = dict(target_table="sales", dimensions=[], measures=[], filters=[], orderBy=[])
    base.update(overrides)
    return QueryDescription(**base)


def _make_filter_builder(qs: QueryService, desc: QueryDescription):
    ctx = qs._build_table_context(desc, "duckdb", "sales")

    def parse_field(name: str):
        return ctx.primary_table.field(name)

    return FilterBuilder(
        parse_field_reference=parse_field,
        apply_cast_if_configured=qs._apply_cast_if_configured,
        get_field_with_cast=qs._get_field_with_cast,
    ), ctx


# ---------------------------------------------------------------------------
# Filter model
# ---------------------------------------------------------------------------

def test_filter_scope_defaults_to_row():
    f = Filter(field="revenue", operator=">=", value=1000)
    assert f.scope == "row"


def test_filter_scope_can_be_set_to_group():
    f = Filter(field="SUM(revenue)", operator=">=", value=1000, scope="group")
    assert f.scope == "group"


# ---------------------------------------------------------------------------
# FilterBuilder.build() excludes group-scoped filters from WHERE
# ---------------------------------------------------------------------------

def test_build_skips_group_scoped_filters(qs: QueryService):
    desc = _desc(
        dimensions=[Dimension(field="region", flavour="discrete")],
        measures=[Measure(field="revenue", aggregation="sum", alias="SUM(revenue)")],
        filters=[
            Filter(field="region", operator="=", value="EU", scope="row"),
            Filter(field="SUM(revenue)", operator=">=", value=1000, scope="group"),
        ],
    )
    builder, ctx = _make_filter_builder(qs, desc)
    criteria = builder.build(desc, ctx.table_map, ctx.default_table, "duckdb", ctx.primary_table)
    sqls = [c.get_sql(quote_char='"') for c in criteria]
    assert any("region" in s for s in sqls), "row filter should be present"
    assert not any("revenue" in s for s in sqls), "group filter must not appear in WHERE"


# ---------------------------------------------------------------------------
# FilterBuilder.build_having() produces correct HAVING criteria
# ---------------------------------------------------------------------------

def test_build_having_produces_criterion(qs: QueryService):
    from backend.services.query_service import AGGREGATION_MAP

    desc = _desc(
        dimensions=[Dimension(field="region", flavour="discrete")],
        measures=[Measure(field="revenue", aggregation="sum", alias="SUM(revenue)")],
        filters=[Filter(field="SUM(revenue)", operator=">=", value=1000, scope="group")],
    )
    builder, ctx = _make_filter_builder(qs, desc)
    having = builder.build_having(desc, AGGREGATION_MAP, ctx.table_map, ctx.default_table)
    assert len(having) == 1
    sql = having[0].get_sql(quote_char='"')
    assert "SUM" in sql.upper()
    assert "revenue" in sql
    assert "1000" in sql


def test_build_having_unknown_alias_raises(qs: QueryService):
    from backend.exceptions import QueryGenerationError
    from backend.services.query_service import AGGREGATION_MAP

    desc = _desc(
        dimensions=[Dimension(field="region", flavour="discrete")],
        measures=[Measure(field="revenue", aggregation="sum", alias="SUM(revenue)")],
        filters=[Filter(field="NO_SUCH_ALIAS", operator=">=", value=0, scope="group")],
    )
    builder, ctx = _make_filter_builder(qs, desc)
    with pytest.raises(QueryGenerationError, match="unknown measure alias"):
        builder.build_having(desc, AGGREGATION_MAP, ctx.table_map, ctx.default_table)


def test_build_having_multiple_criteria(qs: QueryService):
    from backend.services.query_service import AGGREGATION_MAP

    desc = _desc(
        dimensions=[Dimension(field="region", flavour="discrete")],
        measures=[Measure(field="revenue", aggregation="sum", alias="SUM(revenue)")],
        filters=[
            Filter(field="SUM(revenue)", operator=">=", value=100, scope="group"),
            Filter(field="SUM(revenue)", operator="<=", value=9000, scope="group"),
        ],
    )
    builder, ctx = _make_filter_builder(qs, desc)
    having = builder.build_having(desc, AGGREGATION_MAP, ctx.table_map, ctx.default_table)
    assert len(having) == 2


# ---------------------------------------------------------------------------
# End-to-end: translate_to_sql emits HAVING clause
# ---------------------------------------------------------------------------

def test_translate_to_sql_emits_having(qs: QueryService):
    desc = _desc(
        dimensions=[Dimension(field="region", flavour="discrete")],
        measures=[Measure(field="revenue", aggregation="sum", alias="SUM(revenue)")],
        filters=[Filter(field="SUM(revenue)", operator=">=", value=1000, scope="group")],
    )
    sql, _ = qs.translate_to_sql(desc, "sales", db_type="duckdb", with_optimization=False)
    assert "HAVING" in sql.upper()
    assert "SUM" in sql.upper()
    assert "1000" in sql


def test_translate_to_sql_having_and_where_coexist(qs: QueryService):
    desc = _desc(
        dimensions=[Dimension(field="region", flavour="discrete")],
        measures=[Measure(field="revenue", aggregation="sum", alias="SUM(revenue)")],
        filters=[
            Filter(field="region", operator="=", value="EU", scope="row"),
            Filter(field="SUM(revenue)", operator=">=", value=1000, scope="group"),
        ],
    )
    sql, _ = qs.translate_to_sql(desc, "sales", db_type="duckdb", with_optimization=False)
    assert "WHERE" in sql.upper()
    assert "HAVING" in sql.upper()


def test_translate_to_sql_no_having_without_group_filters(qs: QueryService):
    desc = _desc(
        dimensions=[Dimension(field="region", flavour="discrete")],
        measures=[Measure(field="revenue", aggregation="sum", alias="SUM(revenue)")],
        filters=[Filter(field="region", operator="=", value="EU", scope="row")],
    )
    sql, _ = qs.translate_to_sql(desc, "sales", db_type="duckdb", with_optimization=False)
    assert "HAVING" not in sql.upper()


# ---------------------------------------------------------------------------
# FilterConversionService: measure filter type -> scope='group'
# ---------------------------------------------------------------------------

def test_filter_conversion_measure_type_produces_group_scope():
    filters = {
        "rev_filter": {
            "columnName": "SUM(revenue)",
            "type": "measure",
            "minValue": 500,
        }
    }
    result = FilterConversionService.convert_filters(filters)
    assert len(result) == 1
    f = result[0]
    assert f.field == "SUM(revenue)"
    assert f.operator == ">="
    assert f.value == 500
    assert f.scope == "group"


def test_filter_conversion_measure_min_and_max():
    filters = {
        "rev_filter": {
            "columnName": "SUM(revenue)",
            "type": "measure",
            "minValue": 100,
            "maxValue": 5000,
        }
    }
    result = FilterConversionService.convert_filters(filters)
    assert len(result) == 2
    ops = {f.operator for f in result}
    assert ">=" in ops
    assert "<=" in ops
    assert all(f.scope == "group" for f in result)


def test_filter_conversion_measure_no_bounds_produces_nothing():
    filters = {
        "rev_filter": {
            "columnName": "SUM(revenue)",
            "type": "measure",
        }
    }
    result = FilterConversionService.convert_filters(filters)
    assert result == []
