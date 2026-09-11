# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Unit tests for dialect-driven aggregate expression building.

Covers the contract every aggregation must satisfy on every engine: it renders,
it renders the same way in SELECT and HAVING, and an aggregation a dialect does
not declare is rejected rather than silently substituted.
"""

from typing import get_args

import pytest
from pypika import Field as PypikaField

from backend.dialects import get_dialect
from backend.dialects.aggregations import COUNT_STAR
from backend.exceptions import QueryGenerationError
from backend.models.query import Dimension, Filter, Measure, QueryDescription
from backend.services.query_components.aggregation_builder import (
    build_aggregate_term,
    requires_order_arg,
)
from backend.services.query_service import QueryService

DIALECTS = ['duckdb', 'clickhouse']

#: Every aggregation the API accepts, read off the model so a new one cannot be
#: added without these tests covering it.
DECLARED_AGGREGATIONS = list(get_args(Measure.model_fields['aggregation'].annotation))


@pytest.fixture
def qs() -> QueryService:
    return QueryService()


def _sql(dialect_name: str, aggregation: str, **kwargs) -> str:
    dialect = get_dialect(dialect_name)
    term = build_aggregate_term(
        dialect, aggregation, PypikaField('weight'), **kwargs
    )
    return term.get_sql(quote_char=dialect.quote_char)


def _translate(qs: QueryService, desc: QueryDescription, db_type: str) -> str:
    sql, _ = qs.translate_to_sql(
        query_desc=desc,
        table_name=desc.target_table,
        db_type=db_type,
        with_sampling=False,
        with_optimization=False,
    )
    return sql


# ---------------------------------------------------------------------------
# Rendering
# ---------------------------------------------------------------------------

@pytest.mark.parametrize('dialect_name', DIALECTS)
@pytest.mark.parametrize('aggregation', DECLARED_AGGREGATIONS)
def test_every_declared_aggregation_renders(dialect_name: str, aggregation: str):
    arg = PypikaField('ts') if requires_order_arg(get_dialect(dialect_name), aggregation) else None
    sql = _sql(dialect_name, aggregation, arg_term=arg)
    assert 'weight' in sql


@pytest.mark.parametrize(
    'dialect_name, aggregation, expected',
    [
        # Guarded: DuckDB propagates NaN through SUM/AVG despite not needing
        # ClickHouse's -If combinator.
        ('duckdb', 'sum', 'COALESCE(SUM("weight") FILTER(WHERE isFinite("weight")),0)'),
        ('duckdb', 'avg', 'COALESCE(AVG("weight") FILTER(WHERE isFinite("weight")),0)'),
        ('duckdb', 'median', 'quantile_cont("weight",0.5) FILTER(WHERE isFinite("weight"))'),
        ('clickhouse', 'median',
         'quantileExactInclusiveIf(0.5)(`weight`,isFinite(`weight`))'),
        ('duckdb', 'count', 'COUNT("weight")'),
        ('duckdb', 'count_distinct', 'COUNT(DISTINCT "weight")'),
        ('duckdb', 'min', 'MIN("weight")'),
        ('duckdb', 'max', 'MAX("weight")'),
        # ClickHouse propagates NaN, so sum/avg carry the -If finite guard.
        ('clickhouse', 'sum', 'sumIf(`weight`,isFinite(`weight`))'),
        ('clickhouse', 'avg', 'avgIf(`weight`,isFinite(`weight`))'),
        ('clickhouse', 'count', 'COUNT(`weight`)'),
        ('clickhouse', 'count_distinct', 'COUNT(DISTINCT `weight`)'),
        ('clickhouse', 'min', 'MIN(`weight`)'),
        ('clickhouse', 'max', 'MAX(`weight`)'),
    ],
)
def test_single_argument_sql(dialect_name: str, aggregation: str, expected: str):
    assert _sql(dialect_name, aggregation).replace(', ', ',') == expected


@pytest.mark.parametrize(
    'dialect_name, aggregation, expected',
    [
        ('duckdb', 'arg_max', 'arg_max("weight","ts")'),
        ('duckdb', 'arg_min', 'arg_min("weight","ts")'),
        ('clickhouse', 'arg_max', 'argMax(`weight`,`ts`)'),
        ('clickhouse', 'arg_min', 'argMin(`weight`,`ts`)'),
    ],
)
def test_two_argument_sql(dialect_name: str, aggregation: str, expected: str):
    sql = _sql(dialect_name, aggregation, arg_term=PypikaField('ts'))
    assert sql.replace(', ', ',') == expected


@pytest.mark.parametrize(
    'dialect_name, expected',
    [('duckdb', 'COUNT(*)'), ('clickhouse', 'count()')],
)
def test_count_star_sql(dialect_name: str, expected: str):
    dialect = get_dialect(dialect_name)
    term = build_aggregate_term(dialect, COUNT_STAR)
    assert term.get_sql(quote_char=dialect.quote_char) == expected


# ---------------------------------------------------------------------------
# Rejection
# ---------------------------------------------------------------------------

@pytest.mark.parametrize('dialect_name', DIALECTS)
def test_unknown_aggregation_is_rejected(dialect_name: str):
    with pytest.raises(QueryGenerationError, match='Unsupported aggregation function'):
        _sql(dialect_name, 'stddev')


@pytest.mark.parametrize('dialect_name', DIALECTS)
@pytest.mark.parametrize('aggregation', ['arg_max', 'arg_min'])
def test_two_argument_aggregation_without_ordering_column_is_rejected(
    dialect_name: str, aggregation: str
):
    with pytest.raises(QueryGenerationError, match='requires .aggregation_arg'):
        _sql(dialect_name, aggregation, field_name='weight')


# ---------------------------------------------------------------------------
# SELECT and HAVING must agree
# ---------------------------------------------------------------------------

@pytest.mark.parametrize('dialect_name', DIALECTS)
@pytest.mark.parametrize('aggregation', ['sum', 'avg', 'count_distinct', 'min', 'max'])
def test_having_filters_the_same_expression_it_displays(
    qs: QueryService, dialect_name: str, aggregation: str
):
    """A measure filter must test the value the chart shows.

    The two clauses used to be built from different sources, so on ClickHouse a
    group could display the NaN-guarded sumIf() total while HAVING tested the
    raw SUM() -- NaN-poisoned, comparing false, silently dropping a group that
    displayed a qualifying number.
    """
    alias = f"{aggregation.upper()}(weight)"
    desc = QueryDescription(
        target_table='m',
        dimensions=[Dimension(field='day', flavour='continuous')],
        measures=[Measure(field='weight', aggregation=aggregation, alias=alias)],
        filters=[Filter(field=alias, operator='>=', value=5, scope='group')],
        orderBy=[],
    )
    sql = _translate(qs, desc, dialect_name)

    select_expr = _sql(dialect_name, aggregation)
    having_part = sql.split('HAVING ')[1]
    assert having_part.startswith(select_expr), f"HAVING {having_part} vs SELECT {select_expr}"


@pytest.mark.parametrize('dialect_name', DIALECTS)
def test_having_supports_two_argument_aggregations(qs: QueryService, dialect_name: str):
    desc = QueryDescription(
        target_table='m',
        dimensions=[Dimension(field='day', flavour='continuous')],
        measures=[
            Measure(
                field='weight',
                aggregation='arg_max',
                aggregation_arg='ts',
                alias='LATEST(weight)',
            )
        ],
        filters=[Filter(field='LATEST(weight)', operator='>=', value=5, scope='group')],
        orderBy=[],
    )
    sql = _translate(qs, desc, dialect_name)
    expected = _sql(dialect_name, 'arg_max', arg_term=PypikaField('ts'))
    assert f"HAVING {expected}" in sql


@pytest.mark.parametrize('dialect_name', DIALECTS)
def test_having_on_orphaned_two_argument_alias_explains_the_missing_column(
    qs: QueryService, dialect_name: str
):
    """The alias string carries no ordering column, so the filter cannot be rebuilt."""
    desc = QueryDescription(
        target_table='m',
        dimensions=[Dimension(field='day', flavour='continuous')],
        measures=[Measure(field='weight', aggregation='max', alias='MAX(weight)')],
        filters=[Filter(field='arg_max(weight)', operator='>=', value=5, scope='group')],
        orderBy=[],
    )
    with pytest.raises(QueryGenerationError, match='needs an ordering column'):
        _translate(qs, desc, dialect_name)
