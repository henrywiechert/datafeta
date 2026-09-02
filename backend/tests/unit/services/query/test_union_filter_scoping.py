# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Filters on stacked (union) tables with different schemas.

A filter on a column only one of the stacked tables carries must constrain that
table only — the other tables keep their rows.  Before per-table filter scoping,
any such filter removed every other table from the UNION, so a chart with a Y
field from each table lost the series of the table not named in the filter.
"""
from unittest.mock import MagicMock

import pytest

from backend.connectors.base import Column
from backend.models.data_source import (
    UnionTableDefinition,
    VirtualColumnDefinition,
    VirtualTableDefinition,
)
from backend.models.query import (
    BoxPlotField,
    CdfField,
    Dimension,
    Filter,
    Measure,
    QueryDescription,
)
from backend.services.query_service import QueryService

# tabA and tabB share utc/cellId; a_metric is only in tabA, b_metric only in tabB.
TAB_A_COLUMNS = [
    Column(name="utc", data_type="TIMESTAMP"),
    Column(name="cellId", data_type="INTEGER"),
    Column(name="a_metric", data_type="DOUBLE"),
]
TAB_B_COLUMNS = [
    Column(name="utc", data_type="TIMESTAMP"),
    Column(name="cellId", data_type="INTEGER"),
    Column(name="b_metric", data_type="DOUBLE"),
]

VIRTUAL_TABLE = VirtualTableDefinition(
    primary_table="tabA",
    mode="union",
    union_tables=[UnionTableDefinition(table_name="tabB")],
)


@pytest.fixture
def connector():
    mock = MagicMock()
    mock.list_columns.side_effect = lambda database, table: (
        TAB_A_COLUMNS if table == "tabA" else TAB_B_COLUMNS
    )
    mock.estimate_table_size.return_value = 100
    return mock


def _translate(connector, db_type="duckdb", database="main", **kwargs):
    query_description = QueryDescription(
        target_table="tabA",
        target_database=database,
        virtual_table=VIRTUAL_TABLE,
        **kwargs,
    )
    sql, _ = QueryService().translate_to_sql(
        query_description,
        table_name="tabA",
        db_type=db_type,
        with_optimization=False,
        connector=connector,
    )
    return sql


def _branch(sql, table_name):
    """The UNION branch reading `table_name`, or None when it was skipped."""
    for part in sql.split("UNION ALL"):
        if f'"{table_name}"' in part.split("FROM", 1)[-1]:
            return part
    return None


def _both_y_dimensions():
    return [
        Dimension(field="utc", flavour="continuous", date_part="second", date_mode="timeline"),
        Dimension(field="a_metric", flavour="continuous"),
        Dimension(field="b_metric", flavour="continuous"),
    ]


def test_value_filter_on_field_of_one_table_keeps_the_other_table(connector):
    """The reported bug: a filter on a tabA-only column emptied tabB's series."""
    sql = _translate(
        connector,
        dimensions=_both_y_dimensions(),
        filters=[Filter(field="a_metric", operator=">=", value=0)],
    )

    branch_a, branch_b = _branch(sql, "tabA"), _branch(sql, "tabB")
    assert branch_a is not None and branch_b is not None
    # The filter constrains only the table that has the column
    assert '"a_metric">=0' in branch_a
    assert "a_metric" not in branch_b.split("WHERE", 1)[1]


def test_discrete_filter_on_shared_field_applies_to_every_table(connector):
    sql = _translate(
        connector,
        dimensions=_both_y_dimensions(),
        filters=[Filter(field="cellId", operator="in", value=[1])],
    )

    for table_name in ("tabA", "tabB"):
        branch = _branch(sql, table_name)
        assert branch is not None
        assert '"cellId" IN (1)' in branch


def test_measure_filter_does_not_empty_the_whole_union(connector):
    """A HAVING filter's field is a measure alias, never a column.

    Matching it against the tables' columns made every branch look unfilterable,
    so the query collapsed to a single all-zero row.
    """
    sql = _translate(
        connector,
        dimensions=[
            Dimension(field="utc", flavour="continuous", date_part="second", date_mode="timeline")
        ],
        measures=[
            Measure(field="a_metric", aggregation="sum", alias="SUM(a_metric)"),
            Measure(field="b_metric", aggregation="sum", alias="SUM(b_metric)"),
        ],
        filters=[Filter(field="SUM(a_metric)", operator=">=", value=5, scope="group")],
    )

    assert "UNION ALL" in sql
    branch_a, branch_b = _branch(sql, "tabA"), _branch(sql, "tabB")
    assert branch_a is not None and branch_b is not None
    # HAVING only where the aggregated column exists
    assert "HAVING" in branch_a
    assert "HAVING" not in branch_b


def test_is_null_filter_keeps_tables_without_the_field(connector):
    """A NULL-filled column satisfies `is null`, so the table must stay."""
    sql = _translate(
        connector,
        dimensions=_both_y_dimensions(),
        filters=[Filter(field="a_metric", operator="is null", value=None)],
    )

    assert _branch(sql, "tabB") is not None


def test_null_excluding_filter_still_skips_tables_without_the_field(connector):
    """`is not null` asks for a value the table cannot have — it contributes nothing."""
    sql = _translate(
        connector,
        dimensions=_both_y_dimensions(),
        filters=[Filter(field="a_metric", operator="is not null", value=None)],
    )

    assert _branch(sql, "tabB") is None
    assert _branch(sql, "tabA") is not None


