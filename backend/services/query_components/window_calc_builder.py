# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Post-aggregation window calculation wrapper (table calculations).

Measures can carry a :class:`~backend.models.query.WindowCalc` describing a
calculation (per-bucket difference, percent difference, running sum) computed
over the *aggregated* result.  Window functions run after GROUP BY, so this
module wraps the fully compiled aggregated SQL in an outer SELECT:

    SELECT
        "ts_day_timeline",
        "category",
        "DIFF(SUM(weight))" - lag("DIFF(SUM(weight))") OVER (
            PARTITION BY "category" ORDER BY "ts_day_timeline"
        ) AS "DIFF(SUM(weight))"
    FROM ( <aggregated query> ) AS windowed_base
    ORDER BY ...

The inner query aliases every projected column (binned datetimes back to the
dimension output name, measures to their final alias), so the outer layer only
references plain aliases and never has to re-derive expressions.

Invariants / guards:
- ``order_by_field`` and ``partition_by`` entries must match dimension output
  names of the query; a missing order-by field silently skips the calculation
  (the raw aggregate passes through under the measure alias), matching the
  frontend behaviour of ignoring stale calcs after shelf changes.
- Applied exactly once at the top level of ``translate_to_sql`` (union
  sub-queries are translated with window calcs stripped).
- First row of each partition yields NULL for 'difference' and
  'percent_difference' (and the latter also when the previous value is 0).
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, List, Optional

if TYPE_CHECKING:
    from backend.dialects import SqlDialect
    from backend.models.query import Dimension, Measure, QueryDescription

_module_logger = logging.getLogger(__name__)


def has_window_calcs(query_desc: "QueryDescription") -> bool:
    """Whether any measure carries a window calculation."""
    return any(m.window_calc for m in (query_desc.measures or []))


def strip_window_calcs(query_desc: "QueryDescription") -> None:
    """Remove window calcs from a (copied) query description in place.

    Used by the union builder so per-table sub-queries are translated without
    wrapping; the calculation is applied once over the merged union result.
    """
    for measure in query_desc.measures or []:
        measure.window_calc = None


def _dimension_output_name(dim: "Dimension") -> str:
    if dim.date_part and dim.date_mode:
        return f"{dim.field}_{dim.date_part}_{dim.date_mode}"
    return dim.field


def _windowed_measure_expr(
    measure: "Measure",
    dim_output_names: List[str],
    dialect: "SqlDialect",
    logger: logging.Logger,
) -> Optional[str]:
    """Return the outer SELECT expression for a windowed measure, or None to skip."""
    calc = measure.window_calc
    assert calc is not None
    q = dialect.quote_char

    if calc.order_by_field not in dim_output_names:
        logger.warning(
            "Window calc '%s' on measure '%s' skipped: order_by_field '%s' is not "
            "a dimension output of this query (%s)",
            calc.function, measure.alias, calc.order_by_field, dim_output_names,
        )
        return None

    partition_fields = [p for p in calc.partition_by if p in dim_output_names]
    dropped = set(calc.partition_by) - set(partition_fields)
    if dropped:
        logger.warning(
            "Window calc on measure '%s': dropping unknown partition field(s) %s",
            measure.alias, sorted(dropped),
        )

    over_parts: List[str] = []
    if partition_fields:
        over_parts.append("PARTITION BY " + ", ".join(f"{q}{p}{q}" for p in partition_fields))
    over_parts.append(f"ORDER BY {q}{calc.order_by_field}{q}")
    over_content = " ".join(over_parts)

    quoted_alias = f"{q}{measure.alias}{q}"

    if calc.function == "difference":
        lag_sql = dialect.lag_expression(quoted_alias, over_content)
        return f"{quoted_alias} - {lag_sql} AS {quoted_alias}"

    if calc.function == "percent_difference":
        # Fractional change vs. previous bucket (0.05 = +5%). NULL on the first
        # row of each partition (lag is NULL) and when the previous value is 0
        # (nullif guards division by zero on both dialects).
        lag_sql = dialect.lag_expression(quoted_alias, over_content)
        return (
            f"({quoted_alias} - {lag_sql}) / nullif({lag_sql}, 0) AS {quoted_alias}"
        )

    if calc.function == "running_sum":
        # Identical syntax on ClickHouse and DuckDB.
        return (
            f"sum({quoted_alias}) OVER ({over_content} "
            f"ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS {quoted_alias}"
        )

    logger.warning("Unknown window calc function '%s' on measure '%s'; skipped",
                   calc.function, measure.alias)
    return None


def apply_window_calcs(
    sql: str,
    query_desc: "QueryDescription",
    *,
    dialect: "SqlDialect",
    logger: logging.Logger | None = None,
) -> str:
    """Wrap *sql* in an outer window-function SELECT if any measure requires it.

    Returns *sql* unchanged when no measure carries a window calc, when the
    query is not a standard aggregation query, or when no calc is applicable.
    """
    logger = logger or _module_logger

    if not has_window_calcs(query_desc):
        return sql
    if query_desc.query_mode not in (None, "standard"):
        return sql
    if query_desc.fetch_filter_values:
        return sql

    q = dialect.quote_char
    dims = query_desc.dimensions or []
    dim_output_names = [_dimension_output_name(d) for d in dims]

    select_parts: List[str] = []
    wrapped_any = False

    for name in dim_output_names:
        select_parts.append(f"{q}{name}{q}")

    for measure in query_desc.measures or []:
        if measure.window_calc:
            expr = _windowed_measure_expr(measure, dim_output_names, dialect, logger)
            if expr is not None:
                select_parts.append(expr)
                wrapped_any = True
                continue
        select_parts.append(f"{q}{measure.alias}{q}")

    # Label fields projected by the inner query (mirrors SelectClauseBuilder).
    dim_fields = {d.field for d in dims}
    measure_fields = {m.field for m in query_desc.measures or []}
    for lbl in query_desc.label_fields or []:
        if lbl in dim_fields or lbl in measure_fields:
            continue
        select_parts.append(f"{q}{lbl}{q}")

    if not wrapped_any:
        return sql

    base_sql = sql.strip().rstrip(";")
    outer_sql = (
        f"SELECT {', '.join(select_parts)}\n"
        f"FROM (\n{base_sql}\n) AS windowed_base"
    )

    # Re-emit ORDER BY on the outer layer: the window computation does not
    # guarantee the inner result order survives.
    if query_desc.orderBy:
        order_fragments = []
        for order in query_desc.orderBy:
            direction = "DESC" if order.direction == "desc" else "ASC"
            order_fragments.append(f"{q}{order.field}{q} {direction}")
        outer_sql += f"\nORDER BY {', '.join(order_fragments)}"

    logger.info("Applied window calc wrapper (%d windowed measure(s))",
                sum(1 for m in query_desc.measures if m.window_calc))
    return outer_sql
