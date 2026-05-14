# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Strategy for deduplicating discrete-only dimension queries."""

import logging
from typing import Optional
from pypika import Query, Table

from backend.models.query import QueryDescription
from .base import OptimizationStrategy, OptimizationMetadata

logger = logging.getLogger(__name__)


class DiscreteDeduplicationStrategy(OptimizationStrategy):
    """
    Apply DISTINCT or GROUP BY to deduplicate discrete dimension queries.
    
    This is used when querying for unique categories/values for filters,
    or when displaying discrete-only data (like category lists).
    """
    
    def __init__(self, db_type: str = 'clickhouse', estimator=None):
        super().__init__(db_type)
        self._priority = 5  # Apply before other strategies
        self.estimator = estimator
        self.actual_reduction: Optional[float] = None
    
    @property
    def priority(self) -> int:
        """Return priority for strategy ordering."""
        return self._priority
    
    def can_apply(self, query_desc: QueryDescription) -> bool:
        """
        Check if discrete deduplication can be applied.
        
        Requires:
        - No measures (raw data query)
        - At least one discrete dimension
        - No continuous dimensions (pure discrete query)
        """
        if query_desc.measures:
            return False
        
        if not query_desc.dimensions:
            return False
        
        discrete_dims = [d for d in query_desc.dimensions if d.flavour == 'discrete']
        continuous_dims = [d for d in query_desc.dimensions if d.flavour == 'continuous']
        
        # Only apply if there are discrete dims and NO continuous dims
        return len(discrete_dims) > 0 and len(continuous_dims) == 0
    
    def apply(self, query: Query, query_desc: QueryDescription, table: Table) -> Query:
        """
        Apply DISTINCT to deduplicate discrete values.
        
        Args:
            query: pypika Query object
            query_desc: Original query description
            table: pypika Table object
            
        Returns:
            Modified query with DISTINCT applied
        """
        # For pure discrete queries, simply apply DISTINCT
        optimized = query.distinct()
        
        logger.info("Applied DISTINCT to discrete-only query for deduplication")
        
        return optimized
    
    def get_metadata(self) -> OptimizationMetadata:
        """Return metadata about this optimization."""
        # Use actual reduction if available, otherwise use default estimate
        # Discrete deduplication typically has high reduction (80-95%)
        reduction = self.actual_reduction if self.actual_reduction is not None else 0.85
        
        return OptimizationMetadata(
            strategy_name='discrete_deduplication',
            estimated_reduction=reduction,
            parameters={
                'estimation_method': 'database_specific' if self.actual_reduction is not None else 'default',
                'purpose': 'Remove duplicate discrete values for filters/categories'
            }
        )
