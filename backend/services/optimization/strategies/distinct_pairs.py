"""Strategy for applying DISTINCT to scatter plot coordinate pairs."""

import logging
from typing import Optional
from pypika import Query, Table

from backend.models.query import QueryDescription
from .base import OptimizationStrategy, OptimizationMetadata

logger = logging.getLogger(__name__)


class DistinctPairStrategy(OptimizationStrategy):
    """
    Apply DISTINCT to get unique coordinate pairs for scatter plots.
    
    This eliminates duplicate (x, y) points that provide no additional
    visual information but significantly increase dataset size.
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
        - At least 2 continuous dimensions
        - Continuous dimensions on different axes (scatter plot)
        """
        if query_desc.measures:
            return False
        
        if not query_desc.dimensions:
            return False
        
        continuous_dims = [d for d in query_desc.dimensions if d.flavour == 'continuous']
        
        if len(continuous_dims) < 2:
            return False
        
        # Check if dimensions span both axes
        has_x = any(d.axis == 'x' for d in continuous_dims)
        has_y = any(d.axis == 'y' for d in continuous_dims)
        
        return has_x and has_y
    
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
