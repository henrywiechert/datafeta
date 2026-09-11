# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Turn a dialect's AggregateSpec into a PyPika aggregate term.

The single place that knows how to build an aggregate expression.  Both the
SELECT clause (``SelectClauseBuilder``) and the HAVING clause
(``FilterBuilder.build_having``) go through here, so a measure filter and the
measure it filters on always render the same aggregate -- including the NaN
guards and COALESCE wrappers that used to live only in the SELECT path.

What the SQL looks like is the dialect's business (see
``backend.dialects.aggregations``); this module only assembles terms.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Optional

from pypika.functions import Coalesce, DistinctOptionFunction
from pypika.terms import AggregateFunction, Star, Term

from backend.exceptions import QueryGenerationError
from backend.services.query_components.terms import CustomFunction

if TYPE_CHECKING:
    from backend.dialects import SqlDialect


def build_aggregate_term(
    dialect: "SqlDialect",
    aggregation: str,
    field_term: Optional[Any] = None,
    *,
    arg_term: Optional[Any] = None,
    field_name: str = "",
) -> Term:
    """Build the aggregate expression for `aggregation` in `dialect`.

    Args:
        dialect: Dialect whose spec table decides the SQL.
        aggregation: A ``Measure.aggregation`` value, or ``COUNT_STAR`` for the
            ``COUNT(*)`` form.
        field_term: Already-resolved (and cast-applied) value column.  Unused
            for star aggregations.
        arg_term: Already-resolved ordering column, for two-argument
            aggregations such as arg_max/arg_min.
        field_name: Raw field name, used only to make error messages readable.

    Raises:
        QueryGenerationError: if the dialect does not support `aggregation`, or
            a two-argument aggregation was requested without its ordering column.
    """
    spec = dialect.aggregate_spec(aggregation)
    if spec is None:
        raise QueryGenerationError(f"Unsupported aggregation function: {aggregation}")

    if spec.star:
        args = (Star(),) if spec.star_arg else ()
        term: Term = AggregateFunction(spec.function, *args)
    elif spec.order_arg:
        if arg_term is None:
            raise QueryGenerationError(
                f"Aggregation '{aggregation}' on field '{field_name}' requires "
                f"'aggregation_arg' (the ordering column, e.g. a timestamp)."
            )
        term = AggregateFunction(spec.function, field_term, arg_term)
    else:
        args = [field_term]
        if spec.finite_guard:
            args.append(CustomFunction("isFinite", [field_term]))
        args.extend(spec.literal_args)
        if spec.distinct:
            term = DistinctOptionFunction(spec.function, *args).distinct()
        else:
            term = AggregateFunction(spec.function, *args)

    if spec.coalesce_zero:
        term = Coalesce(term, 0)

    return term


def requires_order_arg(dialect: "SqlDialect", aggregation: str) -> bool:
    """Whether `aggregation` is a two-argument form needing ``aggregation_arg``."""
    spec = dialect.aggregate_spec(aggregation)
    return bool(spec and spec.order_arg)
