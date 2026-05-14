# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Builder for server-side box-plot summary queries.

Produces one summary row per group with five-number summary statistics:
count, min, q1, median, q3, max.
"""

from __future__ import annotations

from typing import List, Optional, Sequence, Tuple

from backend.models.query import QueryDescription


GroupFieldSql = Tuple[str, str]
ValueFieldSql = Tuple[str, str]

BOX_PLOT_COLOR_MIN_COLUMN = "__box_plot_color_min"
BOX_PLOT_COLOR_MAX_COLUMN = "__box_plot_color_max"
BOX_PLOT_COLOR_DISTINCT_COUNT_COLUMN = "__box_plot_color_distinct_count"


def _quote(identifier: str, quote_char: str) -> str:
    return f"{quote_char}{identifier}{quote_char}"


def _summary_alias(value_alias: str, stat: str) -> str:
    return f"{value_alias}__{stat}"


def _dedupe_value_fields(value_fields: Sequence[ValueFieldSql]) -> List[ValueFieldSql]:
    seen: set[str] = set()
    deduped: list[ValueFieldSql] = []
    for expr_sql, alias in value_fields:
        if alias in seen:
            continue
        deduped.append((expr_sql, alias))
        seen.add(alias)
    return deduped


def _build_duckdb_sql(
    query_desc: QueryDescription,
    quote_char: str,
    group_fields: Sequence[GroupFieldSql],
    value_fields: Sequence[ValueFieldSql],
    *,
    filter_sql_fragment: str,
    from_clause: str,
    color_field_sql: Optional[str],
) -> str:
    select_parts: list[str] = []
    for expr_sql, alias in group_fields:
        select_parts.append(f"{expr_sql} AS {_quote(alias, quote_char)}")

    for expr_sql, alias in value_fields:
        select_parts.extend([
            f"COUNT({expr_sql}) AS {_quote(_summary_alias(alias, 'count'), quote_char)}",
            f"MIN({expr_sql}) AS {_quote(_summary_alias(alias, 'min'), quote_char)}",
            f"quantile_cont({expr_sql}, 0.25) AS {_quote(_summary_alias(alias, 'q1'), quote_char)}",
            f"quantile_cont({expr_sql}, 0.5) AS {_quote(_summary_alias(alias, 'median'), quote_char)}",
            f"quantile_cont({expr_sql}, 0.75) AS {_quote(_summary_alias(alias, 'q3'), quote_char)}",
            f"MAX({expr_sql}) AS {_quote(_summary_alias(alias, 'max'), quote_char)}",
        ])

    if color_field_sql:
        select_parts.extend([
            f"MIN({color_field_sql}) AS {_quote(BOX_PLOT_COLOR_MIN_COLUMN, quote_char)}",
            f"MAX({color_field_sql}) AS {_quote(BOX_PLOT_COLOR_MAX_COLUMN, quote_char)}",
            f"COUNT(DISTINCT {color_field_sql}) AS {_quote(BOX_PLOT_COLOR_DISTINCT_COUNT_COLUMN, quote_char)}",
        ])

    sql = f"SELECT {', '.join(select_parts)} {from_clause}"
    if filter_sql_fragment:
        sql = f"{sql} {filter_sql_fragment}"
    if group_fields:
        sql = f"{sql} GROUP BY {', '.join(expr_sql for expr_sql, _alias in group_fields)}"
        sql = f"{sql} ORDER BY {', '.join(_quote(alias, quote_char) for _expr, alias in group_fields)}"
    return sql


def _build_clickhouse_sql(
    query_desc: QueryDescription,
    quote_char: str,
    group_fields: Sequence[GroupFieldSql],
    value_fields: Sequence[ValueFieldSql],
    *,
    filter_sql_fragment: str,
    from_clause: str,
    color_field_sql: Optional[str],
) -> str:
    select_parts: list[str] = []
    for expr_sql, alias in group_fields:
        select_parts.append(f"{expr_sql} AS {_quote(alias, quote_char)}")

    for expr_sql, alias in value_fields:
        select_parts.extend([
            f"count({expr_sql}) AS {_quote(_summary_alias(alias, 'count'), quote_char)}",
            f"min({expr_sql}) AS {_quote(_summary_alias(alias, 'min'), quote_char)}",
            f"quantileExactInclusive(0.25)({expr_sql}) AS {_quote(_summary_alias(alias, 'q1'), quote_char)}",
            f"quantileExactInclusive(0.5)({expr_sql}) AS {_quote(_summary_alias(alias, 'median'), quote_char)}",
            f"quantileExactInclusive(0.75)({expr_sql}) AS {_quote(_summary_alias(alias, 'q3'), quote_char)}",
            f"max({expr_sql}) AS {_quote(_summary_alias(alias, 'max'), quote_char)}",
        ])

    if color_field_sql:
        select_parts.extend([
            f"min({color_field_sql}) AS {_quote(BOX_PLOT_COLOR_MIN_COLUMN, quote_char)}",
            f"max({color_field_sql}) AS {_quote(BOX_PLOT_COLOR_MAX_COLUMN, quote_char)}",
            f"uniqExact({color_field_sql}) AS {_quote(BOX_PLOT_COLOR_DISTINCT_COUNT_COLUMN, quote_char)}",
        ])

    sql = f"SELECT {', '.join(select_parts)} {from_clause}"
    if filter_sql_fragment:
        sql = f"{sql} {filter_sql_fragment}"
    if group_fields:
        sql = f"{sql} GROUP BY {', '.join(expr_sql for expr_sql, _alias in group_fields)}"
        sql = f"{sql} ORDER BY {', '.join(_quote(alias, quote_char) for _expr, alias in group_fields)}"
    return sql


def build_box_plot_sql(
    query_desc: QueryDescription,
    db_type: str,
    quote_char: str,
    group_fields: Sequence[GroupFieldSql],
    value_fields: Sequence[ValueFieldSql],
    *,
    filter_sql_fragment: str = "",
    from_clause: Optional[str] = None,
    color_field_sql: Optional[str] = None,
) -> str:
    """Build SQL for grouped box-plot summary statistics."""
    if not query_desc.box_plot_fields:
        raise ValueError("box_plot query requires at least one box_plot_field")

    deduped_values = _dedupe_value_fields(value_fields)
    if not deduped_values:
        raise ValueError("box_plot query requires at least one value field")

    table_ref = from_clause or f"FROM {_quote(query_desc.target_table, quote_char)}"

    if db_type == "duckdb":
        return _build_duckdb_sql(
            query_desc,
            quote_char,
            group_fields,
            deduped_values,
            filter_sql_fragment=filter_sql_fragment,
            from_clause=table_ref,
            color_field_sql=color_field_sql,
        )

    if db_type == "clickhouse":
        return _build_clickhouse_sql(
            query_desc,
            quote_char,
            group_fields,
            deduped_values,
            filter_sql_fragment=filter_sql_fragment,
            from_clause=table_ref,
            color_field_sql=color_field_sql,
        )

    raise ValueError(f"Unsupported database type for box_plot query: {db_type}")
