"""Factory for building optimization strategies based on query context."""

from __future__ import annotations

import logging
from typing import List, Optional

from backend.connectors.base import BaseConnector
from backend.models.query import OptimizationHints, QueryDescription

from .config import OptimizerConfig
from .estimators.base import ResultSizeEstimator
from .planners import AdaptiveRoundingPlanner, DedupStrategyPlanner
from .strategies.base import OptimizationStrategy
from .strategies.distinct_pairs import DistinctPairStrategy


class StrategyPlanner:
    """Create optimization strategies based on hints and query structure."""

    def __init__(
        self,
        *,
        config: OptimizerConfig,
        connector: Optional[BaseConnector],
        estimator: Optional[ResultSizeEstimator],
        db_type: str,
        logger: Optional[logging.Logger] = None,
    ) -> None:
        self._config = config
        self._connector = connector
        self._estimator = estimator
        self._db_type = db_type
        self._logger = logger or logging.getLogger(__name__)
        self._dedup_planner = DedupStrategyPlanner(
            config=config,
            estimator=estimator,
            db_type=db_type,
            logger=self._logger,
        )
        self._rounding_planner = AdaptiveRoundingPlanner(
            config=config,
            connector=connector,
            estimator=estimator,
            db_type=db_type,
            logger=self._logger,
        )

    # ------------------------------------------------------------------
    # Public surface
    # ------------------------------------------------------------------
    def create_from_query_structure(self, query_desc: QueryDescription) -> List[OptimizationStrategy]:
        """Default strategy planning when no hints are provided."""
        strategies: List[OptimizationStrategy] = []

        has_measures = bool(query_desc.measures)
        continuous_dims = [d for d in query_desc.dimensions if d.flavour == "continuous"]
        discrete_dims = [d for d in query_desc.dimensions if d.flavour == "discrete"]

        if has_measures:
            # Aggregated query - GROUP BY handles deduplication.
            self._logger.info(
                "Aggregated query with %s measures - no deduplication needed",
                len(query_desc.measures),
            )
        else:
            self._logger.info(
                "Raw data query with %s continuous + %s discrete dims",
                len(continuous_dims),
                len(discrete_dims),
            )

            if len(continuous_dims) >= 2:
                strategies.extend(self._plan_multi_continuous(query_desc))
            elif len(continuous_dims) >= 1 or len(discrete_dims) >= 1:
                strategies.extend(self._dedup_planner.plan_simple(query_desc))

        return strategies

    def create_from_hints(
        self,
        query_desc: QueryDescription,
        hints: OptimizationHints,
    ) -> List[OptimizationStrategy]:
        """Strategy planning when explicit hints are provided."""
        strategies: List[OptimizationStrategy] = []

        if hints.optimization_level == "none":
            self._logger.info("Optimization level set to 'none' - skipping all optimizations")
            return strategies

        if hints.enable_distinct:
            self._logger.info("Hints request DISTINCT optimization")
            if self._config.enable_distinct_pairs:
                strategies.append(DistinctPairStrategy(self._db_type, estimator=self._estimator))
            else:
                self._logger.warning("DISTINCT requested by hints but disabled in config")

        if hints.enable_rounding:
            self._logger.info("Hints request rounding optimization")
            if self._config.enable_adaptive_rounding:
                threshold = hints.rounding_threshold or self._config.rounding_threshold
                continuous_dims = [d for d in query_desc.dimensions if d.flavour == "continuous"]

                if len(continuous_dims) >= 2:
                    strategies.extend(self._plan_multi_continuous(query_desc))
                elif len(continuous_dims) == 1:
                    rounding_strategy = self._rounding_planner.plan_single_dimension(query_desc, threshold)
                    if rounding_strategy:
                        strategies.append(rounding_strategy)
            else:
                self._logger.warning("Rounding requested by hints but disabled in config")

        if hints.enable_sampling:
            self._logger.info("Sampling requested but not yet implemented")

        if hints.enable_binning:
            self._logger.info("Binning requested via hints")
            if self._config.enable_adaptive_rounding:
                strategy = self._rounding_planner.plan_binning(query_desc, threshold=self._config.rounding_threshold)
                if strategy:
                    strategies.append(strategy)
            else:
                self._logger.warning("Binning requested by hints but adaptive rounding disabled in config")

        return strategies

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    def _plan_multi_continuous(self, query_desc: QueryDescription) -> List[OptimizationStrategy]:
        distinct_strategies, category_strategies, category_expected = (
            self._dedup_planner.plan_multi_dimensional(query_desc)
        )
        rounding_strategies = self._rounding_planner.plan_multi_dimensional(
            query_desc,
            category_expected=category_expected,
        )
        return [
            *distinct_strategies,
            *rounding_strategies,
            *category_strategies,
        ]
