# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Unit tests for result budget / preserve_extremes SQL wrapping."""

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
