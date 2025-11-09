"""Main query optimizer that coordinates optimization strategies."""

import logging
from typing import List, Optional
from pypika import Query, Table

from backend.models.query import QueryDescription, OptimizationHints, OptimizationOverride
from backend.connectors.base import BaseConnector
from .config import OptimizerConfig
from .strategies.base import OptimizationStrategy, OptimizationMetadata
from .estimators.base import ResultSizeEstimator, BasicEstimator
from .estimators.clickhouse import ClickHouseEstimator
from .estimators.duckdb import DuckDBEstimator
from .strategy_planner import StrategyPlanner
from .table_size_detector import SmallTableDetector

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
        
        connector_class = connector.__class__.__name__ if connector else ''
        if 'clickhouse' in connector_class.lower():
            self.db_type = 'clickhouse'
        elif 'duckdb' in connector_class.lower() or 'file' in connector_class.lower():
            self.db_type = 'duckdb'
        else:
            self.db_type = 'generic'
        
        # Initialize estimator based on database type
        self.estimator = self._create_estimator()
        self._small_table_detector = SmallTableDetector(
            config=self.config,
            connector=self.connector,
            logger=logger,
        )
        self._strategy_planner = StrategyPlanner(
            config=self.config,
            connector=self.connector,
            estimator=self.estimator,
            db_type=self.db_type,
            logger=logger,
        )
    
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
        override = self._small_table_detector.check(query_desc)
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
            strategies = self._strategy_planner.create_from_hints(query_desc, hints)
        else:
            logger.info("No hints provided - using default behavior based on query structure")
            strategies = self._strategy_planner.create_from_query_structure(query_desc)
            hints = None  # We'll track that no hints were provided
        
        return OptimizationPlan(
            strategies=strategies,
            override=None,
            hints_used=hints
        )
    
