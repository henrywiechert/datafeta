# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Helpers for planning deduplication-related strategies."""

from __future__ import annotations

import logging
from typing import List, Optional, Tuple

from backend.models.query import QueryDescription

from ..config import OptimizerConfig
from ..estimators.base import ResultSizeEstimator
from ..strategies.base import OptimizationStrategy
from ..strategies.category_dedup import CategoryDeduplicationStrategy
from ..strategies.distinct_pairs import DistinctPairStrategy


class DedupStrategyPlanner:
    """Plan strategies that handle deduplication concerns."""

    def __init__(
        self,
        *,
        config: OptimizerConfig,
        estimator: Optional[ResultSizeEstimator],
        db_type: str,
        logger: Optional[logging.Logger] = None,
    ) -> None:
        self._config = config
        self._estimator = estimator
        self._db_type = db_type
        self._logger = logger or logging.getLogger(__name__)

    def plan_simple(self, query_desc: QueryDescription) -> List[OptimizationStrategy]:
        """Return strategies for straightforward deduplication cases."""
        strategies: List[OptimizationStrategy] = []

        if self._config.enable_distinct_pairs:
            strategies.append(DistinctPairStrategy(self._db_type, estimator=self._estimator))
            self._logger.debug("Added DISTINCT strategy for deduplication")

        return strategies

    def plan_multi_dimensional(
        self,
        query_desc: QueryDescription,
    ) -> Tuple[List[OptimizationStrategy], List[OptimizationStrategy], bool]:
        """Return strategies for multi-dimensional queries.

        Returns a tuple with:
        * Strategies that should be executed before rounding/binning
        * Strategies that should be executed after rounding/binning
        * Flag indicating whether category deduplication will run
        """
        leading: List[OptimizationStrategy] = []
        trailing: List[OptimizationStrategy] = []
        has_category = False

        if self._config.enable_distinct_pairs:
            timeline_dims = [d for d in query_desc.dimensions if d.date_mode == "timeline"]
            if not timeline_dims:
                leading.append(DistinctPairStrategy(self._db_type, estimator=self._estimator))

        category_strategy = CategoryDeduplicationStrategy(
            self._db_type,
            estimator=self._estimator,
        )
        if category_strategy.can_apply(query_desc):
            trailing.append(category_strategy)
            has_category = True

        return leading, trailing, has_category
