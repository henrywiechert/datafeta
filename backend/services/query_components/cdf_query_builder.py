"""Builder for CDF (cumulative distribution function) queries.

Uses quantile breakpoint queries to produce a fixed-size output (~201 rows)
regardless of the underlying table size.  This avoids full-table window
function sorts and large result-set transfers that make the naive
``cume_dist()`` approach impractical on large datasets.

Output columns per CDF field:
  - The raw value column (quoted)
  - An alias column with the cumulative probability (e.g. "revenue__cdf")

When partition fields are specified (typically discrete columns for color
grouping and/or faceting), each group gets its own independent CDF curve
via GROUP BY (DuckDB) or a grouped sub-select + ARRAY JOIN (ClickHouse).

SQL strategy per engine:

  DuckDB   – ``quantile_cont(col, [p0, p1, …])`` aggregate + aligned ``unnest``
  ClickHouse – ``quantilesExactInclusive(p0, p1, …)(col)`` + ``ARRAY JOIN``
"""

from __future__ import annotations

import logging
from typing import List

from backend.models.query import QueryDescription

logger = logging.getLogger(__name__)

DEFAULT_NUM_BREAKPOINTS = 201  # 0.0, 0.005, 0.010, …, 0.995, 1.0


def _generate_breakpoints(n: int = DEFAULT_NUM_BREAKPOINTS) -> List[float]:
    """Return *n* evenly spaced probabilities in [0, 1]."""
    if n < 2:
        return [0.0, 1.0]
    return [round(i / (n - 1), 10) for i in range(n)]


def _format_float_list(values: List[float]) -> List[str]:
    """Format floats without trailing zeros for compact SQL."""
    parts: list[str] = []
    for v in values:
        if v == int(v):
            parts.append(f"{int(v)}.0")
        else:
            parts.append(f"{v:g}")
    return parts


# ── DuckDB ──────────────────────────────────────────────────────────────────

def _build_duckdb_sql(
    query_desc: QueryDescription,
    quote_char: str,
    breakpoints: List[float],
    *,
    filter_sql_fragment: str,
    from_clause: str,
) -> str:
    q = quote_char
    bp_strs = _format_float_list(breakpoints)
    bp_array = f"[{', '.join(bp_strs)}]"

    table_ref = from_clause or f"FROM {q}{query_desc.target_table}{q}"
    pfs = query_desc.cdf_partition_fields or []

    select_parts: list[str] = []
    for pf in pfs:
        select_parts.append(f"{q}{pf}{q}")

    for cdf in query_desc.cdf_fields:
        select_parts.append(
            f"unnest(quantile_cont({q}{cdf.field}{q}, {bp_array})) AS {q}{cdf.field}{q}"
        )
        select_parts.append(
            f"unnest({bp_array}) AS {q}{cdf.alias}{q}"
        )

    select_clause = ", ".join(select_parts)

    sql = f"SELECT {select_clause} {table_ref}"
    if filter_sql_fragment:
        sql = f"{sql} {filter_sql_fragment}"
    if pfs:
        group_cols = ", ".join(f"{q}{pf}{q}" for pf in pfs)
        sql = f"{sql} GROUP BY {group_cols}"

    order_parts: list[str] = []
    for pf in pfs:
        order_parts.append(f"{q}{pf}{q}")
    for cdf in query_desc.cdf_fields:
        order_parts.append(f"{q}{cdf.field}{q}")
    sql = f"{sql} ORDER BY {', '.join(order_parts)}"

    return sql


# ── ClickHouse ──────────────────────────────────────────────────────────────

