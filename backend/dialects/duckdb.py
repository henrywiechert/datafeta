# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""DuckDB SQL dialect implementation."""

from typing import Mapping, Optional

from backend.dialects.aggregations import COUNT_STAR, AggregateSpec, FiniteGuard
from backend.dialects.base import SqlDialect


# How each aggregation renders in DuckDB.  DuckDB has no -If combinator, so the
# finite guard is the standard FILTER clause.  It is needed: contrary to a
# long-standing comment here, DuckDB does propagate NaN through SUM and AVG --
# one bad row turns the whole group into NaN.  COALESCE additionally keeps an
# empty group reading as 0 rather than a hole in the chart.
DUCKDB_AGGREGATE_SPECS: Mapping[str, AggregateSpec] = {
    'sum': AggregateSpec(
        'SUM', coalesce_zero=True, finite_guard=FiniteGuard.FILTER_CLAUSE
    ),
    'avg': AggregateSpec(
        'AVG', coalesce_zero=True, finite_guard=FiniteGuard.FILTER_CLAUSE
    ),
    'count': AggregateSpec('COUNT'),
    COUNT_STAR: AggregateSpec('COUNT', star=True),
    'count_distinct': AggregateSpec('COUNT', distinct=True),
    'min': AggregateSpec('MIN'),
    'max': AggregateSpec('MAX'),
    # quantile_cont matches ClickHouse's quantileExactInclusive and the box
    # plot's median line.  Unlike SUM/AVG it is guarded: a NaN sorts highest and
    # would silently shift the median rather than making it obviously wrong.
    'median': AggregateSpec(
        'quantile_cont', literal_args=(0.5,), finite_guard=FiniteGuard.FILTER_CLAUSE
    ),
    'arg_max': AggregateSpec('arg_max', order_arg=True),
    'arg_min': AggregateSpec('arg_min', order_arg=True),
}


class DuckDbDialect(SqlDialect):
    """
    SQL dialect for DuckDB database.
    
    Used by FileConnector (CSV), KaggleConnector, and HiveParquetConnector,
    all of which use DuckDB as their query engine.
    """

    @property
    def name(self) -> str:
        return 'duckdb'

    @property
    def quote_char(self) -> str:
        return '"'

    @property
    def supports_schema_prefix(self) -> bool:
        return False

    @property
    def requires_database(self) -> bool:
        return False

    def random_func_name(self) -> str:
        return 'random'

    def star_except_keyword(self) -> str:
        # DuckDB spells the star modifier EXCLUDE; EXCEPT is the set operator.
        return 'EXCLUDE'

    def to_string_expr(self, expr: str) -> str:
        return f"CAST({expr} AS VARCHAR)"

    def first_value_agg_name(self) -> str:
        return 'first'

    def aggregate_specs(self) -> Mapping[str, AggregateSpec]:
        return DUCKDB_AGGREGATE_SPECS

    def lag_expression(self, field_sql: str, over_content_sql: str) -> str:
        return f"lag({field_sql}) OVER ({over_content_sql})"

    def to_epoch_expr(self, field: str) -> str:
        return f"epoch({field})"

    def cast_null_expr(
        self,
        alias: str,
        type_hint: Optional[str] = None,
        is_measure: bool = False,
        column_type: Optional[str] = None,
    ) -> str:
        q = self.quote_char
        return f"NULL AS {q}{alias}{q}"
