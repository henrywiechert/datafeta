# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Unit tests for result budget / preserve_extremes SQL wrapping."""

import pytest

from backend.dialects import DuckDbDialect
from backend.models.query import Dimension, QueryDescription, Measure, ResultBudget
from backend.services.query_components.result_budget_applier import apply_result_budget


def _heatmap_like_sql() -> str:
    return '''
SELECT EXTRACT(YEAR FROM timezone('UTC',"dt")) AS "dt_year_distinct",
EXTRACT(MONTH FROM timezone('UTC',"dt")) AS "dt_month_distinct",
COALESCE(AVG("AverageTemperature"),0) "AVG(AverageTemperature)"
FROM "globallandtemperaturesbycountry"
GROUP BY EXTRACT(YEAR FROM timezone('UTC',"dt")),EXTRACT(MONTH FROM timezone('UTC',"dt"))
'''.strip()


class TestPreserveExtremesDatetimeDistinct:
    def test_does_not_reference_raw_dt_when_only_part_aliases_projected(self):
        query_desc = QueryDescription(
            target_table="globallandtemperaturesbycountry",
            dimensions=[
                Dimension(
                    field="dt",
                    flavour="continuous",
                    axis="x",
                    date_part="year",
                    date_mode="distinct",
                ),
                Dimension(
                    field="dt",
                    flavour="continuous",
                    axis="y",
                    date_part="month",
                    date_mode="distinct",
                ),
            ],
            measures=[
                Measure(
                    field="AverageTemperature",
                    aggregation="avg",
                    alias="AVG(AverageTemperature)",
                )
            ],
            result_budget=ResultBudget(
                max_rows=5000,
                strategy="preserve_extremes",
                preserve_fields=["dt"],
            ),
        )

        sql = apply_result_budget(
            _heatmap_like_sql(),
            query_desc,
            dialect=DuckDbDialect(),
        )

        assert '"dt"' not in sql or '"dt_year_distinct"' in sql
        assert "ORDER BY \"dt\" ASC" not in sql
        assert '"dt_year_distinct"' in sql or "ORDER BY random" in sql.lower()

    def test_fallback_random_when_no_preserve_columns_in_select(self):
        query_desc = QueryDescription(
            target_table="globallandtemperaturesbycountry",
            dimensions=[
                Dimension(
                    field="dt",
                    flavour="continuous",
                    axis="x",
                    date_part="year",
                    date_mode="distinct",
                ),
            ],
            measures=[
                Measure(
                    field="AverageTemperature",
                    aggregation="avg",
                    alias="AVG(AverageTemperature)",
                )
            ],
            result_budget=ResultBudget(
                max_rows=1000,
                strategy="preserve_extremes",
                preserve_fields=None,
            ),
        )

        sql = apply_result_budget(
            _heatmap_like_sql(),
            query_desc,
            dialect=DuckDbDialect(),
        )

        assert "ORDER BY \"dt\"" not in sql
        assert "random" in sql.lower()


def _grouped_sql() -> str:
    return (
        'SELECT "rnti" "rnti", COALESCE(SUM("mcs"),0) "SUM(mcs)" '
        'FROM "voipStateData" LEFT JOIN "dlFdSchedData" ON "voipStateData"."rnti"="dlFdSchedData"."rnti" '
        'GROUP BY "rnti"'
    )


def _grouped_query_desc(max_rows: int = 50000) -> QueryDescription:
    return QueryDescription(
        target_table="voipStateData",
        dimensions=[Dimension(field="rnti", flavour="continuous", axis="x")],
        measures=[Measure(field="mcs", aggregation="sum", alias="SUM(mcs)")],
        result_budget=ResultBudget(
            max_rows=max_rows,
            strategy="preserve_extremes",
            preserve_fields=["rnti"],
        ),
    )


class TestPreserveExtremesSinglePass:
    def test_base_query_is_evaluated_once(self):
        """CTEs/subqueries are inlined per reference, so base must appear once."""
        sql = apply_result_budget(
            _grouped_sql(), _grouped_query_desc(), dialect=DuckDbDialect()
        )

        assert sql.count("GROUP BY") == 1
        assert sql.count("LEFT JOIN") == 1
        assert "UNION ALL" not in sql

    def test_helper_rank_columns_are_projected_away(self):
        sql = apply_result_budget(
            _grouped_sql(), _grouped_query_desc(), dialect=DuckDbDialect()
        )

        assert sql.startswith('SELECT * EXCLUDE ("__rb_min_0", "__rb_max_0", "__rb_sample")')

    def test_clickhouse_uses_except_keyword(self):
        from backend.dialects import ClickHouseDialect

        # ClickHouse quotes with backticks, and preserve columns are matched
        # against the SELECT region using the dialect's quote char.
        ch_base = (
            'SELECT `rnti` `rnti`, sumIf(`mcs`, isFinite(`mcs`)) AS `SUM(mcs)` '
            'FROM `db`.`voipStateData` GROUP BY `rnti`'
        )
        sql = apply_result_budget(
            ch_base, _grouped_query_desc(), dialect=ClickHouseDialect()
        )

        assert sql.startswith("SELECT * EXCEPT (`__rb_min_0`, `__rb_max_0`, `__rb_sample`)")
        assert "rand()" in sql

    def test_sample_budget_reserves_slots_for_extremes(self):
        sql = apply_result_budget(
            _grouped_sql(), _grouped_query_desc(max_rows=1000), dialect=DuckDbDialect()
        )

        assert '"__rb_sample" <= 998' in sql


class TestPreserveExtremesExecution:
    """End-to-end against DuckDB: extremes kept, no duplicates, budget respected."""

    def _run(self, max_rows: int, row_count: int = 100):
        duckdb = pytest.importorskip("duckdb")
        con = duckdb.connect()
        con.execute(
            f"CREATE TABLE t AS SELECT i AS k, i * 2 AS v FROM range({row_count}) tbl(i)"
        )
        base = 'SELECT "k" "k", COALESCE(SUM("v"),0) "SUM(v)" FROM "t" GROUP BY "k"'
        query_desc = QueryDescription(
            target_table="t",
            dimensions=[Dimension(field="k", flavour="continuous", axis="x")],
            measures=[Measure(field="v", aggregation="sum", alias="SUM(v)")],
            result_budget=ResultBudget(
                max_rows=max_rows, strategy="preserve_extremes", preserve_fields=["k"]
            ),
        )
        sql = apply_result_budget(base, query_desc, dialect=DuckDbDialect())
        rows = con.execute(sql).fetchall()
        columns = [d[0] for d in con.description]
        return columns, [r[0] for r in rows]

    def test_keeps_extremes_within_budget_without_duplicates(self):
        columns, keys = self._run(max_rows=10)

        assert columns == ["k", "SUM(v)"]
        assert len(keys) <= 10
        assert len(set(keys)) == len(keys)
        assert 0 in keys and 99 in keys
        assert keys == sorted(keys)

    def test_small_result_returned_intact(self):
        """Base below the budget must come back once — not with duplicated extremes."""
        columns, keys = self._run(max_rows=50000)

        assert columns == ["k", "SUM(v)"]
        assert keys == list(range(100))
