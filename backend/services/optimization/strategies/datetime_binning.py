"""Strategy for binning datetime dimensions to reduce point count."""

import logging
import math
from typing import Optional, Dict, List, Tuple
from pypika import Query, Table
from pypika.terms import Function, Term

from backend.models.query import QueryDescription, Dimension
from .base import OptimizationStrategy, OptimizationMetadata

logger = logging.getLogger(__name__)

class DateTrunc(Function):
    def __init__(self, unit, field):
        super().__init__('date_trunc', unit, field)

class DateTimeBinningStrategy(OptimizationStrategy):
    def __init__(
        self,
        db_type: str = 'clickhouse',
        estimator=None,
        target_buckets: int = 100,
        dimension_ranges: Optional[Dict[str, Tuple[float, float]]] = None
    ):
        super().__init__(db_type)
        self._priority = 20  # Same as rounding
        self.estimator = estimator
        self.target_buckets = target_buckets
        self.dimension_ranges = dimension_ranges or {}
        self.binning_config: Dict[str, str] = {}  # field -> unit (e.g., 'hour')

    @property
    def priority(self) -> int:
        return self._priority

    def can_apply(self, query_desc: QueryDescription) -> bool:
        timeline_dims = [d for d in query_desc.dimensions if d.flavour == 'continuous' and d.date_mode == 'timeline']
        return len(timeline_dims) >= 1

    def apply(self, query: Query, query_desc: QueryDescription, table: Table) -> Query:
        """
        Apply datetime binning to the query.
        
        This strategy marks that binning should be applied. The actual date_trunc
        operations will be handled by query_service when building the SELECT clause.
        
        Args:
            query: pypika Query object
            query_desc: Original query description
            table: pypika Table object
            
        Returns:
            Modified query with DISTINCT applied
        """
        # Ensure binning config is prepared
        if not self.binning_config:
            self.prepare_binning_config(query_desc)
        
        # Apply DISTINCT to eliminate duplicate binned values
        optimized = query.distinct()
        
        logger.info(f"Applied datetime binning strategy: {self.binning_config}")
        return optimized

    def _calculate_binning_unit(self, dimension: Dimension) -> str:
        field = dimension.field
        if field not in self.dimension_ranges:
            logger.warning(f"No range for {field}, using default 'day'")
            return 'day'
        
        min_ts, max_ts = self.dimension_ranges[field]
        data_range = max_ts - min_ts  # seconds
        if data_range <= 0:
            return 'day'
        
        bucket_size = data_range / self.target_buckets  # seconds per bucket
        
        # Define units and their seconds
        units = [
            ('year', 31536000),
            ('month', 2592000),
            ('day', 86400),
            ('hour', 3600),
            ('minute', 60),
            ('second', 1)
        ]
        
        # Find closest unit
        best_unit = 'day'
        min_diff = float('inf')
        for unit, secs in units:
            diff = abs(secs - bucket_size)
            if diff < min_diff:
                min_diff = diff
                best_unit = unit
        
        logger.debug(f"Dimension {field}: range={data_range}s, bucket={bucket_size}s, unit={best_unit}")
        return best_unit

    def get_metadata(self) -> OptimizationMetadata:
        return OptimizationMetadata(
            strategy_name="datetime_binning",
            estimated_reduction=0.95,  # Estimate ~95% reduction from binning
            parameters={"binning_config": self.binning_config}
        )

    def prepare(self, query_desc: QueryDescription) -> None:
        # Calculate binning config before apply
        timeline_dims = [d for d in query_desc.dimensions if d.flavour == 'continuous' and d.date_mode == 'timeline']
        for dim in timeline_dims:
            unit = self._calculate_binning_unit(dim)
            self.binning_config[dim.field] = unit
    
    def prepare_binning_config(self, query_desc: QueryDescription) -> Dict[str, str]:
        """
        Calculate and return binning configuration for timeline dimensions.
        
        Args:
            query_desc: Query description with dimensions
            
        Returns:
            Dictionary mapping field names to binning units (e.g., 'hour', 'day')
        """
        if not self.binning_config:
            self.prepare(query_desc)
        return self.binning_config
