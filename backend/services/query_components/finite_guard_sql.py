# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Restricting raw-SQL aggregates to finite values.

The distribution builders (box plot, CDF) assemble SQL strings rather than
PyPika terms, so they cannot go through ``AggregateSpec``/``build_aggregate_term``
like measures do.  These helpers express the same guard for them, so every
median in the product -- the measure, the box plot's centre line, and the CDF's
0.5 breakpoint -- is computed over the same set of values.

Why it matters more for quantiles than for sums: NaN does not make a quantile
obviously wrong, it sorts highest and shifts the answer (the median of
[1, 2, 3, NaN] reads 2.5 instead of 2.0).

Only value columns are guarded.  A box plot's colour channel may be categorical,
and ``isFinite`` on a string is an error, so colour aggregates are left alone.
"""

from __future__ import annotations

from backend.dialects.aggregations import FINITE_PREDICATE


def finite_predicate_sql(expr_sql: str) -> str:
    """``isFinite(expr)`` -- true only for a real, finite number.

    Used directly as ClickHouse's ``-If`` combinator argument:
    ``minIf(x, isFinite(x))``.
    """
    return f"{FINITE_PREDICATE}({expr_sql})"


def filter_finite_sql(expr_sql: str) -> str:
    """Trailing ``FILTER`` clause restricting an aggregate to finite values.

    Standard SQL, used by DuckDB, which has no combinator syntax.  Returned with
    a leading space so it appends directly onto an aggregate call.
    """
    return f" FILTER (WHERE {finite_predicate_sql(expr_sql)})"
