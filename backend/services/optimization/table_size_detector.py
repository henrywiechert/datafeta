"""Helpers for detecting when optimizations should be skipped for small tables."""

from __future__ import annotations

import logging
from typing import Any, Mapping, Optional, Sequence, Union

from backend.connectors.base import BaseConnector
from backend.models.query import OptimizationOverride, QueryDescription

from .config import OptimizerConfig

RowValue = Union[int, Sequence[Any], Mapping[str, Any]]


class SmallTableDetector:
    """Encapsulates the table row-count probing used by the optimizer."""

    def __init__(
        self,
        *,
        config: OptimizerConfig,
        connector: Optional[BaseConnector],
        logger: Optional[logging.Logger] = None,
    ) -> None:
        self._config = config
        self._connector = connector
        self._logger = logger or logging.getLogger(__name__)

    def check(self, query_desc: QueryDescription) -> Optional[OptimizationOverride]:
        """Return an override if the target table is below the configured threshold."""
        if not self._config.enable_small_table_detection:
            self._logger.debug("Small table detection disabled")
            return None

        if not self._connector:
            self._logger.warning("No connector available for table size check")
            return None

        try:
            table_ref = self._build_table_reference(query_desc)
            row_count = self._get_row_count(table_ref)
            if row_count is None:
                self._logger.warning("Table size check returned no results")
                return None

            column_count = len(query_desc.dimensions) + len(query_desc.measures)

            if row_count < self._config.small_table_threshold:
                self._logger.info(
                    "✅ Small table detected: %s rows < %s threshold. Skipping all optimizations to avoid overhead.",
                    f"{row_count:,}",
                    f"{self._config.small_table_threshold:,}",
                )
                return OptimizationOverride(
                    skip_all_optimizations=True,
                    reason="table_too_small",
                    table_stats={
                        "row_count": row_count,
                        "column_count": column_count,
                        "threshold": self._config.small_table_threshold,
                    },
                )

            self._logger.info(
                "Table size: %s rows (>= threshold %s)",
                f"{row_count:,}",
                f"{self._config.small_table_threshold:,}",
            )
            return None
        except Exception as exc:  # pragma: no cover - defensive logging path
            self._logger.warning(
                "Failed to check table size: %s. Proceeding with optimization.",
                exc,
                exc_info=True,
            )
            return None

    def _build_table_reference(self, query_desc: QueryDescription) -> str:
        """
        Build a table reference suitable for the underlying connector's SQL dialect.

        Important: the FileConnector path uses DuckDB over a temporary VIEW named after
        `target_table`. It does NOT support database/schema qualification, and the
        string 'default' (common ClickHouse database name) is a DuckDB keyword and
        will cause `default.<table>` to fail to parse.
        """
        if self._connector and type(self._connector).__name__ == "FileConnector":
            # DuckDB temp view name – always quote to handle spaces/special chars.
            return f'"{query_desc.target_table}"'

        if query_desc.target_database:
            return f"{query_desc.target_database}.{query_desc.target_table}"
        return query_desc.target_table

    def _get_row_count(self, table_ref: str) -> Optional[int]:
        cache = None
        cache_key: Optional[str] = None
        row_count: Optional[int] = None

        if self._config.enable_count_cache:
            from .count_cache import get_global_count_cache

            cache = get_global_count_cache(
                ttl_seconds=self._config.count_cache_ttl_seconds,
                max_size=self._config.count_cache_max_size,
            )
            cache_key = f"table_size::{table_ref}"
            cached = cache.get(cache_key)
            if cached is not None:
                row_count = int(cached)
                self._logger.debug("COUNT(*) cache hit for %s: %s", table_ref, row_count)
            else:
                self._logger.debug("COUNT(*) cache miss for %s", table_ref)
        else:
            self._logger.debug("Count cache disabled")

        if row_count is None:
            count_query = f"SELECT COUNT(*) as row_count FROM {table_ref}"
            self._logger.debug("Checking table size with: %s", count_query)
            _, rows = self._connector.fetch_data(count_query)  # type: ignore[union-attr]
            if not rows:
                return None
            row_count = self._extract_count(rows[0])
            if row_count is None:
                return None
            if cache is not None and cache_key is not None:
                try:
                    cache.set(cache_key, int(row_count))
                    self._logger.debug("Cached COUNT(*) for %s: %s", table_ref, row_count)
                except Exception as cache_error:  # pragma: no cover - best-effort cache
                    self._logger.debug(
                        "Failed to cache COUNT(*) for %s: %s",
                        table_ref,
                        cache_error,
                    )
        return row_count

    def _extract_count(self, row: RowValue) -> Optional[int]:
        if row is None:
            return None

        if isinstance(row, Mapping):
            value = row.get("row_count")
            return int(value) if value is not None else None

        if isinstance(row, Sequence) and not isinstance(row, (str, bytes)):
            if not row:
                return None
            return int(row[0])

        try:
            return int(row)  # type: ignore[arg-type]
        except (TypeError, ValueError):  # pragma: no cover - defensive fallback
            return None
