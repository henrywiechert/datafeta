"""Service for building QueryResult responses with optimization metadata."""

import logging
from typing import List, Dict, Any, Optional, Tuple

from backend.models.query import QueryResult, ResultDimensions

logger = logging.getLogger(__name__)


class QueryResultBuilder:
    """Builds QueryResult objects with optimization metadata and statistics."""
    
    @staticmethod
    def build_result(
        columns: List[str],
        rows: List[Any],
        sql_query: str,
        extended_metadata: Optional[List[Dict[str, Any]]] = None
    ) -> QueryResult:
        """
        Build a complete QueryResult from query execution results.
        
        Args:
            columns: Column names from query execution
            rows: Data rows from query execution
            sql_query: The executed SQL query string
            extended_metadata: Optional optimization metadata from query translation
            
        Returns:
            QueryResult with all metadata populated
        """
        # Extract optimization metadata
        optimization_metadata = []
        if extended_metadata and isinstance(extended_metadata, list):
            optimization_metadata = extended_metadata
        
        # Calculate reduction factor if optimization was applied
        reduction_factor = None
        original_estimate = None
        
        if optimization_metadata:
            # Look for reduction factor in metadata
            for opt in optimization_metadata:
                if opt.get('reduction'):
                    reduction_factor = opt['reduction']
                    break
        
        # Calculate result dimensions
        row_count = len(rows)
        column_count = len(columns)
        result_dimensions = ResultDimensions(
            rows=row_count,
            columns=column_count,
            size_display=f"{row_count:,} × {column_count}"
        )
        
        logger.info(
            f"Built query result: {result_dimensions.size_display}, "
            f"optimizations={len(optimization_metadata)}, "
            f"reduction={reduction_factor}"
        )
        
        return QueryResult(
            columns=columns,
            rows=rows,
            row_count=row_count,
            query_sql=sql_query,
            error=None,
            optimizations_applied=optimization_metadata if optimization_metadata else None,
            original_estimate=original_estimate,
            reduction_factor=reduction_factor,
            optimization_hints_used=None,  # Not returned separately anymore
            optimization_override=None,  # Not returned separately anymore
            result_dimensions=result_dimensions
        )
