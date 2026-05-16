# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Component for determining and applying DISTINCT to queries."""

from typing import Any
import logging

from pypika import Query

from backend.models.query import QueryDescription


logger = logging.getLogger(__name__)


class DistinctApplier:
    """Responsible for determining when DISTINCT should be applied to queries.
    
    DISTINCT is applied for discrete-only dimension queries (e.g., filter panels)
    to ensure unique values are returned. It should NOT be applied when:
    - Query has measures (aggregation handles uniqueness)
    - Query uses category deduplication optimization
    - DISTINCT is already applied
    """

    def should_apply_distinct(
        self,
        query_desc: QueryDescription,
        use_category_dedup: bool,
        query: Query
    ) -> bool:
        """Determine if DISTINCT should be applied to the query.
        
        Args:
            query_desc: The query description
            use_category_dedup: Whether category deduplication optimization is used
            query: The PyPika query object to check if DISTINCT already applied
            
        Returns:
            True if DISTINCT should be applied, False otherwise
        """
        # Don't apply DISTINCT if query has measures (aggregation handles uniqueness)
        if query_desc.measures:
            return False

        # Force raw rows: never apply DISTINCT (used for local caching slices)
        if getattr(query_desc, "force_raw_rows", False):
            return False
        
        # Don't apply DISTINCT if no dimensions
        if not query_desc.dimensions:
            return False
        
        # Check for discrete vs continuous dimensions
        discrete_dims = [d for d in query_desc.dimensions if d.flavour == 'discrete']
        continuous_dims = [d for d in query_desc.dimensions if d.flavour == 'continuous']
        
        # Only apply DISTINCT for pure discrete queries (no continuous dims)
        if len(discrete_dims) == 0 or len(continuous_dims) > 0:
            return False
        
        # Don't apply if category deduplication is already being used
        if use_category_dedup:
            return False
        
        # Don't apply if DISTINCT is already set
        if query._distinct:
            return False
        
        return True

    def apply_if_needed(
        self,
        query: Query,
        query_desc: QueryDescription,
        use_category_dedup: bool
    ) -> Query:
        """Apply DISTINCT to query if needed based on business rules.
        
        Args:
            query: The PyPika query to potentially modify
            query_desc: The query description
            use_category_dedup: Whether category deduplication optimization is used
            
        Returns:
            Modified query with DISTINCT applied if needed, otherwise original query
        """
        if self.should_apply_distinct(query_desc, use_category_dedup, query):
            logger.info("Applied DISTINCT to discrete-only query for filter deduplication")
            return query.distinct()
        
        return query
