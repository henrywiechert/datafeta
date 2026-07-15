# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Unit tests for post-aggregation window calculations (table calcs)."""

import pytest

from backend.dialects import ClickHouseDialect, DuckDbDialect
from backend.models.query import Dimension, Measure, OrderBy, QueryDescription, WindowCalc
from backend.services.query_components.window_calc_builder import (
    apply_window_calcs,
    has_window_calcs,
    strip_window_calcs,
)
from backend.services.query_service import QueryService


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

@pytest.fixture
def qs() -> QueryService:
    return QueryService()


def _desc(**overrides) -> QueryDescription:
    base = dict(target_table="t", dimensions=[], measures=[], filters=[], orderBy=[])
    base.update(overrides)
    return QueryDescription(**base)


def _diff_measure(alias: str = "DIFF(MAX(weight))", order_by: str = "day",
                  partition_by=None, function: str = "difference") -> Measure:
    return Measure(
        field="weight",
        aggregation="max",
        alias=alias,
        window_calc=WindowCalc(
            function=function,
            order_by_field=order_by,
            partition_by=partition_by or [],
        ),
    )


def _translate(qs: QueryService, desc: QueryDescription, db_type: str = "duckdb") -> str:
    sql, _ = qs.translate_to_sql(
        query_desc=desc,
        table_name=desc.target_table,
        db_type=db_type,
        with_sampling=False,
        with_optimization=False,
    )
    return sql


# ---------------------------------------------------------------------------
# Model / helpers
# ---------------------------------------------------------------------------

def test_measure_window_calc_defaults_to_none():
    m = Measure(field="weight", aggregation="sum", alias="SUM(weight)")
    assert m.window_calc is None


def test_has_and_strip_window_calcs():
    desc = _desc(measures=[_diff_measure()])
    assert has_window_calcs(desc)
    strip_window_calcs(desc)
    assert not has_window_calcs(desc)
    assert desc.measures[0].window_calc is None


# ---------------------------------------------------------------------------
# apply_window_calcs — SQL shape
# ---------------------------------------------------------------------------

def test_noop_without_window_calcs():
    desc = _desc(measures=[Measure(field="w", aggregation="sum", alias="SUM(w)")])
    sql = 'SELECT "w" FROM "t"'
    assert apply_window_calcs(sql, desc, dialect=DuckDbDialect()) == sql


def test_noop_for_non_standard_query_modes():
    desc = _desc(measures=[_diff_measure()], query_mode="cdf")
    sql = "SELECT 1"
    assert apply_window_calcs(sql, desc, dialect=DuckDbDialect()) == sql


def test_noop_for_filter_value_queries():
    desc = _desc(
        dimensions=[Dimension(field="day", flavour="continuous")],
        measures=[_diff_measure()],
        fetch_filter_values=True,
    )
    sql = "SELECT 1"
    assert apply_window_calcs(sql, desc, dialect=DuckDbDialect()) == sql


def test_difference_duckdb_sql_shape():
    desc = _desc(
        dimensions=[
            Dimension(field="category", flavour="discrete"),
            Dimension(field="day", flavour="continuous"),
        ],
        measures=[_diff_measure(partition_by=["category"])],
        orderBy=[OrderBy(field="category"), OrderBy(field="day")],
    )
    sql = apply_window_calcs("SELECT 1", desc, dialect=DuckDbDialect())

    assert 'FROM (\nSELECT 1\n) AS windowed_base' in sql
    assert '"DIFF(MAX(weight))" - lag("DIFF(MAX(weight))") OVER ' \
           '(PARTITION BY "category" ORDER BY "day") AS "DIFF(MAX(weight))"' in sql
    # dims pass through, outer ORDER BY re-emitted
    assert sql.startswith('SELECT "category", "day",')
    assert sql.rstrip().endswith('ORDER BY "category" ASC, "day" ASC')


def test_difference_clickhouse_uses_lag_in_frame():
    desc = _desc(
        dimensions=[Dimension(field="day", flavour="continuous")],
        measures=[_diff_measure()],
    )
    sql = apply_window_calcs("SELECT 1", desc, dialect=ClickHouseDialect())

    assert "lagInFrame(toNullable(`DIFF(MAX(weight))`), 1, NULL) OVER " \
           "(ORDER BY `day` ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)" in sql
    assert "lag(`" not in sql  # no bare lag() on ClickHouse


