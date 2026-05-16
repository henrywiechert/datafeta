# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Base classes for result size estimation."""

import logging
from abc import ABC, abstractmethod
from typing import Optional

from backend.models.query import QueryDescription
from backend.connectors.base import BaseConnector

logger = logging.getLogger(__name__)


class EstimationResult:
    """Result from a size estimation query."""
    
    def __init__(
        self,
        total_rows: int,
        unique_pairs: Optional[int] = None,
        dimension_ranges: Optional[dict] = None
    ):
        self.total_rows = total_rows
        self.unique_pairs = unique_pairs
        self.dimension_ranges = dimension_ranges or {}
    
    def get_range(self, field: str) -> Optional[tuple]:
        """Get (min, max) range for a field."""
        return self.dimension_ranges.get(field)


class ResultSizeEstimator(ABC):
    """Base class for database-specific size estimators."""
    
    def __init__(self, connector: BaseConnector):
        self.connector = connector
    
    @abstractmethod
    def estimate_size(
        self,
        query_desc: QueryDescription,
        timeout_ms: int = 500
    ) -> EstimationResult:
        """
        Estimate result size for a query.
        
        Args:
            query_desc: Query description to estimate
            timeout_ms: Maximum time to spend on estimation
            
        Returns:
            EstimationResult with size and range information
        """
        pass


class BasicEstimator(ResultSizeEstimator):
    """
    Basic estimator using standard SQL.
    
    Works across most databases but may be slower than DB-specific methods.
    """
    
    def estimate_size(
        self,
        query_desc: QueryDescription,
        timeout_ms: int = 500
    ) -> EstimationResult:
        """Execute estimation query using COUNT(DISTINCT ...)."""
        
        continuous_dims = [d for d in query_desc.dimensions if d.flavour == 'continuous']
        
        if len(continuous_dims) < 2:
            return EstimationResult(total_rows=0)
        
        # Build estimation query
        fields = [d.field for d in continuous_dims[:2]]  # First two continuous dims
        
        # Get table reference
        if query_desc.target_database:
            table_ref = f"`{query_desc.target_database}`.`{query_desc.target_table}`"
        else:
            table_ref = f"`{query_desc.target_table}`"
        
        # Build WHERE clause for non-null values
        where_clauses = [f"`{f}` IS NOT NULL" for f in fields]
        where_sql = " AND ".join(where_clauses)
        
        # Build estimation SQL
        estimation_sql = f"""
        SELECT 
            COUNT(*) as total_rows,
            MIN(`{fields[0]}`) as x_min,
            MAX(`{fields[0]}`) as x_max,
            MIN(`{fields[1]}`) as y_min,
            MAX(`{fields[1]}`) as y_max
        FROM {table_ref}
        WHERE {where_sql}
        """
        
        try:
            columns, rows = self.connector.fetch_data(estimation_sql)
            
            if not rows:
                return EstimationResult(total_rows=0)
            
            result = rows[0]
            
            return EstimationResult(
                total_rows=result.get('total_rows', 0),
                unique_pairs=None,  # Can't easily estimate with basic SQL
                dimension_ranges={
                    fields[0]: (result.get('x_min'), result.get('x_max')),
                    fields[1]: (result.get('y_min'), result.get('y_max'))
                }
            )
            
        except Exception as e:
            logger.warning(f"Estimation query failed: {e}")
            return EstimationResult(total_rows=0)
