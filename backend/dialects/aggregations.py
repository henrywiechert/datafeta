# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Declarative description of how each aggregation renders per SQL dialect.

``Measure.aggregation`` names are engine-neutral; the SQL behind them is not.
``MIN``/``MAX`` are portable, but NaN handling, ``COUNT(*)`` and the arg-max
family already differ between ClickHouse and DuckDB, and quantile-based
aggregations differ in call shape as well.  Each dialect therefore publishes a
table of ``AggregateSpec`` (``SqlDialect.aggregate_specs``), and one builder --
``backend.services.query_components.aggregation_builder`` -- turns a spec into a
PyPika term for both the SELECT and the HAVING clause.

Adding an aggregation means adding one row per dialect; the SELECT/HAVING
builders do not change.  An aggregation absent from a dialect's table is
unsupported on that engine and is rejected during query generation.

Specs are pure data -- no PyPika here -- so the dialect layer stays free of the
query-construction machinery that depends on it.
"""

from dataclasses import dataclass
from enum import Enum
from typing import Any, Mapping, Optional, Tuple


class FiniteGuard(str, Enum):
    """How an aggregate is restricted to finite values.

    NaN/Inf reach aggregates from dirty CSV imports and from genuine division
    results.  They do not merely produce a NaN answer: in an order-based
    aggregate such as a quantile they sort highest and quietly bias the result
    (median of [1, 2, 3, NaN] reads 2.5 instead of 2.0).

    The two engines spell the restriction differently.
    """

    #: No restriction.
    NONE = 'none'
    #: ClickHouse ``-If`` combinator: ``sumIf(x, isFinite(x))``.  The predicate
    #: becomes a trailing argument of a function whose name carries the suffix.
    IF_ARGUMENT = 'if_argument'
    #: Standard SQL: ``f(x) FILTER (WHERE isFinite(x))``.  Used by DuckDB, which
    #: has no combinator syntax.
    FILTER_CLAUSE = 'filter_clause'


#: Finite-value predicate.  Spelled ``isFinite`` in ClickHouse; DuckDB spells it
#: ``isfinite`` but matches function names case-insensitively, so one name works
#: for both.
FINITE_PREDICATE = 'isFinite'


#: Spec key for the ``COUNT(*)`` form.  Not a ``Measure.aggregation`` value: it
#: is selected when a ``count`` measure's field is ``"*"``, which is a property
#: of the call, not of the aggregation the user picked.
COUNT_STAR = "count_star"


@dataclass(frozen=True)
class AggregateSpec:
    """How one aggregation is rendered by one dialect.

    Attributes:
        function: SQL function name.  May carry parameters for engines using a
            parametric call shape: ``'quantileExactInclusive(0.5)'`` renders as
            ``quantileExactInclusive(0.5)(value)``.
        distinct: Render the argument as ``DISTINCT value``.
        literal_args: Constants appended after the value argument, e.g.
            ``(0.5,)`` for ``quantile_cont(value, 0.5)``.
        finite_guard: How NaN/Inf are excluded, if at all.  See ``FiniteGuard``.
        coalesce_zero: Wrap the result in ``COALESCE(..., 0)`` so an empty group
            yields 0 rather than NULL.
        order_arg: Two-argument form ``f(value, ordering_column)``; requires
            ``Measure.aggregation_arg``.
        star: Aggregate over rows rather than over a column; the value argument
            is dropped.
        star_arg: Only read when ``star`` is set.  True renders ``COUNT(*)``,
            False the no-argument form ``count()``.
    """

    function: str
    distinct: bool = False
    literal_args: Tuple[Any, ...] = ()
    finite_guard: FiniteGuard = FiniteGuard.NONE
    coalesce_zero: bool = False
    order_arg: bool = False
    star: bool = False
    star_arg: bool = True


#: Outer aggregate that merges per-branch results of a UNION over stacked tables.
#:
#: Each branch is aggregated separately, so the wrapper sees per-branch values
#: rather than rows.  ``None`` means the true value cannot be recovered from
#: them, and the query is rejected instead of returning a plausible wrong
#: number: a median of per-branch medians is not the median, and arg_max would
#: need the ordering column, which the branches do not project.
#:
#: Independent of dialect -- these are the merge semantics, not SQL syntax.
UNION_REAGGREGATION: Mapping[str, Optional[str]] = {
    'sum': 'SUM',
    # Per-branch counts add up.
    'count': 'SUM',
    # Not exact -- a value present in two branches is counted twice -- but
    # summing has been the behaviour since stacked tables were introduced.
    'count_distinct': 'SUM',
    'min': 'MIN',
    'max': 'MAX',
    # Unweighted: branches of different sizes count equally.
    'avg': 'AVG',
    'arg_max': None,
    'arg_min': None,
    'median': None,
}


def union_reaggregation(aggregation: str) -> Optional[str]:
    """Outer aggregate for `aggregation` across UNION branches, or None.

    An unlisted aggregation is treated as unmergeable, so a newly added one is
    rejected on stacked tables until its semantics are considered.
    """
    return UNION_REAGGREGATION.get(aggregation)