def test_running_sum_sql_shape():
    desc = _desc(
        dimensions=[Dimension(field="day", flavour="continuous")],
        measures=[_diff_measure(alias="RUNNING_SUM(SUM(w))", function="running_sum")],
    )
    sql = apply_window_calcs("SELECT 1", desc, dialect=DuckDbDialect())
    assert 'sum("RUNNING_SUM(SUM(w))") OVER (ORDER BY "day" ' \
           'ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS "RUNNING_SUM(SUM(w))"' in sql


def test_percent_difference_duckdb_sql_shape():
    desc = _desc(
        dimensions=[Dimension(field="day", flavour="continuous")],
        measures=[_diff_measure(alias="PCT_DIFF(MAX(weight))", function="percent_difference")],
    )
    sql = apply_window_calcs("SELECT 1", desc, dialect=DuckDbDialect())
    assert (
        '("PCT_DIFF(MAX(weight))" - lag("PCT_DIFF(MAX(weight))") OVER (ORDER BY "day")) '
        '/ nullif(lag("PCT_DIFF(MAX(weight))") OVER (ORDER BY "day"), 0) '
        'AS "PCT_DIFF(MAX(weight))"'
    ) in sql


def test_percent_difference_clickhouse_uses_lag_in_frame():
    desc = _desc(
        dimensions=[Dimension(field="day", flavour="continuous")],
        measures=[_diff_measure(alias="PCT_DIFF(MAX(weight))", function="percent_difference")],
    )
    sql = apply_window_calcs("SELECT 1", desc, dialect=ClickHouseDialect())
    assert "lagInFrame(toNullable(`PCT_DIFF(MAX(weight))`), 1, NULL)" in sql
    assert "nullif(" in sql
    assert "lag(`" not in sql


def test_skipped_when_order_by_field_not_a_dimension():
    desc = _desc(
        dimensions=[Dimension(field="category", flavour="discrete")],
        measures=[_diff_measure(order_by="day")],  # 'day' not on the shelf
    )
    sql = "SELECT 1"
    assert apply_window_calcs(sql, desc, dialect=DuckDbDialect()) == sql


def test_unknown_partition_fields_are_dropped():
    desc = _desc(
        dimensions=[Dimension(field="day", flavour="continuous")],
        measures=[_diff_measure(partition_by=["ghost"])],
    )
    sql = apply_window_calcs("SELECT 1", desc, dialect=DuckDbDialect())
    assert "PARTITION BY" not in sql
    assert 'OVER (ORDER BY "day")' in sql


def test_datetime_part_dimension_uses_output_alias():
    desc = _desc(
        dimensions=[
            Dimension(field="ts", flavour="continuous", date_part="day", date_mode="timeline"),
        ],
        measures=[_diff_measure(order_by="ts_day_timeline")],
    )
    sql = apply_window_calcs("SELECT 1", desc, dialect=DuckDbDialect())
    assert 'ORDER BY "ts_day_timeline"' in sql
    assert sql.startswith('SELECT "ts_day_timeline",')


def test_plain_measures_pass_through_unchanged():
    desc = _desc(
        dimensions=[Dimension(field="day", flavour="continuous")],
        measures=[
            _diff_measure(),
            Measure(field="w", aggregation="sum", alias="SUM(w)"),
        ],
    )
    sql = apply_window_calcs("SELECT 1", desc, dialect=DuckDbDialect())
    assert ', "SUM(w)"' in sql
    assert 'lag("SUM(w)")' not in sql


def test_label_fields_pass_through():
    desc = _desc(
        dimensions=[Dimension(field="day", flavour="continuous")],
        measures=[_diff_measure()],
        label_fields=["note"],
    )
    sql = apply_window_calcs("SELECT 1", desc, dialect=DuckDbDialect())
    assert ', "note"' in sql


# ---------------------------------------------------------------------------
# translate_to_sql integration — wrapper applied exactly once
# ---------------------------------------------------------------------------

