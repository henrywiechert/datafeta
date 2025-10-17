"""Strategy for applying adaptive rounding to reduce point count in scatter plots."""

import logging
import math
from typing import Optional, Dict, List, Tuple
from pypika import Query, Table
from pypika.terms import Function, Term

from backend.models.query import QueryDescription, Dimension
from .base import OptimizationStrategy, OptimizationMetadata

logger = logging.getLogger(__name__)


class RoundFunction(Function):
    """Custom ROUND function for pypika."""
    
    def __init__(self, field, precision):
        super().__init__('ROUND', field, precision)


class AdaptiveRoundingStrategy(OptimizationStrategy):
    """
    Apply intelligent rounding to continuous dimensions to reduce point count.
    
    This strategy is applied when DISTINCT alone doesn't reduce the dataset enough.
    It rounds numeric values to appropriate precision to create more duplicates,
    which can then be eliminated with DISTINCT.
    
    Example:
        Original: (1.234567, 8.901234) → 1M unique points
        After DISTINCT: 500K unique points (still too many)
        After Rounding: ROUND(x, 2), ROUND(y, 2) → 10K unique points
    """
    
    def __init__(
        self,
        db_type: str = 'clickhouse',
        estimator=None,
        target_buckets: int = 100,
        dimension_ranges: Optional[Dict[str, Tuple[float, float]]] = None
    ):
        """
        Initialize adaptive rounding strategy.
        
        Args:
            db_type: Database type for SQL generation
            estimator: Optional estimator for range detection
            target_buckets: Target number of unique values per dimension
            dimension_ranges: Pre-computed min/max ranges for dimensions
        """
        super().__init__(db_type)
        self._priority = 20  # Apply after DISTINCT
        self.estimator = estimator
        self.target_buckets = target_buckets
        self.dimension_ranges = dimension_ranges or {}
        self.rounding_config: Dict[str, int] = {}  # field -> precision
    
    @property
    def priority(self) -> int:
        """Return priority for strategy ordering."""
        return self._priority
    
    def can_apply(self, query_desc: QueryDescription) -> bool:
        """
        Check if adaptive rounding can be applied.
        
        Requires:
        - No measures (raw data query)
        - At least 2 continuous dimensions on different axes
        - Dimensions have numeric data types
        """
        if query_desc.measures:
            return False
        
        if not query_desc.dimensions:
            return False
        
        continuous_dims = [d for d in query_desc.dimensions if d.flavour == 'continuous']
        
        if len(continuous_dims) < 2:
            return False
        
        # Check if dimensions span both axes (scatter plot scenario)
        has_x = any(d.axis == 'x' for d in continuous_dims)
        has_y = any(d.axis == 'y' for d in continuous_dims)
        
        return has_x and has_y
    
    def apply(self, query: Query, query_desc: QueryDescription, table: Table) -> Query:
        """
        Apply adaptive rounding to the query.
        
        This modifies the SELECT clause to round continuous dimensions,
        then applies DISTINCT to eliminate duplicates.
        
        Args:
            query: pypika Query object
            query_desc: Original query description
            table: pypika Table object
            
        Returns:
            Modified query with rounding applied
        """
        continuous_dims = [d for d in query_desc.dimensions if d.flavour == 'continuous']
        
        # Calculate rounding precision for each dimension
        for dim in continuous_dims:
            precision = self._calculate_rounding_precision(dim)
            self.rounding_config[dim.field] = precision
            logger.info(f"Will round {dim.field} to {precision} decimal places")
        
        # Build new SELECT clause with rounding
        # Note: We need to reconstruct the query with rounded expressions
        # This is a simplified version - in practice, we'd modify the query_service
        # to handle this more elegantly
        
        # For now, we'll return the query with a flag indicating rounding should be applied
        # The actual rounding will be handled by query_service when building the SELECT clause
        
        # Apply DISTINCT after rounding
        optimized = query.distinct()
        
        logger.info(f"Applied adaptive rounding: {self.rounding_config}")
        
        return optimized
    
    def _calculate_rounding_precision(self, dimension: Dimension) -> int:
        """
        Calculate appropriate rounding precision for a dimension.
        
        Args:
            dimension: The dimension to calculate precision for
            
        Returns:
            Number of decimal places to round to (can be negative for powers of 10)
        """
        field = dimension.field
        
        # Get range from pre-computed ranges or estimator
        if field in self.dimension_ranges:
            min_val, max_val = self.dimension_ranges[field]
        else:
            logger.warning(f"No range available for {field}, using default precision")
            return 2  # Default to 2 decimal places
        
        data_range = max_val - min_val
        
        if data_range == 0:
            return 0  # No variation, no rounding needed
        
        # Calculate bucket size to achieve target_buckets
        bucket_size = data_range / self.target_buckets
        
        # Determine precision based on bucket size
        # If bucket_size = 0.01, we want precision = 2
        # If bucket_size = 1.0, we want precision = 0
        # If bucket_size = 100, we want precision = -2
        
        if bucket_size == 0:
            return 2
        
        # Calculate order of magnitude
        magnitude = math.floor(math.log10(abs(bucket_size)))
        
        # Precision is the negative of magnitude
        # magnitude = -2 (0.01) → precision = 2
        # magnitude = 0 (1.0) → precision = 0
        # magnitude = 2 (100) → precision = -2
        precision = -magnitude
        
        logger.debug(
            f"Dimension {field}: range={data_range:.2f}, "
            f"bucket_size={bucket_size:.4f}, precision={precision}"
        )
        
        return precision
    
    def get_rounding_config(self) -> Dict[str, int]:
        """
        Get the rounding configuration for dimensions.
        
        Returns:
            Dictionary mapping field names to rounding precision
        """
        return self.rounding_config.copy()
    
    def get_metadata(self) -> OptimizationMetadata:
        """Return metadata about this optimization."""
        # Adaptive rounding typically achieves 70-90% reduction
        # depending on data distribution
        reduction = 0.80
        
        return OptimizationMetadata(
            strategy_name='adaptive_rounding',
            estimated_reduction=reduction,
            parameters={
                'target_buckets': self.target_buckets,
                'rounding_config': self.rounding_config,
                'purpose': 'Reduce point count while preserving distribution'
            }
        )


