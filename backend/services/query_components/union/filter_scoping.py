# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Scoping a query's filters to one branch of a UNION.

Stacked (union) tables are independent datasets merged by column name: a column
only one table carries is NULL-filled for the others.  A filter on such a column
cannot be evaluated in every branch, and the two possible readings differ sharply:

* Strict SQL — the NULL-filled column fails the predicate, so the table drops out
  of the result entirely.  One filter on a column unique to a single table then
  wipes out every other table's rows, which makes filtering useless as soon as the
  stacked tables have different schemas.
* Per-table scope — the filter constrains only the tables that actually carry the
  column; the others keep their rows.

We use per-table scope, with one exception: a filter that explicitly excludes NULLs
("is not null", or a "not in" list containing NULL) is a statement about the column
having a value at all, which no row of a table lacking the column can satisfy.  Such
a table is skipped, as it was before per-table scoping existed.

Group-scoped (HAVING) filters carry a measure alias rather than a column name, so
they are matched against this branch's measures — and, when the measure is no longer
in the view, against the column inside the alias.
"""

from __future__ import annotations

import re
from typing import Any, Callable, Dict, List, NamedTuple, Optional, Set

# "SUM(revenue)" → aggregation + column, mirroring FilterBuilder.build_having()
_MEASURE_ALIAS_RE = re.compile(r'(\w+)\((.+)\)')


class ScopedFilters(NamedTuple):
    """Result of scoping a filter list to one UNION branch.

    Attributes:
        kept: Filters this branch can evaluate.
        ignored_fields: Fields whose filter was dropped for this branch only.
        blocking_fields: Fields whose filter no row of this branch can satisfy;
            non-empty means the branch contributes nothing and can be skipped.
    """

    kept: List[Any]
    ignored_fields: List[str]
    blocking_fields: List[str]


def filter_excludes_nulls(filt: Any) -> bool:
    """True when `filt` can only be satisfied by a non-NULL value.

    Mirrors `FilterBuilder._handle_membership_filter`: a `not in` list containing
    NULL becomes `... AND field IS NOT NULL`.  A plain value selection (`in`, `=`,
    ranges, `like`) says nothing about NULL — it just doesn't match it — so it is
    treated as scoped to the tables that carry the column, not as an exclusion.
    """
    if filt.operator == 'is not null':
        return True
    if filt.operator == 'not in' and isinstance(filt.value, list):
        return any(value is None for value in filt.value)
    return False


def scope_filters_to_union_branch(
    filters: Optional[List[Any]],
    table_columns: Dict[str, str],
    measure_aliases: Set[str],
    is_computable_virtual_column: Callable[[str], bool],
) -> ScopedFilters:
    """Restrict `filters` to what one UNION branch can evaluate.

    Args:
        filters: Filters of the overall query (source-tracking filters already removed).
        table_columns: Columns of this branch's table (name → type).  Empty means
            "schema unknown"; every filter is then kept.
        measure_aliases: Aliases of the measures this branch computes, for HAVING filters.
        is_computable_virtual_column: True when a name is a virtual column whose source
            fields all exist in this table.

    Returns:
        ScopedFilters with the filters to apply, the ones scoped out, and the ones
        that make this branch contribute no rows at all.
    """
    if not filters:
        return ScopedFilters([], [], [])
    if not table_columns:
        return ScopedFilters(list(filters), [], [])

    kept: List[Any] = []
    ignored_fields: List[str] = []
    blocking_fields: List[str] = []

    for filt in filters:
        if getattr(filt, 'scope', 'row') == 'group':
            if _group_filter_is_evaluable(
                filt, table_columns, measure_aliases, is_computable_virtual_column
            ):
                kept.append(filt)
            else:
                # The aggregated column is absent here, so the measure is NULL-filled
                # for this branch; a HAVING on it would be invalid SQL.
                ignored_fields.append(filt.field)
            continue

        if filt.field in table_columns or is_computable_virtual_column(filt.field):
            kept.append(filt)
        elif filter_excludes_nulls(filt):
            blocking_fields.append(filt.field)
        else:
            ignored_fields.append(filt.field)

    return ScopedFilters(kept, ignored_fields, blocking_fields)


def _group_filter_is_evaluable(
    filt: Any,
    table_columns: Dict[str, str],
    measure_aliases: Set[str],
    is_computable_virtual_column: Callable[[str], bool],
) -> bool:
    """True when this branch can build a HAVING clause for `filt`."""
    if filt.field in measure_aliases:
        return True

    match = _MEASURE_ALIAS_RE.fullmatch(filt.field.strip())
    if match is None:
        # Not an alias we can take apart — leave the decision to the single-table
        # builder, which raises a clear error for unusable HAVING filters.
        return True

    column = match.group(2)
    return (
        column == '*'
        or column in table_columns
        or is_computable_virtual_column(column)
    )
