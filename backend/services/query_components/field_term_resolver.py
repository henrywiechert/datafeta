# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Composes field reference parsing, casting, and datetime-part extraction.

Centralizes the previously duplicated ``parse -> cast -> datetime(source_type)``
idiom so every SELECT / GROUP BY / ORDER BY / WHERE path resolves a field term the
same way. Keeping this in one place also guarantees that a configured column cast is
applied before datetime extraction everywhere (so a column with both a cast and a
datetime part produces matching SELECT and GROUP BY expressions).
"""

from __future__ import annotations

from typing import Any, Callable, Dict, Optional

from pypika.terms import Field

from backend.dialects import get_dialect
from backend.services.datetime_service import DateTimeService
from backend.services.query_components.cast_field_applier import apply_cast_if_configured
from backend.services.query_components.terms import CastField, TableQualifiedField


def _select_aliases_shadow_columns(dialect: Any) -> bool:
    if isinstance(dialect, str):
        try:
            dialect = get_dialect(dialect)
        except ValueError:
            return False
    return bool(getattr(dialect, "select_aliases_shadow_columns", False))


class FieldTermResolver:
    """Resolve a query field name into a final PyPika term.

    The resolution pipeline is:
    1. Structural parse (table prefixes / nested / virtual columns) via the provided
       ``parse_field_reference`` callable (typically ``FieldReferenceParser.parse``).
    2. Optional column cast (``column_casts``).
    3. Optional datetime-part extraction, parsing text columns to datetime first when
       the physical type (``column_types``) is a string type.

    On dialects whose SELECT aliases shadow columns (ClickHouse), the column inside
    a cast/datetime wrapper is rendered table-qualified. The SELECT aliases such
    wrappers back to the field name (``parse(col) AS col``), so an unqualified
    GROUP BY / WHERE copy would read the alias and apply the wrapper twice.
    """

    def __init__(
        self,
        parse_field_reference: Callable[[str], Any],
        dialect: Any,
        column_casts: Optional[Dict[str, Dict[str, str]]] = None,
        column_types: Optional[Dict[str, str]] = None,
    ) -> None:
        self._parse = parse_field_reference
        self._dialect = dialect
        self._column_casts = column_casts
        self._column_types = column_types
        self._qualify_wrapped_columns = _select_aliases_shadow_columns(dialect)

    def _qualify_column(self, term: Any) -> Any:
        """Table-qualify the physical column a wrapper is about to read."""
        if not self._qualify_wrapped_columns:
            return term
        if type(term) is Field and term.table is not None:
            return TableQualifiedField(term.name, table=term.table)
        if isinstance(term, CastField):
            return CastField(
                self._qualify_column(term.field), term.cast_type, term.replacement_pattern
            )
        return term

    def resolve_base(self, field_name: str) -> Any:
        """Parse the field and apply a configured cast (no datetime extraction)."""
        term = self._parse(field_name)
        cast = apply_cast_if_configured(field_name, term, self._column_casts)
        return self._qualify_column(cast) if cast is not term else term

    def apply_datetime(
        self,
        term: Any,
        field_name: str,
        date_part: Optional[str],
        date_mode: Optional[str],
    ) -> Any:
        """Apply datetime-part extraction to an already-resolved term.

        Used by callers (e.g. the SELECT builder) that must layer datetime extraction
        on top of a term that may have been wrapped by binning/rounding/dedup logic.
        Returns the term unchanged when the field is not datetime. A datetime field
        always carries ``date_mode`` (even "Full DateTime", which has a mode but no
        specific ``date_part``), so ``date_mode`` alone triggers datetime handling.
        """
        if not date_mode:
            return term
        column = self._qualify_column(term)
        expr = DateTimeService.get_datetime_part_expression(
            column,
            date_part,
            date_mode,
            self._dialect,
            source_type=DateTimeService.resolve_source_type(field_name, self._column_types),
        )
        # A passthrough ("Full DateTime" on a native timestamp) wraps nothing.
        return term if expr is column else expr

    def resolve(
        self,
        field_name: str,
        date_part: Optional[str] = None,
        date_mode: Optional[str] = None,
    ) -> Any:
        """Full pipeline: parse -> cast -> optional datetime-part extraction."""
        return self.apply_datetime(
            self.resolve_base(field_name), field_name, date_part, date_mode
        )
