# Query Optimization Implementation Guide

This document provides detailed implementation specifications for the query optimization layer proposed in `QUERY_OPTIMIZATION_PROPOSAL.md`.

---

## Table of Contents

1. [Directory Structure](#directory-structure)
2. [Core Implementation](#core-implementation)
3. [Strategy Implementations](#strategy-implementations)
4. [Database-Specific Adaptations](#database-specific-adaptations)
5. [Integration with Existing Code](#integration-with-existing-code)
6. [Configuration Management](#configuration-management)
7. [Testing](#testing)
8. [Migration Path](#migration-path)

---

## Directory Structure

```
backend/
├── services/
│   ├── query_service.py           # Existing - Modified
│   ├── connection_service.py      # Existing - No changes
│   └── optimization/               # NEW
│       ├── __init__.py
│       ├── optimizer.py            # Main QueryOptimizer class
│       ├── strategies/
│       │   ├── __init__.py
│       │   ├── base.py             # Base strategy interface
│       │   ├── distinct_pairs.py   # DISTINCT optimization
│       │   ├── adaptive_rounding.py # Rounding optimization
│       │   └── sampling.py         # Enhanced sampling (refactor existing)
│       ├── estimators/
│       │   ├── __init__.py
│       │   ├── base.py             # Base estimator interface
│       │   ├── clickhouse.py       # ClickHouse-specific estimation
│       │   └── duckdb.py           # DuckDB-specific estimation
│       └── config.py               # OptimizerConfig class
```

---

## Core Implementation

### 1. Base Strategy Interface (`backend/services/optimization/strategies/base.py`)

```python
"""Base classes for optimization strategies."""

from abc import ABC, abstractmethod
from typing import Any, Dict, Optional
from pypika import Query
from backend.models.query import QueryDescription


class OptimizationMetadata:
    """Metadata about applied optimization."""
    
    def __init__(
        self,
        strategy_name: str,
        estimated_reduction: float,
        parameters: Optional[Dict[str, Any]] = None
    ):
        self.strategy_name = strategy_name
        self.estimated_reduction = estimated_reduction
        self.parameters = parameters or {}
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'strategy': self.strategy_name,
            'reduction': self.estimated_reduction,
            'parameters': self.parameters
        }


class OptimizationStrategy(ABC):
    """Base class for all optimization strategies."""
    
    def __init__(self, db_type: str = 'clickhouse'):
        self.db_type = db_type
    
    @abstractmethod
    def can_apply(self, query_desc: QueryDescription) -> bool:
        """
        Check if this strategy can be applied to the query.
        
        Args:
            query_desc: The query description to check
            
        Returns:
            True if strategy is applicable
        """
        pass
    
    @abstractmethod
    def apply(self, query: Query, query_desc: QueryDescription, table: Any) -> Query:
        """
        Apply the optimization to the query.
        
        Args:
            query: The pypika Query object to modify
            query_desc: The original query description
            table: The pypika Table object
            
        Returns:
            Modified Query object
        """
        pass
    
    @abstractmethod
    def get_metadata(self) -> OptimizationMetadata:
        """
        Get metadata about this optimization.
        
        Returns:
            OptimizationMetadata describing the optimization
        """
        pass
    
    @property
    def priority(self) -> int:
        """
        Priority for applying strategies (lower = earlier).
        Default: 50 (medium priority)
        """
        return 50


class EstimationResult:
    """Result from a size estimation query."""
    
    def __init__(
        self,
        total_rows: int,
        unique_pairs: Optional[int] = None,
        dimension_ranges: Optional[Dict[str, tuple]] = None
    ):
        self.total_rows = total_rows
        self.unique_pairs = unique_pairs
        self.dimension_ranges = dimension_ranges or {}
    
    def get_range(self, field: str) -> Optional[tuple]:
        """Get (min, max) range for a field."""
        return self.dimension_ranges.get(field)
```

---

### 2. Query Optimizer (`backend/services/optimization/optimizer.py`)

```python
"""Main query optimizer that coordinates optimization strategies."""

import logging
from typing import List, Optional
from pypika import Query, Table

from backend.models.query import QueryDescription
from backend.connectors.base import BaseConnector
from .config import OptimizerConfig
from .strategies.base import OptimizationStrategy, OptimizationMetadata
from .strategies.distinct_pairs import DistinctPairStrategy
from .strategies.adaptive_rounding import AdaptiveRoundingStrategy
from .estimators.base import ResultSizeEstimator
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
        connector: BaseConnector,
        config: Optional[OptimizerConfig] = None
    ):
        self.connector = connector
        self.config = config or OptimizerConfig()
        self.db_type = getattr(connector, 'db_type', 'clickhouse')
        
        # Initialize estimator based on database type
        self.estimator = self._create_estimator()
    
    def _create_estimator(self) -> ResultSizeEstimator:
        """Create appropriate estimator for database type."""
        if self.db_type == 'clickhouse':
            return ClickHouseEstimator(self.connector)
        elif self.db_type == 'duckdb':
            return DuckDBEstimator(self.connector)
        else:
            # Fallback to basic estimator
            from .estimators.base import BasicEstimator
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
        
        return OptimizationPlan(strategies)
    
    def _detect_chart_type(self, query_desc: QueryDescription) -> str:
        """
        Detect visualization type from query description.
        
        Returns:
            One of: 'scatter', 'bar', 'line', 'tick_strip', 'unknown'
        """
        if not query_desc.dimensions:
            return 'unknown'
        
        has_measures = bool(query_desc.measures)
        continuous_dims = [d for d in query_desc.dimensions if d.flavour == 'continuous']
        
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
        
        return 'unknown'
    
    def _create_scatter_strategies(
        self,
        query_desc: QueryDescription
    ) -> List[OptimizationStrategy]:
        """Create optimization strategies for scatter plots."""
        strategies = []
        
        # Always apply DISTINCT for scatter pairs
        if self.config.enable_distinct_pairs:
            strategies.append(DistinctPairStrategy(self.db_type))
        
        # Check if adaptive rounding is needed
        if self.config.enable_adaptive_rounding:
            try:
                estimate = self.estimator.estimate_size(query_desc)
                
                if estimate.unique_pairs and estimate.unique_pairs > self.config.rounding_threshold:
                    logger.info(
                        f"Unique pairs ({estimate.unique_pairs}) exceeds threshold "
                        f"({self.config.rounding_threshold}), adding rounding strategy"
                    )
                    strategies.append(
                        AdaptiveRoundingStrategy(
                            db_type=self.db_type,
                            estimate=estimate,
                            target_buckets=self.config.target_buckets
                        )
                    )
            except Exception as e:
                logger.warning(f"Size estimation failed, skipping rounding: {e}")
        
        return strategies
    
    def _create_tick_strip_strategies(
        self,
        query_desc: QueryDescription
    ) -> List[OptimizationStrategy]:
        """Create optimization strategies for tick strips."""
        strategies = []
        
        # Tick strips already use DISTINCT in QueryService
        # Could add sampling here if needed
        
        return strategies
```

---

### 3. Distinct Pairs Strategy (`backend/services/optimization/strategies/distinct_pairs.py`)

```python
"""Strategy for applying DISTINCT to scatter plot coordinate pairs."""

import logging
from pypika import Query, Table

from backend.models.query import QueryDescription
from .base import OptimizationStrategy, OptimizationMetadata

logger = logging.getLogger(__name__)


class DistinctPairStrategy(OptimizationStrategy):
    """
    Apply DISTINCT to get unique coordinate pairs for scatter plots.
    
    This eliminates duplicate (x, y) points that provide no additional
    visual information but significantly increase dataset size.
    """
    
    def __init__(self, db_type: str = 'clickhouse'):
        super().__init__(db_type)
        self.priority = 10  # Apply early
    
    def can_apply(self, query_desc: QueryDescription) -> bool:
        """
        Check if DISTINCT can be applied.
        
        Requires:
        - No measures (raw data query)
        - At least 2 continuous dimensions
        - Continuous dimensions on different axes (scatter plot)
        """
        if query_desc.measures:
            return False
        
        continuous_dims = [d for d in query_desc.dimensions if d.flavour == 'continuous']
        
        if len(continuous_dims) < 2:
            return False
        
        # Check if dimensions span both axes
        has_x = any(d.axis == 'x' for d in continuous_dims)
        has_y = any(d.axis == 'y' for d in continuous_dims)
        
        return has_x and has_y
    
    def apply(self, query: Query, query_desc: QueryDescription, table: Table) -> Query:
        """
        Apply DISTINCT to the query.
        
        Args:
            query: pypika Query object
            query_desc: Original query description
            table: pypika Table object
            
        Returns:
            Modified query with DISTINCT applied
        """
        # Simply call distinct() on the query
        optimized = query.distinct()
        
        logger.info("Applied DISTINCT to scatter plot query")
        
        return optimized
    
    def get_metadata(self) -> OptimizationMetadata:
        """Return metadata about this optimization."""
        return OptimizationMetadata(
            strategy_name='distinct_pairs',
            estimated_reduction=0.7,  # Typically 70% reduction
            parameters={}
        )
```

---

### 4. Adaptive Rounding Strategy (`backend/services/optimization/strategies/adaptive_rounding.py`)

```python
"""Strategy for applying adaptive rounding to reduce scatter plot density."""

import logging
import math
from typing import Dict, List
from pypika import Query, Table, Field
from pypika.functions import Round

from backend.models.query import QueryDescription, Dimension
from .base import OptimizationStrategy, OptimizationMetadata, EstimationResult

logger = logging.getLogger(__name__)


class AdaptiveRoundingStrategy(OptimizationStrategy):
    """
    Apply intelligent rounding based on data ranges.
    
    When scatter plots have >5000 unique pairs, this strategy:
    1. Analyzes data ranges for each dimension
    2. Calculates appropriate rounding precision
    3. Wraps SELECT fields with ROUND() functions
    4. Applies DISTINCT to deduplicate rounded values
    """
    
    def __init__(
        self,
        db_type: str = 'clickhouse',
        estimate: Optional[EstimationResult] = None,
        target_buckets: int = 100
    ):
        super().__init__(db_type)
        self.estimate = estimate
        self.target_buckets = target_buckets
        self.priority = 20  # Apply after DISTINCT
        self.precisions: Dict[str, float] = {}
    
    def can_apply(self, query_desc: QueryDescription) -> bool:
        """
        Check if rounding should be applied.
        
        Requires:
        - Estimation result available
        - No measures (raw data)
        - Continuous dimensions
        """
        if not self.estimate or query_desc.measures:
            return False
        
        continuous_dims = [d for d in query_desc.dimensions if d.flavour == 'continuous']
        return len(continuous_dims) >= 2
    
    def apply(self, query: Query, query_desc: QueryDescription, table: Table) -> Query:
        """
        Apply rounding to dimension fields.
        
        Modifies the SELECT clause to wrap fields in ROUND() expressions.
        """
        continuous_dims = [d for d in query_desc.dimensions if d.flavour == 'continuous']
        
        # Calculate rounding precision for each dimension
        self._calculate_precisions(continuous_dims)
        
        # Build new SELECT clause with rounded fields
        select_fields = []
        
        for dim in query_desc.dimensions:
            field_term = table[dim.field]
            
            if dim.flavour == 'continuous' and dim.field in self.precisions:
                # Apply rounding
                precision = self.precisions[dim.field]
                rounded = self._create_round_expression(field_term, precision)
                select_fields.append(rounded)
                
                logger.info(f"Rounding {dim.field} with precision {precision}")
            else:
                # No rounding for discrete dimensions
                select_fields.append(field_term)
        
        # Rebuild query with rounded fields
        optimized = Query.from_(table).select(*select_fields)
        
        # Copy WHERE clause if present
        if hasattr(query, '_wheres') and query._wheres:
            for criterion in query._wheres:
                optimized = optimized.where(criterion)
        
        # Apply DISTINCT to deduplicate rounded values
        optimized = optimized.distinct()
        
        return optimized
    
    def _calculate_precisions(self, dimensions: List[Dimension]) -> None:
        """
        Calculate appropriate rounding precision for each dimension.
        
        Uses the estimation result's dimension_ranges.
        """
        if not self.estimate or not self.estimate.dimension_ranges:
            logger.warning("No dimension ranges available for rounding calculation")
            return
        
        for dim in dimensions:
            dim_range = self.estimate.get_range(dim.field)
            
            if not dim_range:
                logger.warning(f"No range data for {dim.field}, skipping rounding")
                continue
            
            min_val, max_val = dim_range
            precision = self._calculate_precision(min_val, max_val)
            self.precisions[dim.field] = precision
    
    def _calculate_precision(self, min_val: float, max_val: float) -> float:
        """
        Calculate rounding precision based on data range.
        
        Returns a "nice" number like 0.01, 0.1, 1, 10, 100, etc.
        
        Args:
            min_val: Minimum value in data
            max_val: Maximum value in data
            
        Returns:
            Rounding precision (power of 10 or half-power)
        """
        data_range = max_val - min_val
        
        if data_range == 0:
            return 1
        
        # Calculate desired bucket size
        bucket_size = data_range / self.target_buckets
        
        # Round to nearest power of 10
        magnitude = 10 ** math.floor(math.log10(bucket_size))
        
        # Choose between 1x, 2x, 5x, or 10x the magnitude
        if bucket_size < 2 * magnitude:
            return magnitude
        elif bucket_size < 5 * magnitude:
            return 2 * magnitude
        else:
            return 5 * magnitude
    
    def _create_round_expression(self, field: Field, precision: float) -> Field:
        """
        Create ROUND() expression for a field.
        
        Formula: ROUND(field / precision) * precision
        
        Examples:
            precision=100: ROUND(price / 100) * 100
            precision=0.1: ROUND(price / 0.1) * 0.1
        """
        if self.db_type == 'clickhouse':
            # ClickHouse: ROUND(field / precision) * precision
            return Round(field / precision) * precision
        else:
            # Standard SQL
            return Round(field / precision) * precision
    
    def get_metadata(self) -> OptimizationMetadata:
        """Return metadata about this optimization."""
        return OptimizationMetadata(
            strategy_name='adaptive_rounding',
            estimated_reduction=0.35,
            parameters={
                'precisions': self.precisions,
                'target_buckets': self.target_buckets
            }
        )
```

---

### 5. Result Size Estimator (`backend/services/optimization/estimators/base.py`)

```python
"""Base classes for result size estimation."""

import logging
from abc import ABC, abstractmethod
from typing import Optional

from backend.models.query import QueryDescription
from backend.connectors.base import BaseConnector
from backend.services.optimization.strategies.base import EstimationResult

logger = logging.getLogger(__name__)


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
```

---

### 6. ClickHouse-Specific Estimator (`backend/services/optimization/estimators/clickhouse.py`)

```python
"""ClickHouse-specific result size estimator."""

import logging
from typing import Optional

from backend.models.query import QueryDescription
from backend.services.optimization.strategies.base import EstimationResult
from .base import ResultSizeEstimator

logger = logging.getLogger(__name__)


class ClickHouseEstimator(ResultSizeEstimator):
    """
    ClickHouse-specific estimator using uniq() and uniqCombined().
    
    These functions provide approximate distinct counts much faster
    than exact COUNT(DISTINCT ...).
    """
    
    def estimate_size(
        self,
        query_desc: QueryDescription,
        timeout_ms: int = 500
    ) -> EstimationResult:
        """
        Estimate result size using ClickHouse's uniq() function.
        
        uniq() uses HyperLogLog for approximate distinct counting.
        """
        continuous_dims = [d for d in query_desc.dimensions if d.flavour == 'continuous']
        
        if len(continuous_dims) < 2:
            return EstimationResult(total_rows=0)
        
        # Use first two continuous dimensions
        x_field = continuous_dims[0].field
        y_field = continuous_dims[1].field
        
        # Build table reference
        if query_desc.target_database:
            table_ref = f"`{query_desc.target_database}`.`{query_desc.target_table}`"
        else:
            table_ref = f"`{query_desc.target_table}`"
        
        # Build estimation SQL with ClickHouse-specific functions
        estimation_sql = f"""
        SELECT 
            COUNT(*) as total_rows,
            uniq(`{x_field}`, `{y_field}`) as unique_pairs,
            MIN(`{x_field}`) as x_min,
            MAX(`{x_field}`) as x_max,
            MIN(`{y_field}`) as y_min,
            MAX(`{y_field}`) as y_max
        FROM {table_ref}
        WHERE `{x_field}` IS NOT NULL AND `{y_field}` IS NOT NULL
        SETTINGS max_execution_time = {timeout_ms / 1000}
        """
        
        try:
            columns, rows = self.connector.fetch_data(estimation_sql)
            
            if not rows:
                return EstimationResult(total_rows=0)
            
            result = rows[0]
            
            return EstimationResult(
                total_rows=result.get('total_rows', 0),
                unique_pairs=result.get('unique_pairs', None),
                dimension_ranges={
                    x_field: (result.get('x_min'), result.get('x_max')),
                    y_field: (result.get('y_min'), result.get('y_max'))
                }
            )
            
        except Exception as e:
            logger.warning(f"ClickHouse estimation query failed: {e}")
            return EstimationResult(total_rows=0)
```

---

## Integration with QueryService

### Modified `backend/services/query_service.py`

```python
# Add imports at top
from backend.services.optimization.optimizer import QueryOptimizer
from backend.services.optimization.config import OptimizerConfig

class QueryService:
    
    def __init__(self, connector: Optional[BaseConnector] = None):
        self.connector = connector
        # Initialize optimizer if connector provided
        self.optimizer = None
        if connector:
            config = OptimizerConfig.from_env()
            self.optimizer = QueryOptimizer(connector, config)
    
    def translate_to_sql(
        self,
        query_desc: QueryDescription,
        table_name: str,
        db_type: str = 'clickhouse',
        with_sampling: bool = False,
        with_optimization: bool = True  # NEW parameter
    ) -> tuple[str, list[dict]]:  # Returns (sql, optimization_metadata)
        """
        Translates a QueryDescription object into a SQL string.
        
        Args:
            with_optimization: Whether to apply query optimizations
            
        Returns:
            Tuple of (SQL string, optimization metadata list)
        """
        # ... existing code for quote_char, table setup ...
        
        q = Query.from_(t)
        optimization_metadata = []
        
        # ... existing code for SELECT, WHERE, GROUP BY ...
        
        # Apply optimizations if enabled
        if with_optimization and self.optimizer:
            try:
                plan = self.optimizer.create_plan(query_desc)
                q = plan.apply(q, query_desc, t)
                optimization_metadata = plan.get_metadata_summary()
                
                logger.info(f"Applied {len(optimization_metadata)} optimizations")
            except Exception as e:
                logger.error(f"Optimization failed, falling back to unoptimized: {e}")
        
        # ... existing code for ORDER BY, LIMIT, OFFSET ...
        
        sql_string = q.get_sql(quote_char=quote_char)
        logger.info(f"Generated SQL ({db_type}): {sql_string}")
        
        return sql_string, optimization_metadata
```

---

## Configuration Management

### `backend/services/optimization/config.py`

```python
"""Configuration for query optimizer."""

import os
from dataclasses import dataclass
from typing import Optional


@dataclass
class OptimizerConfig:
    """Configuration for query optimizer."""
    
    # Enable/disable optimization types
    enable_distinct_pairs: bool = True
    enable_adaptive_rounding: bool = True
    enable_binning: bool = False  # Reserved for future
    
    # Thresholds
    rounding_threshold: int = 5000  # Apply rounding if more than N unique pairs
    binning_threshold: int = 10000  # Apply binning if more than N points
    
    # Rounding parameters
    target_buckets: int = 100  # Desired distinct values per dimension
    
    # Estimation settings
    use_approximate_count: bool = True
    estimation_timeout_ms: int = 500
    
    @classmethod
    def from_env(cls) -> 'OptimizerConfig':
        """Load configuration from environment variables."""
        return cls(
            enable_distinct_pairs=os.getenv('OPTIMIZER_ENABLE_DISTINCT_PAIRS', 'true').lower() == 'true',
            enable_adaptive_rounding=os.getenv('OPTIMIZER_ENABLE_ADAPTIVE_ROUNDING', 'true').lower() == 'true',
            rounding_threshold=int(os.getenv('OPTIMIZER_ROUNDING_THRESHOLD', '5000')),
            target_buckets=int(os.getenv('OPTIMIZER_TARGET_BUCKETS', '100')),
            estimation_timeout_ms=int(os.getenv('OPTIMIZER_ESTIMATION_TIMEOUT_MS', '500')),
        )
```

### Environment Variables (`.env`)

```bash
# Query Optimization Settings
OPTIMIZER_ENABLE_DISTINCT_PAIRS=true
OPTIMIZER_ENABLE_ADAPTIVE_ROUNDING=true
OPTIMIZER_ROUNDING_THRESHOLD=5000
OPTIMIZER_TARGET_BUCKETS=100
OPTIMIZER_ESTIMATION_TIMEOUT_MS=500
```

---

## API Response Updates

### Modified QueryResult Model

```python
# backend/models/query.py

class QueryResult(BaseModel):
    columns: List[Dict[str, str]]
    rows: List[Dict[str, Any]]
    row_count: int
    query_sql: Optional[str] = None
    error: Optional[str] = None
    
    # NEW: Optimization metadata
    optimizations_applied: Optional[List[Dict[str, Any]]] = None
    original_estimate: Optional[int] = None
    reduction_factor: Optional[float] = None
```

### Modified Router Response

```python
# backend/routers/data.py

@router.post("/query", response_model=QueryResult, response_model_exclude_none=True)
def execute_query(
    query_desc_data: Dict[str, Any] = Body(...),
    connector: BaseConnector = Depends(get_active_connector),
    conn_details: ConnectionDetails = Depends(get_connection_details)
):
    """Execute query with optimizations."""
    
    # ... validation code ...
    
    # Translate with optimizations
    sql_query, optimization_metadata = query_service.translate_to_sql(
        query_desc=query_desc,
        table_name=actual_table_name,
        db_type=db_type,
        with_optimization=True
    )
    
    # Execute query
    columns, rows = connector.fetch_data(sql_query)
    
    # Calculate reduction factor if original estimate available
    reduction_factor = None
    original_estimate = None
    if optimization_metadata:
        for opt in optimization_metadata:
            if 'original_estimate' in opt.get('parameters', {}):
                original_estimate = opt['parameters']['original_estimate']
                if original_estimate > 0:
                    reduction_factor = 1 - (len(rows) / original_estimate)
    
    return QueryResult(
        columns=columns,
        rows=rows,
        row_count=len(rows),
        query_sql=sql_query,
        error=None,
        optimizations_applied=optimization_metadata if optimization_metadata else None,
        original_estimate=original_estimate,
        reduction_factor=reduction_factor
    )
```

---

## Frontend Integration

### Display Optimization Info

```typescript
// src/components/Visualization/OptimizationHint.tsx

import React from 'react';
import { Alert, AlertTitle, Link, Chip } from '@mui/material';
import { SpeedIcon } from '@mui/icons-material';

interface OptimizationHintProps {
  optimizations: Array<{
    strategy: string;
    reduction: number;
    parameters: Record<string, any>;
  }>;
  originalEstimate?: number;
  actualRows: number;
}

export const OptimizationHint: React.FC<OptimizationHintProps> = ({
  optimizations,
  originalEstimate,
  actualRows
}) => {
  if (!optimizations || optimizations.length === 0) {
    return null;
  }
  
  const reductionPercent = originalEstimate
    ? Math.round((1 - actualRows / originalEstimate) * 100)
    : null;
  
  return (
    <Alert severity="info" icon={<SpeedIcon />} sx={{ mb: 2 }}>
      <AlertTitle>Query Optimized for Performance</AlertTitle>
      <Box>
        Showing {actualRows.toLocaleString()} unique data points
        {reductionPercent && ` (${reductionPercent}% reduction)`}.
        {optimizations.map(opt => (
          <Chip
            key={opt.strategy}
            label={opt.strategy.replace('_', ' ')}
            size="small"
            sx={{ ml: 1 }}
          />
        ))}
      </Box>
      <Link href="#" underline="hover">Learn more about optimizations</Link>
    </Alert>
  );
};
```

---

## Testing Implementation

### Unit Tests

```python
# tests/unit/test_distinct_pairs_strategy.py

import pytest
from pypika import Query, Table

from backend.models.query import QueryDescription, Dimension
from backend.services.optimization.strategies.distinct_pairs import DistinctPairStrategy


def test_can_apply_to_scatter_plot():
    """Test that strategy applies to scatter plot queries."""
    strategy = DistinctPairStrategy()
    
    query_desc = QueryDescription(
        target_table='test',
        dimensions=[
            Dimension(field='x', flavour='continuous', axis='x'),
            Dimension(field='y', flavour='continuous', axis='y')
        ],
        measures=[]
    )
    
    assert strategy.can_apply(query_desc) is True


def test_does_not_apply_to_bar_chart():
    """Test that strategy doesn't apply to aggregated queries."""
    strategy = DistinctPairStrategy()
    
    query_desc = QueryDescription(
        target_table='test',
        dimensions=[
            Dimension(field='category', flavour='discrete', axis='x')
        ],
        measures=[
            Measure(field='revenue', aggregation='sum', alias='total_revenue')
        ]
    )
    
    assert strategy.can_apply(query_desc) is False


def test_apply_adds_distinct():
    """Test that applying strategy adds DISTINCT to query."""
    strategy = DistinctPairStrategy()
    table = Table('test_table')
    
    query = Query.from_(table).select(table.x, table.y)
    query_desc = QueryDescription(
        target_table='test_table',
        dimensions=[
            Dimension(field='x', flavour='continuous', axis='x'),
            Dimension(field='y', flavour='continuous', axis='y')
        ]
    )
    
    optimized = strategy.apply(query, query_desc, table)
    sql = optimized.get_sql(quote_char='`')
    
    assert 'DISTINCT' in sql.upper()
```

### Integration Tests

```python
# tests/integration/test_query_optimization_e2e.py

import pytest
from backend.services.query_service import QueryService
from backend.services.optimization.optimizer import QueryOptimizer
from backend.services.optimization.config import OptimizerConfig


@pytest.fixture
def clickhouse_connector():
    """Fixture providing ClickHouse connector."""
    # Setup test connector
    pass


def test_scatter_plot_optimization_end_to_end(clickhouse_connector):
    """Test full optimization flow for scatter plot."""
    
    # Insert test data
    # ... 50,000 rows with 5,000 unique (x, y) pairs
    
    query_desc = QueryDescription(
        target_table='test_scatter_data',
        dimensions=[
            Dimension(field='price', flavour='continuous', axis='x'),
            Dimension(field='quantity', flavour='continuous', axis='y')
        ]
    )
    
    config = OptimizerConfig(
        enable_distinct_pairs=True,
        enable_adaptive_rounding=False
    )
    
    optimizer = QueryOptimizer(clickhouse_connector, config)
    query_service = QueryService(clickhouse_connector)
    query_service.optimizer = optimizer
    
    sql, metadata = query_service.translate_to_sql(
        query_desc=query_desc,
        table_name='test_scatter_data',
        db_type='clickhouse',
        with_optimization=True
    )
    
    # Execute query
    columns, rows = clickhouse_connector.fetch_data(sql)
    
    # Verify DISTINCT was applied
    assert 'DISTINCT' in sql.upper()
    
    # Verify row count is approximately 5,000 (unique pairs), not 50,000
    assert len(rows) < 6000
    assert len(rows) > 4000
    
    # Verify optimization metadata
    assert len(metadata) > 0
    assert metadata[0]['strategy'] == 'distinct_pairs'
```

---

## Migration Path

### Phase 1: Foundation (Days 1-2)

**Tasks:**
1. Create directory structure for optimization module
2. Implement base classes (`OptimizationStrategy`, `ResultSizeEstimator`)
3. Implement `DistinctPairStrategy`
4. Add unit tests for new classes
5. Update `QueryService` to accept optimizer (optional, backwards compatible)

**Success Criteria:**
- All tests pass
- No breaking changes to existing API
- Optimizer can be initialized but doesn't affect queries yet

### Phase 2: Integration (Days 3-4)

**Tasks:**
1. Implement `QueryOptimizer` main class
2. Implement `BasicEstimator` and `ClickHouseEstimator`
3. Integrate optimizer into `QueryService.translate_to_sql()`
4. Update `QueryResult` model with optimization metadata
5. Update router to return metadata
6. Add integration tests

**Success Criteria:**
- Optimizer automatically applies to eligible queries
- Optimization can be disabled via flag
- API returns optimization metadata
- Existing functionality unaffected

### Phase 3: Adaptive Rounding (Days 5-7)

**Tasks:**
1. Implement `AdaptiveRoundingStrategy`
2. Add rounding precision calculation logic
3. Implement two-pass query flow (estimate + optimize)
4. Add configuration for rounding thresholds
5. Add comprehensive tests
6. Add frontend UI for optimization hints

**Success Criteria:**
- Rounding applies when threshold exceeded
- Frontend shows optimization notification
- Users can see what optimizations were applied
- Performance benchmarks show improvement

### Phase 4: Polish & Documentation (Days 8-9)

**Tasks:**
1. Add environment variable configuration
2. Write user-facing documentation
3. Add logging and monitoring
4. Performance testing and tuning
5. Add user guide for optimization settings

**Success Criteria:**
- Complete documentation
- Configuration via environment variables
- Performance metrics logged
- User guide published

---

## Rollout Strategy

### Stage 1: Opt-In Beta (Week 1)
- Deploy with optimization **disabled by default**
- Add UI toggle for users to enable
- Monitor performance and gather feedback

### Stage 2: Selective Rollout (Week 2-3)
- Enable for specific query types (scatter only)
- Monitor query performance metrics
- Fix any issues discovered

### Stage 3: Full Deployment (Week 4)
- Enable by default for all users
- Provide opt-out mechanism
- Monitor and tune thresholds

---

## Performance Monitoring

### Metrics to Track

```python
# Add to QueryService

import time
from prometheus_client import Histogram, Counter

# Define metrics
query_duration = Histogram(
    'query_duration_seconds',
    'Query execution duration',
    ['optimization_status', 'chart_type']
)

optimization_reduction = Histogram(
    'optimization_reduction_factor',
    'Data reduction from optimizations',
    ['strategy']
)

def translate_to_sql(self, query_desc, ..., with_optimization=True):
    start_time = time.time()
    
    # ... optimization logic ...
    
    duration = time.time() - start_time
    chart_type = 'scatter' if is_scatter else 'other'
    opt_status = 'enabled' if with_optimization else 'disabled'
    
    query_duration.labels(
        optimization_status=opt_status,
        chart_type=chart_type
    ).observe(duration)
    
    # ... rest of method ...
```

---

## Conclusion

This implementation guide provides:

✅ Complete code structure for query optimization layer  
✅ Step-by-step implementation tasks  
✅ Testing strategy with example tests  
✅ Migration path with minimal risk  
✅ Monitoring and rollout strategy  

The modular architecture allows for:
- Easy addition of new optimization strategies
- Database-specific optimizations
- Configuration-driven behavior
- Transparent integration with existing code

**Total Estimated Implementation Time**: 7-9 days (1 developer)

