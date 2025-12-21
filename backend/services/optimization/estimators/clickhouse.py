"""ClickHouse-specific result size estimator."""

import logging
from typing import List, Optional
from pypika import Query, Table
from pypika.terms import Function

from backend.connectors.base import BaseConnector
from backend.models.query import QueryDescription
from .base import ResultSizeEstimator, EstimationResult

logger = logging.getLogger(__name__)


class UniqFunction(Function):
    """Custom ClickHouse uniq() function for pypika."""
    
    def __init__(self, *args):
        super().__init__('uniq', *args)


class UniqExactFunction(Function):
    """Custom ClickHouse uniqExact() function for pypika."""
    
    def __init__(self, *args):
        super().__init__('uniqExact', *args)


class TupleFunction(Function):
    """Custom ClickHouse tuple() function for pypika."""
    
    def __init__(self, *args):
        super().__init__('tuple', *args)


class ClickHouseEstimator(ResultSizeEstimator):
    """
    ClickHouse-specific result size estimator.
    
    Uses ClickHouse's fast uniq() function for cardinality estimation.
    The uniq() function uses HyperLogLog algorithm for approximate unique counts.
    
    For exact counts (smaller datasets), use uniqExact() instead.
    """
    
    def __init__(self, connector: BaseConnector, use_exact: bool = False):
        """
        Initialize ClickHouse estimator.
        
        Args:
            connector: ClickHouse connector
            use_exact: If True, use uniqExact() instead of uniq() (slower but accurate)
        """
        super().__init__(connector)
        self.use_exact = use_exact
    
    def estimate_result_size(
        self,
        query: Query,
        query_desc: QueryDescription,
        table: Table
    ) -> EstimationResult:
        """
        Estimate result size using ClickHouse's uniq() function.
        
        For scatter plots (multiple continuous dimensions), estimates the
        unique count of dimension pairs using uniq(tuple(dim1, dim2, ...)).
        
        Args:
            query: The pypika Query object
            query_desc: Original query description
            table: The pypika Table object
            
        Returns:
            EstimationResult with cardinality estimates
        """
        continuous_dims = [
            d for d in query_desc.dimensions 
            if d.flavour == 'continuous'
        ]
        
        if not continuous_dims:
            logger.warning("No continuous dimensions found for estimation")
            return EstimationResult(total_rows=0)
        
        try:
            # Build estimation query
            estimation_query = self._build_estimation_query(
                table, 
                continuous_dims,
                query_desc
            )
            
            # Execute estimation query
            sql = estimation_query.get_sql(quote_char='`')
            logger.debug(f"Executing estimation query: {sql}")
            
            # Use fetch_data() which returns (columns, rows)
            columns, rows = self.connector.fetch_data(sql)
            
            if not rows or len(rows) == 0:
                logger.warning("Empty estimation result")
                return EstimationResult(total_rows=0)
            
            row = rows[0]
            total_rows = row.get('total_rows', 0)
            unique_pairs = row.get('unique_pairs', total_rows)
            
            logger.info(
                f"ClickHouse estimation: {total_rows} total rows, "
                f"{unique_pairs} unique pairs"
            )
            
            return EstimationResult(
                total_rows=total_rows,
                unique_pairs=unique_pairs
            )
            
        except Exception as e:
            logger.error(f"Error estimating result size: {e}")
            # Fall back to basic estimation
            return EstimationResult(total_rows=0)
    
    def _build_estimation_query(
        self,
        table: Table,
        continuous_dims: List,
        query_desc: QueryDescription
    ) -> Query:
        """
        Build the estimation query using ClickHouse functions.
        
        Query structure:
        SELECT 
            count() as total_rows,
            uniq(tuple(dim1, dim2, ...)) as unique_pairs
        FROM table
        WHERE [filters...]
        """
        from pypika.functions import Count
        
        # Select the uniq function (exact or approximate)
        uniq_func = UniqExactFunction if self.use_exact else UniqFunction
        
        # Build tuple of dimension fields
        if len(continuous_dims) > 1:
            # Multiple dimensions: uniq(tuple(x, y, ...))
            tuple_args = [getattr(table, d.field) for d in continuous_dims]
            unique_count = uniq_func(TupleFunction(*tuple_args)).as_('unique_pairs')
        else:
            # Single dimension: uniq(x)
            unique_count = uniq_func(getattr(table, continuous_dims[0].field)).as_('unique_pairs')
        
        # Build query
        estimation_query = (
            Query.from_(table)
            .select(
                Count('*').as_('total_rows'),
                unique_count
            )
        )
        
        # Apply filters from original query (skip virtual columns that don't exist in actual tables)
        VIRTUAL_COLUMNS = {'_source_database', '_source_table'}
        
        if query_desc.filters:
            from backend.services.query_service import QueryService
            query_service = QueryService()
            
            for filter_item in query_desc.filters:
                # Skip filters on virtual columns
                if filter_item.field in VIRTUAL_COLUMNS:
                    continue
                criterion = query_service._build_filter_criterion(table, filter_item)
                if criterion:
                    estimation_query = estimation_query.where(criterion)
        
        return estimation_query
    
    def estimate_size(
        self,
        query_desc: QueryDescription,
        timeout_ms: int = 500
    ) -> EstimationResult:
        """
        Estimate result size for a query (implements abstract method).
        
        This is a simplified interface that doesn't need the full query object.
        """
        from pypika import Table
        table = Table(query_desc.target_table)
        query = None  # Not needed for estimation
        return self.estimate_result_size(query, query_desc, table)
    
    def estimate_distinct_reduction(
        self,
        query: Query,
        query_desc: QueryDescription,
        table: Table
    ) -> float:
        """
        Estimate the reduction factor from applying DISTINCT.
        
        Returns:
            Float between 0 and 1 representing the reduction factor
            (e.g., 0.7 means 70% reduction)
        """
        result = self.estimate_result_size(query, query_desc, table)
        
        if result.total_rows == 0:
            return 0.0
        
        if result.unique_pairs is None:
            # No unique pair data, use default estimate
            return 0.7
        
        # Calculate actual reduction
        reduction = 1.0 - (result.unique_pairs / result.total_rows)
        
        logger.info(
            f"Estimated DISTINCT reduction: {reduction:.2%} "
            f"({result.total_rows} -> {result.unique_pairs} rows)"
        )
        
        return max(0.0, min(1.0, reduction))