def _build_clickhouse_sql(
    query_desc: QueryDescription,
    quote_char: str,
    breakpoints: List[float],
    *,
    filter_sql_fragment: str,
    from_clause: str,
) -> str:
    q = quote_char
    bp_strs = _format_float_list(breakpoints)
    bp_args = ", ".join(bp_strs)
    bp_array = f"[{bp_args}]"

    table_ref = from_clause or f"FROM {q}{query_desc.target_table}{q}"
    pfs = query_desc.cdf_partition_fields or []

    # Inner sub-select: compute quantile arrays per group
    inner_select_parts: list[str] = []
    for pf in pfs:
        inner_select_parts.append(f"{q}{pf}{q}")

    array_join_parts: list[str] = []
    outer_select_parts: list[str] = []
    for pf in pfs:
        outer_select_parts.append(f"{q}{pf}{q}")

    for idx, cdf in enumerate(query_desc.cdf_fields):
        vals_alias = f"_vals{idx}"
        cdfs_alias = f"_cdfs{idx}"
        val_alias = f"_v{idx}"
        cdf_prob_alias = f"_c{idx}"

        inner_select_parts.append(
            f"quantilesExactInclusive({bp_args})({q}{cdf.field}{q}) AS {vals_alias}"
        )
        inner_select_parts.append(f"{bp_array} AS {cdfs_alias}")

        array_join_parts.append(f"{vals_alias} AS {val_alias}")
        array_join_parts.append(f"{cdfs_alias} AS {cdf_prob_alias}")

        outer_select_parts.append(f"{val_alias} AS {q}{cdf.field}{q}")
        outer_select_parts.append(f"{cdf_prob_alias} AS {q}{cdf.alias}{q}")

    inner_select = ", ".join(inner_select_parts)
    inner_sql = f"SELECT {inner_select} {table_ref}"
    if filter_sql_fragment:
        inner_sql = f"{inner_sql} {filter_sql_fragment}"
    if pfs:
        group_cols = ", ".join(f"{q}{pf}{q}" for pf in pfs)
        inner_sql = f"{inner_sql} GROUP BY {group_cols}"

    outer_select = ", ".join(outer_select_parts)
    array_join = ", ".join(array_join_parts)

    order_parts: list[str] = []
    for pf in pfs:
        order_parts.append(f"{q}{pf}{q}")
    for cdf in query_desc.cdf_fields:
        order_parts.append(f"{q}{cdf.field}{q}")
    order_clause = ", ".join(order_parts)

    sql = (
        f"SELECT {outer_select} "
        f"FROM ({inner_sql}) "
        f"ARRAY JOIN {array_join} "
        f"ORDER BY {order_clause}"
    )

    return sql


# ── Public API ──────────────────────────────────────────────────────────────

def build_cdf_sql(
    query_desc: QueryDescription,
    db_type: str,
    quote_char: str,
    *,
    filter_sql_fragment: str = "",
    from_clause: str = "",
    num_breakpoints: int = DEFAULT_NUM_BREAKPOINTS,
) -> str:
    """Build a CDF query using quantile breakpoints.

    Parameters
    ----------
    query_desc:
        Must have ``query_mode='cdf'`` and at least one entry in ``cdf_fields``.
    db_type:
        ``'clickhouse'`` or ``'duckdb'``.
    quote_char:
        Quote character for identifiers (backtick for CH, double-quote for DuckDB).
    filter_sql_fragment:
        An optional ``WHERE …`` clause (including the ``WHERE`` keyword).
    from_clause:
        The ``FROM …`` clause (including the ``FROM`` keyword and any JOINs).
        If empty, ``FROM <target_table>`` is used.
    num_breakpoints:
        Number of evenly-spaced probability breakpoints (default 201).
    """
    if not query_desc.cdf_fields:
        raise ValueError("CDF query requires at least one cdf_field")

    # Deduplicate by field name — the same column appearing twice would
    # produce duplicate output aliases that both engines reject.
    seen: set[str] = set()
    unique_fields = []
    for cf in query_desc.cdf_fields:
        if cf.field not in seen:
            seen.add(cf.field)
            unique_fields.append(cf)
    query_desc = query_desc.model_copy(update={"cdf_fields": unique_fields})

    breakpoints = _generate_breakpoints(num_breakpoints)

    if db_type == "clickhouse":
        sql = _build_clickhouse_sql(
            query_desc, quote_char, breakpoints,
            filter_sql_fragment=filter_sql_fragment,
            from_clause=from_clause,
        )
    else:
        sql = _build_duckdb_sql(
            query_desc, quote_char, breakpoints,
            filter_sql_fragment=filter_sql_fragment,
            from_clause=from_clause,
        )

    logger.info("Generated CDF SQL (%s, %d breakpoints): %s", db_type, len(breakpoints), sql)
    return sql
