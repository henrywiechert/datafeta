# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
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
        extended_metadata: Optional[Dict[str, Any]] = None
    ) -> QueryResult:
        """
        Build a complete QueryResult from query execution results.
        
        Args:
            columns: Column names from query execution
            rows: Data rows from query execution
            sql_query: The executed SQL query string
            extended_metadata: Optional dict with keys:
                - 'optimizations': List of optimization metadata
                - 'hints_used': OptimizationHints that were used
                - 'override': OptimizationOverride if any
            
        Returns:
            QueryResult with all metadata populated
        """
        # Extract optimization metadata from extended_metadata dict
        optimization_metadata = []
        hints_used = None
        override = None
        
        if extended_metadata and isinstance(extended_metadata, dict):
            optimization_metadata = extended_metadata.get('optimizations', [])
            hints_used = extended_metadata.get('hints_used')
            override = extended_metadata.get('override')
        
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
            f"hints_used={hints_used is not None}, "
            f"override={override is not None}, "
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
            optimization_hints_used=hints_used,  # Now extracted from extended_metadata
            optimization_override=override,  # Now extracted from extended_metadata
            result_dimensions=result_dimensions
        )
