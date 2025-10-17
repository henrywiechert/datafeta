"""Strategy for applying DISTINCT to scatter plot coordinate pairs."""

import logging
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
    
    def __init__(self, db_type: str = 'clickhouse'):
        super().__init__(db_type)
        self._priority = 10  # Apply early
    
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
        # Simply call distinct() on the query
        optimized = query.distinct()
        
        logger.info("Applied DISTINCT to scatter plot query")
        
        return optimized
    
    def get_metadata(self) -> OptimizationMetadata:
        """Return metadata about this optimization."""
        return OptimizationMetadata(
            strategy_name='distinct_pairs',
            estimated_reduction=0.7,  # Typically 70% reduction
            parameters={}
        )
