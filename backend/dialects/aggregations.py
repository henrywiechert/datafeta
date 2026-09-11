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
from typing import Any, Tuple


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
        finite_guard: Append ``isFinite(value)`` as a trailing argument.  Pairs
            with ClickHouse's ``-If`` combinator (``sumIf(v, isFinite(v))``),
            which is how that engine keeps NaN/Inf out of an aggregate.
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
    finite_guard: bool = False
    coalesce_zero: bool = False
    order_arg: bool = False
    star: bool = False
    star_arg: bool = True
