# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Scoping filters to a single-table query.

Cardinality and filter-value queries for a JOINed virtual table resolve the field to
one source table and drop the JOIN, because they want every distinct value of that
column rather than only the rows the JOIN matches. The dimension is rewritten to a
bare column name in the process, and filters carried over from the caller have to
follow the same rewrite:

* A filter on a *different* known table can no longer be resolved — `FieldReferenceParser`
  would fall back to a literal column and emit `races."results.points"`. It is dropped.
* A filter on the *resolved* table keeps its prefix, which the single-table parser also
  reads as a literal column name (`races."races.year"`). Its prefix is stripped, exactly
  as the dimension's was.

A dotted name whose prefix is not a known table is left alone: ClickHouse allows dots
in column names, so it is a real column.
"""
import logging
from typing import Any, Callable, List, Optional, Set

logger = logging.getLogger(__name__)


def references_query_table(
    field_name: str,
    known_tables: Set[str],
    resolved_table_name: str,
    is_virtual_column: Optional[Callable[[str], bool]] = None,
) -> bool:
    """True when `field_name` can be resolved against the single table in FROM.

    Only the table-prefix case can be decided here; an unprefixed column that belongs
    to another table is indistinguishable from a column of this one.
    """
    if is_virtual_column and is_virtual_column(field_name):
        return True
    if '.' not in field_name:
        return True

    prefix = field_name.split('.', 1)[0]
    return not (prefix in known_tables and prefix != resolved_table_name)


def scope_filters_to_table(
    filters: Optional[List[Any]],
    known_tables: Set[str],
    resolved_table_name: str,
    is_virtual_column: Optional[Callable[[str], bool]] = None,
    log_context: str = "Query",
) -> List[Any]:
    """Return `filters` restricted and re-qualified for a single-table FROM.

    Filters on other known tables are dropped; filters qualified with
    `resolved_table_name` have that prefix stripped. Filters are copied, never mutated.
    """
    if not filters:
        return []

    scoped: List[Any] = []
    for f in filters:
        if is_virtual_column and is_virtual_column(f.field):
            scoped.append(f)
            continue

        prefix, _, remainder = f.field.partition('.')
        if not remainder or prefix not in known_tables:
            scoped.append(f)
            continue

        if prefix != resolved_table_name:
            logger.info(
                "%s: skipping filter on '%s' — table '%s' is not in FROM",
                log_context,
                f.field,
                prefix,
            )
            continue

        logger.debug(
            "%s: stripping resolved-table prefix from filter '%s'", log_context, f.field
        )
        scoped.append(f.model_copy(update={'field': remainder}))

    return scoped
