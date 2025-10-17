"""Main query optimizer that coordinates optimization strategies."""

import logging
from typing import List, Optional, Dict
from pypika import Query, Table

from backend.models.query import QueryDescription
from backend.connectors.base import BaseConnector
from .config import OptimizerConfig
from .strategies.base import OptimizationStrategy, OptimizationMetadata
from .strategies.distinct_pairs import DistinctPairStrategy
from .strategies.discrete_dedup import DiscreteDeduplicationStrategy
from .strategies.adaptive_rounding import AdaptiveRoundingStrategy
from .strategies.category_dedup import CategoryDeduplicationStrategy
from .estimators.base import ResultSizeEstimator, BasicEstimator
from .estimators.clickhouse import ClickHouseEstimator
from .estimators.duckdb import DuckDBEstimator

logger = logging.getLogger(__name__)


class OptimizationPlan:
    """Plan containing strategies to apply and metadata."""
    
    def __init__(self, strategies: List[OptimizationStrategy]):
        self.strategies = sorted(strategies, key=lambda s: s.priority)
        self.metadata: List[OptimizationMetadata] = []
    
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
    
    def create_plan(self, query_desc: QueryDescription) -> OptimizationPlan:
        """
        Analyze query and create optimization plan.
        
        Args:
            query_desc: The query description to optimize
            
        Returns:
            OptimizationPlan with strategies to apply
        """
        strategies = []
        
        # Detect chart type
        chart_type = self._detect_chart_type(query_desc)
        logger.info(f"Detected chart type: {chart_type}")
        
        if chart_type == 'scatter':
            strategies.extend(self._create_scatter_strategies(query_desc))
        elif chart_type == 'tick_strip':
            strategies.extend(self._create_tick_strip_strategies(query_desc))
        elif chart_type == 'discrete_only':
            strategies.extend(self._create_discrete_strategies(query_desc))
        
        return OptimizationPlan(strategies)
    
    def _detect_chart_type(self, query_desc: QueryDescription) -> str:
        """
        Detect visualization type from query description.
        
        Returns:
            One of: 'scatter', 'bar', 'line', 'tick_strip', 'discrete_only', 'unknown'
        """
        if not query_desc.dimensions:
            return 'unknown'
        
        has_measures = bool(query_desc.measures)
        continuous_dims = [d for d in query_desc.dimensions if d.flavour == 'continuous']
        discrete_dims = [d for d in query_desc.dimensions if d.flavour == 'discrete']
        
        if has_measures:
            # Aggregated query - bar chart or line chart
            return 'bar'
        
        # No measures - raw data query
        if len(continuous_dims) >= 2:
            # Check if continuous dims span both axes
            has_x = any(d.axis == 'x' for d in continuous_dims)
            has_y = any(d.axis == 'y' for d in continuous_dims)
            
            if has_x and has_y:
                return 'scatter'
            else:
                return 'tick_strip'
        
        # Pure discrete query (no continuous dims)
        if len(discrete_dims) > 0 and len(continuous_dims) == 0:
            return 'discrete_only'
        
        return 'unknown'
    
    def _create_scatter_strategies(
        self,
        query_desc: QueryDescription
    ) -> List[OptimizationStrategy]:
        """Create optimization strategies for scatter plots."""
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
                            threshold = threshold // 5
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
    
    def _create_tick_strip_strategies(
        self,
        query_desc: QueryDescription
    ) -> List[OptimizationStrategy]:
        """Create optimization strategies for tick strips."""
        strategies = []
        
        # Tick strips already use DISTINCT in QueryService
        # Could add sampling here if needed in the future
        
        return strategies
    
    def _create_discrete_strategies(
        self,
        query_desc: QueryDescription
    ) -> List[OptimizationStrategy]:
        """Create optimization strategies for discrete-only queries (e.g., filter values)."""
        strategies = []
        
        # Always deduplicate discrete-only queries
        if self.config.enable_distinct_pairs:  # Reuse this config option
            strategies.append(DiscreteDeduplicationStrategy(self.db_type, estimator=self.estimator))
        
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