def test_translate_wraps_aggregated_query(qs: QueryService):
    desc = _desc(
        dimensions=[
            Dimension(field="category", flavour="discrete"),
            Dimension(field="day", flavour="continuous"),
        ],
        measures=[_diff_measure(partition_by=["category"])],
        orderBy=[OrderBy(field="category"), OrderBy(field="day")],
    )
    sql = _translate(qs, desc)
    assert sql.count("windowed_base") == 1
    assert "GROUP BY" in sql
    assert 'lag("DIFF(MAX(weight))")' in sql
    # inner aggregate is aliased to the final measure alias
    assert 'MAX("weight") "DIFF(MAX(weight))"' in sql


def test_translate_without_calc_is_unwrapped(qs: QueryService):
    desc = _desc(
        dimensions=[Dimension(field="day", flavour="continuous")],
        measures=[Measure(field="weight", aggregation="max", alias="MAX(weight)")],
    )
    sql = _translate(qs, desc)
    assert "windowed_base" not in sql
    assert "OVER" not in sql


# ---------------------------------------------------------------------------
# Execution against real DuckDB (skipped if duckdb is unavailable)
# ---------------------------------------------------------------------------

duckdb = pytest.importorskip("duckdb")


@pytest.fixture
def con():
    con = duckdb.connect()
    con.execute(
        """
        CREATE TABLE t (category VARCHAR, day INTEGER, weight DOUBLE);
        INSERT INTO t VALUES
            ('A', 1, 10), ('A', 1, 20), ('A', 2, 35), ('A', 3, 50),
            ('B', 1, 5),  ('B', 2, 15);
        """
    )
    yield con
    con.close()


def test_difference_execution_per_partition(qs: QueryService, con):
    desc = _desc(
        dimensions=[
            Dimension(field="category", flavour="discrete"),
            Dimension(field="day", flavour="continuous"),
        ],
        measures=[_diff_measure(partition_by=["category"])],
        orderBy=[OrderBy(field="category"), OrderBy(field="day")],
    )
    rows = con.execute(_translate(qs, desc)).fetchall()
    assert rows == [
        ("A", 1, None),   # first bucket of partition A → NULL
        ("A", 2, 15.0),   # 35 - 20
        ("A", 3, 15.0),   # 50 - 35
        ("B", 1, None),   # first bucket of partition B → NULL
        ("B", 2, 10.0),   # 15 - 5
    ]


def test_running_sum_execution(qs: QueryService, con):
    desc = _desc(
        dimensions=[
            Dimension(field="category", flavour="discrete"),
            Dimension(field="day", flavour="continuous"),
        ],
        measures=[
            Measure(
                field="weight",
                aggregation="sum",
                alias="RUNNING_SUM(SUM(weight))",
                window_calc=WindowCalc(
                    function="running_sum",
                    order_by_field="day",
                    partition_by=["category"],
                ),
            )
        ],
        orderBy=[OrderBy(field="category"), OrderBy(field="day")],
    )
    rows = con.execute(_translate(qs, desc)).fetchall()
    assert rows == [
        ("A", 1, 30.0),   # 10 + 20
        ("A", 2, 65.0),   # + 35
        ("A", 3, 115.0),  # + 50
        ("B", 1, 5.0),
        ("B", 2, 20.0),
    ]


def test_percent_difference_execution(qs: QueryService, con):
    desc = _desc(
        dimensions=[
            Dimension(field="category", flavour="discrete"),
            Dimension(field="day", flavour="continuous"),
        ],
        measures=[
            _diff_measure(
                alias="PCT_DIFF(MAX(weight))",
                function="percent_difference",
                partition_by=["category"],
            )
        ],
        orderBy=[OrderBy(field="category"), OrderBy(field="day")],
    )
    rows = con.execute(_translate(qs, desc)).fetchall()
    # MAX(weight): A → 20, 35, 50; B → 5, 15
    assert rows[0] == ("A", 1, None)                      # first bucket → NULL
    assert rows[1][2] == pytest.approx(0.75)              # (35-20)/20
    assert rows[2][2] == pytest.approx(15 / 35)           # (50-35)/35
    assert rows[3] == ("B", 1, None)
    assert rows[4][2] == pytest.approx(2.0)               # (15-5)/5
