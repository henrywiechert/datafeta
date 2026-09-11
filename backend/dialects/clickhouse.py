# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""ClickHouse SQL dialect implementation."""

from typing import Any, Mapping, Optional

from backend.dialects.aggregations import COUNT_STAR, AggregateSpec, FiniteGuard
from backend.dialects.base import SqlDialect


# Mapping of common type names to ClickHouse types for NULL casting
CLICKHOUSE_TYPE_MAPPING = {
    'DOUBLE': 'Float64',
    'FLOAT': 'Float64',
    'FLOAT64': 'Float64',
    'REAL': 'Float64',
    'INTEGER': 'Int64',
    'INT': 'Int64',
    'INT64': 'Int64',
    'BIGINT': 'Int64',
    'SMALLINT': 'Int32',
    'INT32': 'Int32',
    'VARCHAR': 'String',
    'STRING': 'String',
    'TEXT': 'String',
    'BOOLEAN': 'UInt8',
    'BOOL': 'UInt8',
    'NUMBER': 'Float64',
}


# How each aggregation renders in ClickHouse.  The -If combinator is what keeps
# NaN/Inf out of sums and averages: ClickHouse propagates them, so a single bad
# row would otherwise turn a whole group into NaN.
CLICKHOUSE_AGGREGATE_SPECS: Mapping[str, AggregateSpec] = {
    'sum': AggregateSpec('sumIf', finite_guard=FiniteGuard.IF_ARGUMENT),
    'avg': AggregateSpec('avgIf', finite_guard=FiniteGuard.IF_ARGUMENT),
    # quantileExactInclusive interpolates between the two middle values exactly
    # as DuckDB's quantile_cont does, so both engines return the same median.
    # Plain median()/quantile() would be approximate (reservoir sampling).
    'median': AggregateSpec(
        'quantileExactInclusiveIf(0.5)', finite_guard=FiniteGuard.IF_ARGUMENT
    ),
    'count': AggregateSpec('COUNT'),
    # count() over rows takes no argument at all in ClickHouse.
    COUNT_STAR: AggregateSpec('count', star=True, star_arg=False),
    # Deliberately exact: uniq() is faster but approximate, and a distinct count
    # that drifts between engines is worse than a slow one.
    'count_distinct': AggregateSpec('COUNT', distinct=True),
    'min': AggregateSpec('MIN'),
    'max': AggregateSpec('MAX'),
    'arg_max': AggregateSpec('argMax', order_arg=True),
    'arg_min': AggregateSpec('argMin', order_arg=True),
}


def _extract_base_type(ch_type: str) -> str:
    """
    Strip Nullable(...) and LowCardinality(...) wrappers from a ClickHouse type.
    
    Examples:
        'Float64' → 'Float64'
        'Nullable(Float64)' → 'Float64'
        'LowCardinality(String)' → 'String'
    """
    result = ch_type.strip()
    changed = True
    while changed:
        changed = False
        for prefix in ('Nullable(', 'LowCardinality('):
            if result.startswith(prefix) and result.endswith(')'):
                result = result[len(prefix):-1].strip()
                changed = True
    return result


class ClickHouseDialect(SqlDialect):
    """SQL dialect for ClickHouse database."""

    @property
    def name(self) -> str:
        return 'clickhouse'

    @property
    def quote_char(self) -> str:
        return '`'

    @property
    def supports_schema_prefix(self) -> bool:
        return True

    @property
    def requires_database(self) -> bool:
        return True

    def random_func_name(self) -> str:
        return 'rand'

    def to_string_expr(self, expr: str) -> str:
        return f"toString({expr})"

    def first_value_agg_name(self) -> str:
        return 'any'

    def aggregate_specs(self) -> Mapping[str, AggregateSpec]:
        return CLICKHOUSE_AGGREGATE_SPECS

    def lag_expression(self, field_sql: str, over_content_sql: str) -> str:
        # ClickHouse has no standard lag(); lagInFrame() respects the window
        # frame, so the frame must span the whole partition.  toNullable() +
        # explicit NULL default ensure the first row yields NULL instead of 0.
        return (
            f"lagInFrame(toNullable({field_sql}), 1, NULL) OVER "
            f"({over_content_sql} ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)"
        )

    def to_epoch_expr(self, field: str) -> str:
        return f"toUnixTimestamp({field})"

    def cast_null_expr(
        self,
        alias: str,
        type_hint: Optional[str] = None,
        is_measure: bool = False,
        column_type: Optional[str] = None,
    ) -> str:
        q = self.quote_char
        
        if type_hint:
            ch_type = CLICKHOUSE_TYPE_MAPPING.get(type_hint.upper(), type_hint)
            return f"CAST(NULL AS Nullable({ch_type})) AS {q}{alias}{q}"
        elif is_measure:
            return f"CAST(NULL AS Nullable(Float64)) AS {q}{alias}{q}"
        elif column_type:
            base_type = _extract_base_type(column_type)
            return f"CAST(NULL AS Nullable({base_type})) AS {q}{alias}{q}"
        else:
            return f"CAST(NULL AS Nullable(String)) AS {q}{alias}{q}"

    def wrap_datetime_comparison(self, value: Any, is_datetime_string: bool) -> Any:
        if is_datetime_string and isinstance(value, str):
            return f"parseDateTime64BestEffort('{value}', 3)"
        return value
