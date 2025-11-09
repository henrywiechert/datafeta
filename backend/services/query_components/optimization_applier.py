"""Apply optimization plans while handling fallback behavior and metadata."""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Tuple

from pypika import Query

from backend.models.query import QueryDescription


class OptimizationApplier:
    """Wrap the `_apply_optimizations` logic from QueryService for reuse."""

    def __init__(self, logger: logging.Logger | None = None) -> None:
        self._logger = logger or logging.getLogger(__name__)

    def apply(
        self,
        *,
        query: Query,
        optimization_plan: Optional[Any],
        query_desc: QueryDescription,
        primary_table: Any,
        binning_config: Dict[str, Any],
        use_category_dedup: bool,
        with_optimization: bool,
        optimizer: Optional[Any],
    ) -> Tuple[Query, List[Dict[str, Any]]]:
        metadata: List[Dict[str, Any]] = []

        if with_optimization and optimizer and optimization_plan:
            try:
                if "unix_timestamp" in (binning_config or {}) and not query._distinct:
                    query = query.distinct()

                if use_category_dedup:
                    self._logger.info(
                        "Category deduplication active - skipping DISTINCT, using GROUP BY instead"
                    )
                else:
                    query = optimization_plan.apply(query, query_desc, primary_table)

                metadata = optimization_plan.get_metadata_summary() or []
                if metadata:
                    self._logger.info("Applied %s optimizations", len(metadata))
            except Exception as exc:  # pragma: no cover - defensive logging
                self._logger.error(
                    "Optimization failed, falling back to unoptimized: %s", exc,
                    exc_info=True,
                )

        return query, metadata
