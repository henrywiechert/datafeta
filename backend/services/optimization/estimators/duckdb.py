# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""DuckDB-specific result size estimator."""

import logging
from typing import FrozenSet, List, Optional, Set
from pypika import Query, Table
from pypika.functions import Function

from backend.connectors.base import BaseConnector
from backend.models.query import QueryDescription
from .base import ResultSizeEstimator, EstimationResult

logger = logging.getLogger(__name__)

# Built-in virtual columns that only exist in UNION queries, not in actual tables.
BUILTIN_VIRTUAL_COLUMNS: FrozenSet[str] = frozenset({'_source_database', '_source_table'})


class ApproxCountDistinctFunction(Function):
    """Custom DuckDB approx_count_distinct() function for pypika."""
    
    def __init__(self, *args):
        super().__init__('approx_count_distinct', *args)


class StructPackFunction(Function):
    """Custom DuckDB struct_pack() function for pypika (for tuple-like behavior)."""
    
    def __init__(self, **kwargs):
        # struct_pack creates named tuples: struct_pack(x := col1, y := col2)
        # For simplicity, we'll use positional ROW constructor instead
        super().__init__('ROW', *kwargs.values())


class DuckDBEstimator(ResultSizeEstimator):
    """
    DuckDB-specific result size estimator.
    
    Uses DuckDB's approx_count_distinct() function for cardinality estimation.
    This function uses HyperLogLog algorithm similar to ClickHouse's uniq().
    
    For exact counts, use count(DISTINCT ...) instead, but this is slower.
    """
    
    def __init__(self, connector: BaseConnector, use_exact: bool = False):
        """
        Initialize DuckDB estimator.
        
        Args:
            connector: DuckDB connector
            use_exact: If True, use COUNT(DISTINCT) instead of approx (slower but accurate)
        """
        super().__init__(connector)
        self.use_exact = use_exact
    
    def _get_virtual_column_names(self, query_desc: QueryDescription) -> Set[str]:
        """
        Get the set of all virtual column names that don't exist in the actual table.
        
        This includes:
        - Built-in virtual columns (_source_database, _source_table)
        - User-defined virtual columns from query_desc.virtual_columns
        """
        virtual_names: Set[str] = set(BUILTIN_VIRTUAL_COLUMNS)
        
        if query_desc.virtual_columns:
            for vc in query_desc.virtual_columns:
                virtual_names.add(vc.name)
                logger.debug("Tracking user-defined virtual column: %s", vc.name)
        
        return virtual_names
    
    def estimate_result_size(
        self,
        query: Query,
        query_desc: QueryDescription,
        table: Table
    ) -> EstimationResult:
        """
        Estimate result size using DuckDB's approx_count_distinct() function.
        
        For scatter plots (multiple continuous dimensions), estimates the
        unique count of dimension pairs using approx_count_distinct on a
        concatenated or struct representation.
        
        Args:
            query: The pypika Query object
            query_desc: Original query description
            table: The pypika Table object
            
        Returns:
            EstimationResult with cardinality estimates
        """
        # Get all virtual column names (built-in + user-defined)
        virtual_columns = self._get_virtual_column_names(query_desc)
        
        # Filter out dimensions that are virtual columns
        continuous_dims = [
            d for d in query_desc.dimensions 
            if d.flavour == 'continuous' and d.field not in virtual_columns
        ]
        
        if not continuous_dims:
            # Check if we filtered out virtual columns
            all_continuous = [d for d in query_desc.dimensions if d.flavour == 'continuous']
            if all_continuous:
                logger.info(
                    "Skipping DuckDB estimation: all %s continuous dimensions are virtual columns",
                    len(all_continuous)
                )
            else:
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
            sql = estimation_query.get_sql(quote_char='"')
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
                f"DuckDB estimation: {total_rows} total rows, "
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
        Build the estimation query using DuckDB functions.
        
        Query structure:
        SELECT 
            count(*) as total_rows,
            approx_count_distinct(ROW(dim1, dim2, ...)) as unique_pairs
        FROM table
        WHERE [filters...]
        
        Note: DuckDB supports ROW() constructor for tuple-like values
        """
        from pypika.functions import Count
        
        # Build the unique count expression
        if self.use_exact:
            # For exact count, we need to use a subquery with DISTINCT
            # This is more complex, so for now we'll use the approximate method
            # and just log a warning
            logger.warning("Exact counting not yet implemented for DuckDB, using approximate")
        
        # Build ROW of dimension fields for multi-column distinctness
        if len(continuous_dims) > 1:
            # Multiple dimensions: approx_count_distinct(ROW(x, y, ...))
            # We'll construct this using raw SQL since pypika doesn't have native ROW support
            from pypika.terms import Term
            
            class RowTerm(Term):
                """Custom term for ROW constructor."""
                def __init__(self, *fields):
                    super().__init__()
                    self.fields = fields
                
                def get_sql(self, **kwargs):
                    field_sql = ','.join(f.get_sql(**kwargs) for f in self.fields)
                    return f'ROW({field_sql})'
            
            tuple_args = [getattr(table, d.field) for d in continuous_dims]
            row_expr = RowTerm(*tuple_args)
            unique_count = ApproxCountDistinctFunction(row_expr).as_('unique_pairs')
        else:
            # Single dimension: approx_count_distinct(x)
            unique_count = ApproxCountDistinctFunction(
                getattr(table, continuous_dims[0].field)
            ).as_('unique_pairs')
        
        # Build query
        estimation_query = (
            Query.from_(table)
            .select(
                Count('*').as_('total_rows'),
                unique_count
            )
        )
        
        # Get all virtual column names (built-in + user-defined)
        virtual_columns = self._get_virtual_column_names(query_desc)
        
        if query_desc.filters:
            from backend.services.query_service import QueryService
            query_service = QueryService()
            
            for filter_item in query_desc.filters:
                # Skip filters on virtual columns that don't exist in the actual table
                if filter_item.field in virtual_columns:
                    logger.debug("Skipping filter on virtual column '%s' for estimation query", filter_item.field)
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
