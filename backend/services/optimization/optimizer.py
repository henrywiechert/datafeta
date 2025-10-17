"""Main query optimizer that coordinates optimization strategies."""

import logging
from typing import List, Optional
from pypika import Query, Table

from backend.models.query import QueryDescription
from backend.connectors.base import BaseConnector
from .config import OptimizerConfig
from .strategies.base import OptimizationStrategy, OptimizationMetadata
from .strategies.distinct_pairs import DistinctPairStrategy
from .strategies.discrete_dedup import DiscreteDeduplicationStrategy
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
        
        # TODO: Add adaptive rounding in Phase 3
        # if self.config.enable_adaptive_rounding:
        #     try:
        #         estimate = self.estimator.estimate_size(query_desc)
        #         if estimate.unique_pairs and estimate.unique_pairs > self.config.rounding_threshold:
        #             strategies.append(AdaptiveRoundingStrategy(...))
        #     except Exception as e:
        #         logger.warning(f"Size estimation failed, skipping rounding: {e}")
        
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
