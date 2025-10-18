"""Main query optimizer that coordinates optimization strategies."""

import logging
from typing import List, Optional, Dict, Any
from pypika import Query, Table

from backend.models.query import QueryDescription, OptimizationHints, OptimizationOverride
from backend.connectors.base import BaseConnector
from .config import OptimizerConfig
from .strategies.base import OptimizationStrategy, OptimizationMetadata
from .strategies.distinct_pairs import DistinctPairStrategy
from .strategies.adaptive_rounding import AdaptiveRoundingStrategy
from .strategies.category_dedup import CategoryDeduplicationStrategy
from .estimators.base import ResultSizeEstimator, BasicEstimator
from .estimators.clickhouse import ClickHouseEstimator
from .estimators.duckdb import DuckDBEstimator

logger = logging.getLogger(__name__)


class OptimizationPlan:
    """Plan containing strategies to apply and metadata."""
    
    def __init__(
        self, 
        strategies: List[OptimizationStrategy],
        override: Optional[OptimizationOverride] = None,
        hints_used: Optional[OptimizationHints] = None
    ):
        self.strategies = sorted(strategies, key=lambda s: s.priority)
        self.metadata: List[OptimizationMetadata] = []
        self.override = override
        self.hints_used = hints_used
    
    def apply(self, query: Query, query_desc: QueryDescription, table: Table) -> Query:
        """Apply all strategies in order."""
        optimized_query = query
        
        for strategy in self.strategies:
            if strategy.can_apply(query_desc):
                logger.info(f"Applying optimization: {strategy.__class__.__name__}")
                optimized_query = strategy.apply(optimized_query, query_desc, table)
                self.metadata.append(strategy.get_metadata())
        
        return optimized_query
    
    def get_metadata_summary(self) -> List[dict]:
        """Get summary of all applied optimizations."""
        return [meta.to_dict() for meta in self.metadata]


