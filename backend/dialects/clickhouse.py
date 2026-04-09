"""ClickHouse SQL dialect implementation."""

from typing import Any, Optional

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

    def count_star_expr(self) -> str:
        return 'count()'

    def count_distinct_expr(self, field: str) -> str:
        return f"uniq({field})"

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

    def needs_nan_safe_aggregation(self) -> bool:
        return True

    def nan_safe_sum_expr(self, field: str) -> str:
        return f"sumIf({field}, isFinite({field}))"

    def nan_safe_avg_expr(self, field: str) -> str:
        return f"avgIf({field}, isFinite({field}))"

    def wrap_datetime_comparison(self, value: Any, is_datetime_string: bool) -> Any:
        if is_datetime_string and isinstance(value, str):
            return f"parseDateTime64BestEffort('{value}', 3)"
        return value
