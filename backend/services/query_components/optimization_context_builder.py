"""Builder for creating optimization context from query description and optimizer."""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from backend.models.query import QueryDescription
from backend.services.query_components.contexts import OptimizationContext


class OptimizationContextBuilder:
    """
    Creates optimization plan and derivative configs when available.
    
    Extracts rounding, binning, and category deduplication configurations
    from the optimization plan strategies.
    """

    def __init__(self, logger: Optional[logging.Logger] = None) -> None:
        self._logger = logger or logging.getLogger(__name__)

    def build(
        self,
        query_desc: QueryDescription,
        optimizer: Optional[Any],
        with_optimization: bool,
    ) -> OptimizationContext:
        """
        Create optimization context from query description and optimizer.
        
        Args:
            query_desc: The query description to optimize
            optimizer: QueryOptimizer instance (optional)
            with_optimization: Whether optimization is enabled
            
        Returns:
            OptimizationContext with plan and configs
        """
        rounding_config: Dict[str, Any] = {}
        binning_config: Dict[str, Any] = {}
        optimization_plan = None
        use_category_dedup = False

        if with_optimization and optimizer:
            try:
                optimization_plan = optimizer.create_plan(query_desc)
                
                for strategy in optimization_plan.strategies:
                    if hasattr(strategy, 'prepare_rounding_config'):
                        rounding_config = strategy.prepare_rounding_config(query_desc)
                        self._logger.info(f"Rounding config prepared: {rounding_config}")
                    
                    if hasattr(strategy, 'prepare_binning_config'):
                        binning_config = strategy.prepare_binning_config(query_desc)
                        self._logger.info(f"Binning config prepared: {binning_config}")
                    
                    if strategy.__class__.__name__ == 'CategoryDeduplicationStrategy':
                        use_category_dedup = True
                        self._logger.info("Category deduplication will be applied")
                        
            except Exception as exc:
                self._logger.warning(f"Failed to create optimization plan early: {exc}")

        return OptimizationContext(
            plan=optimization_plan,
            rounding_config=rounding_config,
            binning_config=binning_config,
            use_category_dedup=use_category_dedup,
        )
