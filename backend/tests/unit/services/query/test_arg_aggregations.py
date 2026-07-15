# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Unit tests for arg_max/arg_min ("latest/earliest value by <col>") aggregations."""

import pytest

from backend.exceptions import QueryGenerationError
from backend.models.data_source import UnionTableDefinition, VirtualTableDefinition
from backend.models.query import Dimension, Measure, OrderBy, QueryDescription, WindowCalc
from backend.services.query_service import QueryService


@pytest.fixture
def qs() -> QueryService:
    return QueryService()


def _desc(**overrides) -> QueryDescription:
    base = dict(target_table="measurements", dimensions=[], measures=[], filters=[], orderBy=[])
    base.update(overrides)
    return QueryDescription(**base)


def _arg_max_measure(alias: str = "LATEST(weight)", **overrides) -> Measure:
    base = dict(
        field="weight",
        aggregation="arg_max",
        aggregation_arg="ts",
        alias=alias,
    )
    base.update(overrides)
    return Measure(**base)


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
# Model
# ---------------------------------------------------------------------------

def test_measure_aggregation_arg_defaults_to_none():
    m = Measure(field="weight", aggregation="sum", alias="SUM(weight)")
    assert m.aggregation_arg is None


# ---------------------------------------------------------------------------
# SQL generation
# ---------------------------------------------------------------------------

def test_arg_max_duckdb_sql(qs: QueryService):
    desc = _desc(
        dimensions=[Dimension(field="day", flavour="continuous")],
        measures=[_arg_max_measure()],
    )
    sql = _translate(qs, desc)
    assert 'arg_max("weight","ts") AS "LATEST(weight)"' in sql.replace(", ", ",")
    assert "GROUP BY" in sql


def test_arg_max_clickhouse_sql(qs: QueryService):
    desc = _desc(
        dimensions=[Dimension(field="day", flavour="continuous")],
        measures=[_arg_max_measure()],
    )
    sql = _translate(qs, desc, db_type="clickhouse")
    assert "argMax(`weight`,`ts`) AS `LATEST(weight)`" in sql.replace(", ", ",")


def test_arg_min_duckdb_sql(qs: QueryService):
    desc = _desc(
        dimensions=[Dimension(field="day", flavour="continuous")],
        measures=[
            _arg_max_measure(alias="EARLIEST(weight)", aggregation="arg_min")
        ],
    )
    sql = _translate(qs, desc)
    assert 'arg_min("weight","ts") AS "EARLIEST(weight)"' in sql.replace(", ", ",")


def test_arg_max_not_wrapped_nan_safe_on_clickhouse(qs: QueryService):
    """arg_max must not be rewritten into sumIf/avgIf or Coalesce."""
    desc = _desc(
        dimensions=[Dimension(field="day", flavour="continuous")],
        measures=[_arg_max_measure()],
    )
    sql = _translate(qs, desc, db_type="clickhouse")
    assert "sumIf" not in sql
    assert "avgIf" not in sql
    assert "COALESCE" not in sql.upper()


def test_arg_max_requires_aggregation_arg(qs: QueryService):
    desc = _desc(
        dimensions=[Dimension(field="day", flavour="continuous")],
        measures=[_arg_max_measure(aggregation_arg=None)],
    )
    with pytest.raises(QueryGenerationError, match="aggregation_arg"):
        _translate(qs, desc)


def test_arg_max_rejected_on_union_tables(qs: QueryService):
    desc = _desc(
        dimensions=[Dimension(field="day", flavour="continuous")],
        measures=[_arg_max_measure()],
        virtual_table=VirtualTableDefinition(
            primary_table="measurements",
            mode="union",
            union_tables=[UnionTableDefinition(table_name="measurements_2024")],
        ),
    )
    with pytest.raises(QueryGenerationError, match="union"):
        _translate(qs, desc)


# ---------------------------------------------------------------------------
# Composition with window calcs (the "daily weight increase" scenario)
# ---------------------------------------------------------------------------

def test_arg_max_with_difference_window_calc(qs: QueryService):
    desc = _desc(
        dimensions=[
            Dimension(field="ts", flavour="continuous", date_part="day", date_mode="timeline"),
        ],
        measures=[
            _arg_max_measure(
                alias="DIFF(LATEST(weight))",
                window_calc=WindowCalc(
                    function="difference",
                    order_by_field="ts_day_timeline",
                    partition_by=[],
                ),
            )
        ],
        orderBy=[OrderBy(field="ts_day_timeline")],
    )
    sql = _translate(qs, desc)
    assert "arg_max(" in sql
    assert "windowed_base" in sql
    assert 'lag("DIFF(LATEST(weight))")' in sql


# ---------------------------------------------------------------------------
# Execution against real DuckDB (skipped if duckdb is unavailable)
# ---------------------------------------------------------------------------

duckdb = pytest.importorskip("duckdb")


@pytest.fixture
def con():
    con = duckdb.connect()
    con.execute(
        """
        CREATE TABLE measurements (ts TIMESTAMP, day INTEGER, weight DOUBLE);
        INSERT INTO measurements VALUES
            ('2026-01-01 08:00', 1, 10.0),
            ('2026-01-01 20:00', 1, 12.0),
            ('2026-01-02 08:00', 2, 11.5),
            ('2026-01-02 20:00', 2, 15.0),
            ('2026-01-03 20:00', 3, 18.0);
        """
    )
    yield con
    con.close()


def test_arg_max_execution_returns_closing_value(qs: QueryService, con):
    desc = _desc(
        dimensions=[Dimension(field="day", flavour="continuous")],
        measures=[_arg_max_measure()],
        orderBy=[OrderBy(field="day")],
    )
    rows = con.execute(_translate(qs, desc)).fetchall()
    assert rows == [(1, 12.0), (2, 15.0), (3, 18.0)]


def test_arg_max_with_difference_execution(qs: QueryService, con):
    """Per-day increase of the closing weight — the canonical use case."""
    desc = _desc(
        dimensions=[Dimension(field="day", flavour="continuous")],
        measures=[
            _arg_max_measure(
                alias="DIFF(LATEST(weight))",
                window_calc=WindowCalc(
                    function="difference",
                    order_by_field="day",
                    partition_by=[],
                ),
            )
        ],
        orderBy=[OrderBy(field="day")],
    )
    rows = con.execute(_translate(qs, desc)).fetchall()
    assert rows == [
        (1, None),   # first day → NULL
        (2, 3.0),    # 15 - 12
        (3, 3.0),    # 18 - 15
    ]