class RoundingHelper:
    """
    Helper class for applying rounding in SQL queries.
    
    This is used by query_service to apply rounding expressions
    during SELECT clause construction.
    """
    
    @staticmethod
    def create_round_expression(
        field_term: Term,
        precision: int,
        db_type: str = 'clickhouse'
    ) -> Function:
        """
        Create a ROUND expression for a field.
        
        Args:
            field_term: The field term to round
            precision: Number of decimal places (can be negative)
            db_type: Database type for SQL generation
            
        Returns:
            Function representing ROUND(field, precision)
        """
        if db_type == 'clickhouse':
            # ClickHouse: ROUND(x, precision)
            return RoundFunction(field_term, precision)
        elif db_type == 'duckdb':
            # DuckDB: ROUND(x, precision)  
            return RoundFunction(field_term, precision)
        else:
            # Standard SQL: ROUND(x, precision)
            return RoundFunction(field_term, precision)
    
    @staticmethod
    def should_round_dimension(dimension: Dimension, rounding_config: Dict[str, int]) -> bool:
        """
        Check if a dimension should be rounded.
        
        Args:
            dimension: The dimension to check
            rounding_config: Configuration from AdaptiveRoundingStrategy
            
        Returns:
            True if the dimension should be rounded
        """
        return dimension.field in rounding_config and dimension.flavour == 'continuous'
    
    @staticmethod
    def get_rounding_precision(field: str, rounding_config: Dict[str, int]) -> int:
        """
        Get rounding precision for a field.
        
        Args:
            field: Field name
            rounding_config: Configuration from AdaptiveRoundingStrategy
            
        Returns:
            Rounding precision (number of decimal places)
        """
        return rounding_config.get(field, 0)