class QueryOptimizer:
    """
    Analyzes queries and applies optimization strategies.
    
    Usage:
        optimizer = QueryOptimizer(connector, config)
        plan = optimizer.create_plan(query_desc)
        optimized_query = plan.apply(query, query_desc, table)
    """
    
    def __init__(
        self,
        connector: Optional[BaseConnector] = None,
        config: Optional[OptimizerConfig] = None
    ):
        self.connector = connector
        self.config = config or OptimizerConfig()
        self.db_type = getattr(connector, 'db_type', 'clickhouse') if connector else 'clickhouse'
        
        # Initialize estimator based on database type
        self.estimator = self._create_estimator()
    
    def _create_estimator(self) -> Optional[ResultSizeEstimator]:
        """Create appropriate estimator for database type."""
        if not self.connector:
            return None
        
        # Detect connector type and create appropriate estimator
        connector_class = self.connector.__class__.__name__
        
        if 'clickhouse' in connector_class.lower():
            logger.info("Using ClickHouseEstimator for cardinality estimation")
            return ClickHouseEstimator(self.connector)
        elif 'duckdb' in connector_class.lower() or 'file' in connector_class.lower():
            # FileConnector uses DuckDB internally
            logger.info("Using DuckDBEstimator for cardinality estimation")
            return DuckDBEstimator(self.connector)
        else:
            logger.info(f"Using BasicEstimator for {connector_class}")
            return BasicEstimator(self.connector)
    
    def _check_table_size(self, query_desc: QueryDescription) -> Optional[OptimizationOverride]:
        """
        Quick check if table is small enough to skip all optimizations.
        
        Uses a fast COUNT(*) query (often cached by DB) to determine if
        the table is small enough that optimizations would add more overhead
        than they save.
        
        Args:
            query_desc: The query description
            
        Returns:
            OptimizationOverride if table is small, None otherwise
        """
        if not self.config.enable_small_table_detection:
            logger.debug("Small table detection disabled")
            return None
        
        if not self.connector:
            logger.warning("No connector available for table size check")
            return None
        
        try:
            # Build table reference
            if query_desc.target_database:
                table_ref = f"{query_desc.target_database}.{query_desc.target_table}"
            else:
                table_ref = query_desc.target_table
            
            # Fast COUNT(*) query - usually cached by database
            count_query = f"SELECT COUNT(*) as row_count FROM {table_ref}"
            
            logger.debug(f"Checking table size with: {count_query}")
            result = self.connector.execute_query(count_query)
            
            if not result or len(result) == 0:
                logger.warning("Table size check returned no results")
                return None
            
            row_count = result[0].get('row_count', 0)
            
            # Get column count from query description
            column_count = len(query_desc.dimensions) + len(query_desc.measures)
            
            # Check if below threshold
            if row_count < self.config.small_table_threshold:
                logger.info(
                    f"✅ Small table detected: {row_count:,} rows < {self.config.small_table_threshold:,} threshold. "
                    f"Skipping all optimizations to avoid overhead."
                )
                
                return OptimizationOverride(
                    skip_all_optimizations=True,
                    reason="table_too_small",
                    table_stats={
                        "row_count": row_count,
                        "column_count": column_count,
                        "threshold": self.config.small_table_threshold
                    }
                )
            
            logger.info(f"Table size: {row_count:,} rows (>= threshold {self.config.small_table_threshold:,})")
            return None
            
        except Exception as e:
            logger.warning(f"Failed to check table size: {e}. Proceeding with optimization.", exc_info=True)
            return None
    
    def create_plan(self, query_desc: QueryDescription) -> OptimizationPlan:
        """
        Analyze query and create optimization plan.
        
        Priority order:
        1. Check for backend override (small table detection)
        2. Use frontend hints if provided
        3. Fall back to defaults based on query structure
        
        Args:
            query_desc: The query description to optimize
            
        Returns:
            OptimizationPlan with strategies to apply
        """
        # PRIORITY 1: Check if table is too small for optimizations
        override = self._check_table_size(query_desc)
        if override and override.skip_all_optimizations:
            logger.info("⚡ Returning empty optimization plan due to backend override")
            return OptimizationPlan(
                strategies=[],
                override=override,
                hints_used=query_desc.optimization_hints  # Keep for debugging
            )
        
        # PRIORITY 2: Get optimization hints (from frontend or generate defaults)
        hints = query_desc.optimization_hints
        if hints:
            logger.info("Using optimization hints from frontend")
            strategies = self._create_strategies_from_hints(query_desc, hints)
        else:
            logger.info("No hints provided - using default behavior based on query structure")
            strategies = self._create_strategies_from_query_structure(query_desc)
            hints = None  # We'll track that no hints were provided
        
        return OptimizationPlan(
            strategies=strategies,
            override=None,
            hints_used=hints
        )
    
    def _create_strategies_from_query_structure(self, query_desc: QueryDescription) -> List[OptimizationStrategy]:
        """
        Create strategies based on query structure (backward compatibility).
        
        This is the default behavior when no hints are provided.
        """
        strategies = []
        
        has_measures = bool(query_desc.measures)
        continuous_dims = [d for d in query_desc.dimensions if d.flavour == 'continuous']
        discrete_dims = [d for d in query_desc.dimensions if d.flavour == 'discrete']
        
        if has_measures:
            # Aggregated query - no deduplication needed (GROUP BY handles it)
            logger.info(f"Aggregated query with {len(query_desc.measures)} measures - no deduplication needed")
        else:
            # Raw data query - always deduplicate
            logger.info(f"Raw data query with {len(continuous_dims)} continuous + {len(discrete_dims)} discrete dims")
            
            if len(continuous_dims) >= 2:
                # Multiple continuous dimensions - apply scatter plot optimizations
                strategies.extend(self._create_multi_continuous_strategies(query_desc))
            elif len(continuous_dims) >= 1 or len(discrete_dims) >= 1:
                # Single dimension or discrete only - apply simple deduplication
                strategies.extend(self._create_simple_dedup_strategies(query_desc))
        
        return strategies
    
    def _create_strategies_from_hints(
        self, 
        query_desc: QueryDescription, 
        hints: OptimizationHints
    ) -> List[OptimizationStrategy]:
        """
        Create strategies based on explicit optimization hints from frontend.
        
        This is the new behavior when hints are provided.
        """
        strategies = []
        
        # Check optimization level first
        if hints.optimization_level == 'none':
            logger.info("Optimization level set to 'none' - skipping all optimizations")
            return strategies
        
        # Apply DISTINCT if enabled
        if hints.enable_distinct:
            logger.info("Hints request DISTINCT optimization")
            if self.config.enable_distinct_pairs:
                strategies.append(DistinctPairStrategy(self.db_type, estimator=self.estimator))
            else:
                logger.warning("DISTINCT requested by hints but disabled in config")
        
        # Apply rounding if enabled
        if hints.enable_rounding:
            logger.info("Hints request rounding optimization")
            if self.config.enable_adaptive_rounding:
                # Use hint threshold or fall back to config
                threshold = hints.rounding_threshold or self.config.rounding_threshold
                
                # For hints-based optimization, we still check if rounding is beneficial
                # by looking at continuous dimensions
                continuous_dims = [d for d in query_desc.dimensions if d.flavour == 'continuous']
                if len(continuous_dims) >= 2:
                    # Apply the multi-continuous strategies which include rounding
                    # We'll need to refactor this to be more modular
                    strategies.extend(self._create_multi_continuous_strategies(query_desc))
                else:
                    logger.info("Rounding requested but query doesn't have multiple continuous dims")
            else:
                logger.warning("Rounding requested by hints but disabled in config")
        
        # Note: Sampling and binning can be added here in future
        if hints.enable_sampling:
            logger.info("Sampling requested but not yet implemented")
        
        if hints.enable_binning:
            logger.info("Binning requested but not yet implemented")
        
        return strategies
    
    def _create_simple_dedup_strategies(
        self,
        query_desc: QueryDescription
    ) -> List[OptimizationStrategy]:
        """
        Create deduplication strategies for simple queries (single dimension or discrete only).
        
        Always applies DISTINCT to remove duplicate values.
        """
        strategies = []
        
        # Always apply DISTINCT for raw data queries
        if self.config.enable_distinct_pairs:
            from backend.services.optimization.strategies.distinct_pairs import DistinctPairStrategy
            strategies.append(DistinctPairStrategy(self.db_type, estimator=self.estimator))
            logger.debug("Added DISTINCT strategy for deduplication")
        
        return strategies
    
    def _create_multi_continuous_strategies(
        self,
        query_desc: QueryDescription
    ) -> List[OptimizationStrategy]:
        """
        Create optimization strategies for queries with multiple continuous dimensions.
        
        Applies:
        - DISTINCT to remove duplicate (x,y) pairs
        - Adaptive rounding if dataset is large
        - Category deduplication if discrete dimensions present
        """
        strategies = []
        
        # Always apply DISTINCT for scatter pairs
        if self.config.enable_distinct_pairs:
            # Pass estimator to strategy for accurate reduction estimation
            strategies.append(DistinctPairStrategy(self.db_type, estimator=self.estimator))
        
        # Check if we'll need category deduplication
        # If so, we should be more aggressive with rounding since discrete dims multiply row count
        category_strategy = CategoryDeduplicationStrategy(self.db_type, estimator=self.estimator)
        will_use_category_dedup = category_strategy.can_apply(query_desc)
        
        # Apply adaptive rounding if enabled and dataset is still large
        if self.config.enable_adaptive_rounding:
            if not self.connector:
                logger.warning("Adaptive rounding enabled but no connector available")
            else:
                try:
                    # Get ACTUAL count of unique pairs with current filters
                    # This is more accurate than estimation, especially with filters
                    logger.info("=" * 60)
                    logger.info("ROUNDING DECISION: Getting actual count...")
                    unique_count = self._get_actual_unique_pair_count(query_desc)
                    
                    if unique_count is None:
                        # Fall back to estimation if actual count fails
                        logger.warning("⚠️  Failed to get actual count, falling back to estimation")
                        if self.estimator:
                            estimate = self.estimator.estimate_size(query_desc)
                            unique_count = estimate.unique_pairs or estimate.total_rows
                            logger.info(f"📊 Estimated unique pairs (fallback): {unique_count}")
                        else:
                            logger.error("❌ No estimator available either, CANNOT determine if rounding needed!")
                            unique_count = None
                    else:
                        logger.info(f"✅ Actual unique pair count: {unique_count}")
                    
                    if unique_count is not None:
                        # When category dedup is needed, apply rounding more aggressively
                        # The count represents unique (x,y) pairs after filters
                        threshold = self.config.rounding_threshold
                        if will_use_category_dedup:
                            # Use a lower threshold (1/5th) when discrete dimensions are present
                            threshold = threshold // 2
                            logger.info(f"🎨 Category dedup detected - using lower threshold: {threshold}")
                        else:
                            logger.info(f"📏 Using standard threshold: {threshold}")
                        
                        # Apply rounding if still above threshold
                        if unique_count > threshold:
                            logger.info(
                                f"✅ APPLYING ROUNDING: {unique_count} > {threshold}"
                            )
                            logger.info("=" * 60)
                            
                            # Fetch dimension ranges for rounding calculation
                            dimension_ranges = self._fetch_dimension_ranges(query_desc)
                            
                            strategies.append(
                                AdaptiveRoundingStrategy(
                                    db_type=self.db_type,
                                    estimator=self.estimator,
                                    target_buckets=self.config.target_buckets,
                                    dimension_ranges=dimension_ranges
                                )
                            )
                        else:
                            logger.info(
                                f"❌ SKIPPING ROUNDING: {unique_count} <= {threshold}"
                            )
                            logger.info("=" * 60)
                    else:
                        logger.error("❌ Could not determine unique count - SKIPPING ROUNDING")
                        logger.info("=" * 60)
                except Exception as e:
                    logger.warning(f"Size estimation failed, skipping rounding: {e}", exc_info=True)
        
        # Apply category deduplication if we have discrete dimensions (e.g., color field)
        # This removes duplicate (x,y) pairs across categories
        if will_use_category_dedup:
            logger.info("Adding category deduplication strategy to remove duplicate (x,y) pairs")
            strategies.append(category_strategy)
        
        return strategies
    
    def _get_actual_unique_pair_count(self, query_desc: QueryDescription) -> Optional[int]:
        """
        Execute an actual count query to determine the number of unique pairs.
        This is more accurate than estimation, especially when filters are applied.
        
        Args:
            query_desc: Query description with filters
            
        Returns:
            Count of unique (x,y) pairs, or None if query fails
        """
        from pypika import Query, Table
        from pypika.functions import Count
        
        if not self.connector:
            logger.warning("No connector available for actual count")
            return None
        
        continuous_dims = [d for d in query_desc.dimensions if d.flavour == 'continuous']
        if len(continuous_dims) < 2:
            logger.warning(f"Need at least 2 continuous dimensions for count, got {len(continuous_dims)}")
            return None
        
        logger.info(f"📊 Getting actual count for {len(continuous_dims)} continuous dimensions...")
        
        try:
            # Build a query to count unique pairs with current filters
            if self.db_type == 'clickhouse' and query_desc.target_database:
                table = Table(query_desc.target_table, schema=query_desc.target_database)
            else:
                table = Table(query_desc.target_table)
            
            count_query = Query.from_(table)
            
            # Select the continuous dimensions (needed for GROUP BY)
            for dim in continuous_dims:
                field_term = getattr(table, dim.field)
                count_query = count_query.select(field_term)
            
            # Add WHERE filters
            for filter_obj in query_desc.filters:
                field_term = getattr(table, filter_obj.field)
                
                if filter_obj.operator == '>=':
                    count_query = count_query.where(field_term >= filter_obj.value)
                elif filter_obj.operator == '<=':
                    count_query = count_query.where(field_term <= filter_obj.value)
                elif filter_obj.operator == '=':
                    count_query = count_query.where(field_term == filter_obj.value)
                elif filter_obj.operator == '!=':
                    count_query = count_query.where(field_term != filter_obj.value)
                elif filter_obj.operator == '>':
                    count_query = count_query.where(field_term > filter_obj.value)
                elif filter_obj.operator == '<':
                    count_query = count_query.where(field_term < filter_obj.value)
                elif filter_obj.operator == 'in':
                    count_query = count_query.where(field_term.isin(filter_obj.value))
                elif filter_obj.operator == 'not in':
                    count_query = count_query.where(field_term.notin(filter_obj.value))
            
            # Add NOT NULL filters for continuous dimensions
            for dim in continuous_dims:
                field_term = getattr(table, dim.field)
                count_query = count_query.where(field_term.isnotnull())
            
            # GROUP BY the continuous dimensions
            for dim in continuous_dims:
                field_term = getattr(table, dim.field)
                count_query = count_query.groupby(field_term)
            
            # We need to count the number of groups
            # In ClickHouse, we can use: SELECT COUNT(*) FROM (SELECT ... GROUP BY x, y)
            # Build the subquery SQL first, then wrap it
            subquery_sql = count_query.get_sql(quote_char='`')
            
            # Wrap in COUNT
            sql = f"SELECT COUNT(*) as unique_count FROM ({subquery_sql})"
            logger.info(f"Executing actual count query to determine if rounding needed...")
            logger.debug(f"Count SQL: {sql}")
            
            # Execute query
            columns, rows = self.connector.fetch_data(sql)
            
            if rows and len(rows) > 0:
                row = rows[0]
                # Try different ways to access the count value
                if isinstance(row, dict):
                    count = row.get('unique_count') or row.get('count(*)') or row.get('COUNT(*)')
                elif isinstance(row, (list, tuple)):
                    count = row[0]
                else:
                    count = row
                
                if count is not None:
                    logger.info(f"✅ Actual unique pair count: {count}")
                    return int(count)
                else:
                    logger.warning(f"Count query returned None. Row: {row}")
                    return None
            else:
                logger.warning("Count query returned no rows")
                return None
                
        except Exception as e:
            logger.error(f"Failed to get actual count: {e}", exc_info=True)
        
        return None
    
    def _fetch_dimension_ranges(self, query_desc: QueryDescription) -> Dict[str, tuple]:
        """
        Fetch min/max ranges for continuous dimensions.
        
        Args:
            query_desc: Query description with dimensions
            
        Returns:
            Dictionary mapping field names to (min, max) tuples
        """
        from pypika import Query, Table
        from pypika.functions import Min, Max
        
        ranges = {}
        continuous_dims = [d for d in query_desc.dimensions if d.flavour == 'continuous']
        
        if not continuous_dims or not self.connector:
            return ranges
        
        try:
            # Build a query to get MIN and MAX for all continuous dimensions
            if self.db_type == 'clickhouse' and query_desc.target_database:
                table = Table(query_desc.target_table, schema=query_desc.target_database)
            else:
                table = Table(query_desc.target_table)
            range_query = Query.from_(table)
            
            for dim in continuous_dims:
                field_term = getattr(table, dim.field)
                range_query = range_query.select(
                    Min(field_term).as_(f'min_{dim.field}'),
                    Max(field_term).as_(f'max_{dim.field}')
                )
            
            # Execute query
            sql = range_query.get_sql(quote_char='`')
            logger.debug(f"Fetching dimension ranges: {sql}")
            
            # Use fetch_data() which returns (columns, rows)
            columns, rows = self.connector.fetch_data(sql)
            
            if rows and len(rows) > 0:
                row = rows[0]
                for dim in continuous_dims:
                    min_key = f'min_{dim.field}'
                    max_key = f'max_{dim.field}'
                    
                    if min_key in row and max_key in row:
                        min_val = row[min_key]
                        max_val = row[max_key]
                        
                        if min_val is not None and max_val is not None:
                            ranges[dim.field] = (float(min_val), float(max_val))
                            logger.info(f"Range for {dim.field}: [{min_val}, {max_val}]")
            
        except Exception as e:
            logger.warning(f"Failed to fetch dimension ranges: {e}", exc_info=True)
        
        return ranges
