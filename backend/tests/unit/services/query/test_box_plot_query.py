# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Unit tests for server-side box-plot summary query generation."""

import pytest

from backend.models.data_source import UnionTableDefinition, VirtualTableDefinition
from backend.models.query import BoxPlotField, Dimension, Filter, QueryDescription
from backend.services.query_components.box_plot_query_builder import (
    BOX_PLOT_COLOR_DISTINCT_COUNT_COLUMN,
    BOX_PLOT_COLOR_MAX_COLUMN,
    BOX_PLOT_COLOR_MIN_COLUMN,
    build_box_plot_sql,
)
from backend.services.query_service import QueryService


@pytest.fixture
def query_service() -> QueryService:
    return QueryService()


def _box_plot_desc(**overrides) -> QueryDescription:
    base = {
        "target_table": "measurements",
        "query_mode": "box_plot",
        "dimensions": [Dimension(field="region", flavour="discrete")],
        "measures": [],
        "filters": [],
        "orderBy": [],
        "box_plot_fields": [BoxPlotField(field="latency", alias="latency")],
        "box_plot_color_field": "env",
    }
    base.update(overrides)
    return QueryDescription(**base)


class TestBuildBoxPlotSqlDuckDb:
    def test_grouped_summary_with_color_metadata(self):
        desc = _box_plot_desc()
        sql = build_box_plot_sql(
            desc,
            "duckdb",
            '"',
            group_fields=[('"region"', "region")],
            value_fields=[('"latency"', "latency")],
            from_clause='FROM "measurements"',
            color_field_sql='"env"',
        )

        assert 'COUNT("latency") AS "latency__count"' in sql
        assert 'quantile_cont("latency", 0.25) AS "latency__q1"' in sql
        assert 'quantile_cont("latency", 0.5) AS "latency__median"' in sql
        assert 'quantile_cont("latency", 0.75) AS "latency__q3"' in sql
        assert f'MIN("env") AS "{BOX_PLOT_COLOR_MIN_COLUMN}"' in sql
        assert f'MAX("env") AS "{BOX_PLOT_COLOR_MAX_COLUMN}"' in sql
        assert f'COUNT(DISTINCT "env") AS "{BOX_PLOT_COLOR_DISTINCT_COUNT_COLUMN}"' in sql
        assert 'GROUP BY "region"' in sql
        assert 'ORDER BY "region"' in sql


class TestBuildBoxPlotSqlClickHouse:
    def test_grouped_summary_uses_exact_quantiles(self):
        desc = _box_plot_desc()
        sql = build_box_plot_sql(
            desc,
            "clickhouse",
            "`",
            group_fields=[("`region`", "region")],
            value_fields=[("`latency`", "latency")],
            from_clause="FROM `measurements`",
            color_field_sql="`env`",
        )

        assert "quantileExactInclusive(0.25)(`latency`)" in sql
        assert "quantileExactInclusive(0.5)(`latency`)" in sql
        assert "quantileExactInclusive(0.75)(`latency`)" in sql
        assert f"uniqExact(`env`) AS `{BOX_PLOT_COLOR_DISTINCT_COUNT_COLUMN}`" in sql
        assert "GROUP BY `region`" in sql
        assert "ORDER BY `region`" in sql


class TestQueryServiceBoxPlot:
    def test_translate_duckdb_box_plot_query(self, query_service: QueryService):
        desc = _box_plot_desc(
            filters=[Filter(field="status", operator="=", value="ok")],
        )
        sql, metadata = query_service.translate_to_sql(
            query_desc=desc,
            table_name="measurements",
            db_type="duckdb",
            with_optimization=False,
        )

        assert "quantile_cont" in sql
        assert '"latency__q1"' in sql
        assert '"latency__median"' in sql
        assert '"latency__q3"' in sql
        assert "WHERE" in sql
        assert metadata["optimizations"] == []

    def test_translate_clickhouse_box_plot_query(self, query_service: QueryService):
        desc = _box_plot_desc(target_database="analytics")
        sql, _ = query_service.translate_to_sql(
            query_desc=desc,
            table_name="measurements",
            db_type="clickhouse",
            with_optimization=False,
        )

        assert "quantileExactInclusive(0.25)" in sql
        assert "`analytics`.`measurements`" in sql


def _box_plot_union_desc(**overrides) -> QueryDescription:
    base = {
        "target_table": "measurements",
        "target_database": "db_alpha",
        "query_mode": "box_plot",
        "dimensions": [Dimension(field="region", flavour="discrete")],
        "measures": [],
        "filters": [],
        "orderBy": [],
        "box_plot_fields": [BoxPlotField(field="latency", alias="latency")],
        "virtual_table": VirtualTableDefinition(
            primary_table="measurements",
            mode="union",
            union_tables=[
                UnionTableDefinition(table_name="measurements", database="db_beta"),
            ],
        ),
    }
    base.update(overrides)
    return QueryDescription(**base)


class TestBoxPlotUnion:
    def test_translate_union_duckdb_box_plot(self, query_service: QueryService):
        desc = _box_plot_union_desc()
        sql, _ = query_service.translate_to_sql(
            query_desc=desc,
            table_name="measurements",
            db_type="duckdb",
            with_optimization=False,
        )

        assert "UNION ALL" in sql
        assert "quantile_cont" in sql
        assert '"_source_database"' in sql
        assert '"_source_table"' in sql

    def test_translate_union_clickhouse_box_plot(self, query_service: QueryService):
        desc = _box_plot_union_desc()
        sql, _ = query_service.translate_to_sql(
            query_desc=desc,
            table_name="measurements",
            db_type="clickhouse",
            with_optimization=False,
        )

        assert "UNION ALL" in sql
        assert "quantileExactInclusive(0.5)" in sql
        assert "'db_alpha' AS `_source_database`" in sql
        assert "'db_beta' AS `_source_database`" in sql
