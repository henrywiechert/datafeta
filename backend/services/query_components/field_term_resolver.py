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

from backend.services.datetime_service import DateTimeService
from backend.services.query_components.cast_field_applier import apply_cast_if_configured


class FieldTermResolver:
    """Resolve a query field name into a final PyPika term.

    The resolution pipeline is:
    1. Structural parse (table prefixes / nested / virtual columns) via the provided
       ``parse_field_reference`` callable (typically ``FieldReferenceParser.parse``).
    2. Optional column cast (``column_casts``).
    3. Optional datetime-part extraction, parsing text columns to datetime first when
       the physical type (``column_types``) is a string type.
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

    def resolve_base(self, field_name: str) -> Any:
        """Parse the field and apply a configured cast (no datetime extraction)."""
        term = self._parse(field_name)
        return apply_cast_if_configured(field_name, term, self._column_casts)

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
        Returns the term unchanged when no datetime part is requested.
        """
        if not (date_part and date_mode):
            return term
        return DateTimeService.get_datetime_part_expression(
            term,
            date_part,
            date_mode,
            self._dialect,
            source_type=DateTimeService.resolve_source_type(field_name, self._column_types),
        )

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
