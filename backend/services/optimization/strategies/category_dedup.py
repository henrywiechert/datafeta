# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Strategy for deduplicating pairs across discrete categories."""

import logging
from typing import Optional
from pypika import Query, Table
from pypika.terms import Function

from backend.models.query import QueryDescription
from .base import OptimizationStrategy, OptimizationMetadata

logger = logging.getLogger(__name__)


class CategoryDeduplicationStrategy(OptimizationStrategy):
    """
    Deduplicate (x, y) pairs across discrete categories using GROUP BY.
    
    When visualizing scatter plots with color encoding by a discrete dimension,
    each (x, y) coordinate pair may appear multiple times with different category values.
    
    This strategy uses GROUP BY on continuous dimensions and any() for discrete dimensions
    to ensure each (x, y) pair appears only ONCE.
    
    SQL Example:
        SELECT ROUND(x,1) as x, ROUND(y,1) as y, any(category) as category
        FROM table
        WHERE x IS NOT NULL AND y IS NOT NULL
        GROUP BY x, y
    
    Result: Each rounded (x,y) pair appears once with an arbitrary category value.
    """
    
    def __init__(self, db_type: str = 'clickhouse', estimator=None):
        super().__init__(db_type)
        self._priority = 25  # Apply after rounding
        self.estimator = estimator
        self.should_group_by_pairs = True  # Flag for query_service
    
    @property
    def priority(self) -> int:
        """Return priority for strategy ordering."""
        return self._priority
    
    def can_apply(self, query_desc: QueryDescription) -> bool:
        """
        Check if category deduplication can be applied.
        
        Requires:
        - No measures (raw data query)
        - At least 2 continuous dimensions (for x, y coordinates)
        - At least 1 discrete dimension (for categories)
        """
        if query_desc.measures:
            return False
        
        if not query_desc.dimensions:
            return False
        
        continuous_dims = [d for d in query_desc.dimensions if d.flavour == 'continuous']
        discrete_dims = [d for d in query_desc.dimensions if d.flavour == 'discrete']
        
        # Need at least 2 continuous (x, y) and 1 discrete (color/category)
        has_xy = len(continuous_dims) >= 2
        has_categories = len(discrete_dims) >= 1
        
        # Check for proper axes
        has_x = any(d.axis == 'x' for d in continuous_dims)
        has_y = any(d.axis == 'y' for d in continuous_dims)
        
        can_apply = has_xy and has_x and has_y and has_categories
        
        if can_apply:
            logger.info(f"Category deduplication can apply: {len(continuous_dims)} continuous, {len(discrete_dims)} discrete dims")
        
        return can_apply
    
    def apply(self, query: Query, query_desc: QueryDescription, table: Table) -> Query:
        """
        Mark that GROUP BY should be used instead of DISTINCT.
        
        The actual GROUP BY logic will be handled in query_service.py
        because it requires rebuilding the SELECT clause with any() aggregates.
        
        Args:
            query: pypika Query object  
            query_desc: Original query description
            table: pypika Table object
            
        Returns:
            Query object (actual grouping handled elsewhere)
        """
        logger.info("Category deduplication enabled - GROUP BY will be applied to continuous dimensions")
        
        # Return query as-is; grouping will be handled by query_service
        # which will check for this strategy in the plan
        return query
    
    def get_continuous_dimensions(self, query_desc: QueryDescription):
        """Get list of continuous dimensions for GROUP BY."""
        return [d for d in query_desc.dimensions if d.flavour == 'continuous']
    
    def get_discrete_dimensions(self, query_desc: QueryDescription):
        """Get list of discrete dimensions for any() aggregate."""
        return [d for d in query_desc.dimensions if d.flavour == 'discrete']
    
    def get_metadata(self) -> OptimizationMetadata:
        """Return metadata about this optimization."""
        # Category dedup can achieve 80-95% reduction when many categories share same coordinates
        reduction = 0.90
        
        return OptimizationMetadata(
            strategy_name='category_deduplication',
            estimated_reduction=reduction,
            parameters={
                'purpose': 'Remove duplicate (x,y) pairs across categories',
                'method': 'GROUP BY continuous dims, any() for discrete dims'
            }
        )
