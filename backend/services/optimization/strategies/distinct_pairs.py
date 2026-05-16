# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Strategy for applying DISTINCT to raw data queries."""

import logging
from typing import Optional
from pypika import Query, Table

from backend.models.query import QueryDescription
from .base import OptimizationStrategy, OptimizationMetadata

logger = logging.getLogger(__name__)


class DistinctPairStrategy(OptimizationStrategy):
    """
    Apply DISTINCT to get unique values/pairs for raw data queries.
    
    This eliminates duplicate rows that provide no additional information
    but significantly increase dataset size. Useful for:
    - Single dimensions (tick strips)
    - Multiple dimensions (scatter plots)
    - Discrete dimensions (filter values)
    """
    
    def __init__(self, db_type: str = 'clickhouse', estimator=None):
        super().__init__(db_type)
        self._priority = 10  # Apply early
        self.estimator = estimator  # Optional estimator for more accurate reduction estimates
        self.actual_reduction: Optional[float] = None  # Store actual reduction after estimation
    
    @property
    def priority(self) -> int:
        """Return priority for strategy ordering."""
        return self._priority
    
    def can_apply(self, query_desc: QueryDescription) -> bool:
        """
        Check if DISTINCT can be applied.
        
        Requires:
        - No measures (raw data query)
        - At least 1 dimension
        """
        if query_desc.measures:
            return False
        
        if not query_desc.dimensions:
            return False
        
        # DISTINCT is useful for any raw data query to remove duplicates
        return True
    
    def apply(self, query: Query, query_desc: QueryDescription, table: Table) -> Query:
        """
        Apply DISTINCT to the query.
        
        Args:
            query: pypika Query object
            query_desc: Original query description
            table: pypika Table object
            
        Returns:
            Modified query with DISTINCT applied
        """
        # If we have an estimator, get actual reduction estimate
        if self.estimator:
            try:
                self.actual_reduction = self.estimator.estimate_distinct_reduction(
                    query, query_desc, table
                )
                logger.info(f"Estimated DISTINCT reduction: {self.actual_reduction:.2%}")
            except Exception as e:
                logger.warning(f"Could not estimate reduction: {e}")
                self.actual_reduction = None
        
        # Apply distinct() on the query
        optimized = query.distinct()
        
        logger.info("Applied DISTINCT to scatter plot query")
        
        return optimized
    
    def get_metadata(self) -> OptimizationMetadata:
        """Return metadata about this optimization."""
        # Use actual reduction if available, otherwise use default estimate
        reduction = self.actual_reduction if self.actual_reduction is not None else 0.7
        
        return OptimizationMetadata(
            strategy_name='distinct_pairs',
            estimated_reduction=reduction,
            parameters={
                'estimation_method': 'database_specific' if self.actual_reduction is not None else 'default'
            }
        )
