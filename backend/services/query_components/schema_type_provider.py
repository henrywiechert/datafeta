# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Single source of truth for fetching a table's physical column types.

Previously several call sites (query service, cardinality service, the adaptive
rounding planner) each re-implemented "list_columns -> {name: data_type}" with their
own try/except and ad-hoc caching. This provider centralizes that fetch and caches
results per (database, table) for the lifetime of the provider instance.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional, Tuple

from backend.services.datetime_service import DateTimeService

logger = logging.getLogger(__name__)


class SchemaTypeProvider:
    """Fetch and cache column name -> physical type maps from a connector."""

    def __init__(self, connector: Optional[Any]) -> None:
        self._connector = connector
        self._cache: Dict[Tuple[Optional[str], Optional[str]], Optional[Dict[str, str]]] = {}

    def get_types(
        self,
        database: Optional[str],
        table: Optional[str],
    ) -> Optional[Dict[str, str]]:
        """Return {column_name: data_type} for a table, or None if unavailable.

        Results (including failures, cached as None) are memoized per (database, table)
        so repeated lookups within a single query do not re-issue DESCRIBE/list_columns.
        """
        if self._connector is None or table is None:
            return None
        key = (database, table)
        if key not in self._cache:
            try:
                cols = self._connector.list_columns(database=database, table=table)
                self._cache[key] = {col.name: col.data_type for col in cols}
            except Exception:
                logger.debug(
                    "Could not fetch column types for %s.%s", database, table,
                    exc_info=True,
                )
                self._cache[key] = None
        return self._cache[key]

    def source_type(
        self,
        field: str,
        database: Optional[str],
        table: Optional[str],
    ) -> Optional[str]:
        """Resolve a single field's physical type (handles table-qualified names)."""
        return DateTimeService.resolve_source_type(
            field, self.get_types(database, table)
        )