def test_not_in_filter_excluding_null_skips_tables_without_the_field(connector):
    """Deselecting NULL in a discrete filter arrives as `not in [..., None]`."""
    sql = _translate(
        connector,
        dimensions=_both_y_dimensions(),
        filters=[Filter(field="a_metric", operator="not in", value=[1.0, None])],
    )

    assert _branch(sql, "tabB") is None


def test_not_in_filter_without_null_keeps_tables_without_the_field(connector):
    sql = _translate(
        connector,
        dimensions=_both_y_dimensions(),
        filters=[Filter(field="a_metric", operator="not in", value=[1.0])],
    )

    assert _branch(sql, "tabB") is not None


def test_filter_on_virtual_column_computable_in_one_table_only(connector):
    """A virtual column is filterable wherever its source fields exist."""
    sql = _translate(
        connector,
        dimensions=_both_y_dimensions(),
        virtual_columns=[
            VirtualColumnDefinition(
                name="a_scaled", expression="a_metric * 2", output_type="DOUBLE"
            )
        ],
        filters=[Filter(field="a_scaled", operator=">=", value=1)],
    )

    branch_a, branch_b = _branch(sql, "tabA"), _branch(sql, "tabB")
    assert branch_a is not None and branch_b is not None
    assert '"a_metric"*2' in branch_a
    assert "a_metric" not in branch_b.split("WHERE", 1)[1]


def test_cdf_union_scopes_filters_to_the_tables_that_have_the_field(connector):
    """The CDF path builds its own SELECT; its filters need the same scoping."""
    sql = _translate(
        connector,
        query_mode="cdf",
        cdf_fields=[CdfField(field="cellId", alias="cellId__cdf")],
        filters=[Filter(field="a_metric", operator=">=", value=0)],
    )

    branch_a, branch_b = _branch(sql, "tabA"), _branch(sql, "tabB")
    assert branch_a is not None and branch_b is not None
    assert '"a_metric">=0' in branch_a
    assert "a_metric" not in branch_b


def test_box_plot_union_scopes_filters_to_the_tables_that_have_the_field(connector):
    sql = _translate(
        connector,
        dimensions=[Dimension(field="cellId", flavour="discrete")],
        query_mode="box_plot",
        box_plot_fields=[BoxPlotField(field="cellId", alias="cellId")],
        filters=[Filter(field="a_metric", operator=">=", value=0)],
    )

    branch_a, branch_b = _branch(sql, "tabA"), _branch(sql, "tabB")
    assert branch_a is not None and branch_b is not None
    assert '"a_metric">=0' in branch_a
    assert "a_metric" not in branch_b


# ---------------------------------------------------------------------------
# Execution against real DuckDB (skipped if duckdb is unavailable)
# ---------------------------------------------------------------------------

duckdb = pytest.importorskip("duckdb")


@pytest.fixture
def con():
    con = duckdb.connect()
    con.execute(
        """
        CREATE TABLE tabA (utc TIMESTAMP, cellId INTEGER, a_metric DOUBLE);
        CREATE TABLE tabB (utc TIMESTAMP, cellId INTEGER, b_metric DOUBLE);
        INSERT INTO tabA VALUES
            ('2026-01-01 08:00:00', 1, 10.0),
            ('2026-01-01 08:00:01', 2, 20.0);
        INSERT INTO tabB VALUES
            ('2026-01-01 08:00:00', 1, 100.0),
            ('2026-01-01 08:00:01', 2, 200.0);
        """
    )
    yield con
    con.close()


def _exec_dimensions():
    """Y field from each table over a shared X — without the timezone-converting
    datetime extraction, which DuckDB can only evaluate with pytz installed."""
    return [
        Dimension(field="cellId", flavour="continuous"),
        Dimension(field="a_metric", flavour="continuous"),
        Dimension(field="b_metric", flavour="continuous"),
    ]


def test_execution_filter_on_one_tables_field_keeps_both_series(connector, con):
    sql = _translate(
        connector,
        dimensions=_exec_dimensions(),
        filters=[Filter(field="a_metric", operator=">=", value=20)],
    )
    rows = {(row[1], row[2]) for row in con.execute(sql).fetchall()}

    # tabA is filtered down to its 20.0 row; tabB keeps both of its rows
    assert rows == {(20.0, None), (None, 100.0), (None, 200.0)}


def test_execution_filter_on_shared_field_filters_both_series(connector, con):
    sql = _translate(
        connector,
        dimensions=_exec_dimensions(),
        filters=[Filter(field="cellId", operator="in", value=[1])],
    )
    rows = {(row[1], row[2]) for row in con.execute(sql).fetchall()}

    assert rows == {(10.0, None), (None, 100.0)}


def test_execution_measure_filter_keeps_the_unfiltered_tables_measure(connector, con):
    sql = _translate(
        connector,
        dimensions=[Dimension(field="cellId", flavour="discrete")],
        measures=[
            Measure(field="a_metric", aggregation="sum", alias="SUM(a_metric)"),
            Measure(field="b_metric", aggregation="sum", alias="SUM(b_metric)"),
        ],
        filters=[Filter(field="SUM(a_metric)", operator=">=", value=15, scope="group")],
    )
    rows = {tuple(row[:3]) for row in con.execute(sql).fetchall()}

    # cellId 1 drops out of tabA (sum 10 < 15) but keeps its tabB row
    assert rows == {(2, 20.0, None), (1, None, 100.0), (2, None, 200.0)}
