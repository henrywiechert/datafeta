# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Pydantic models related to query descriptions and results."""
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional, Literal, TYPE_CHECKING

# Always import for type annotation
from backend.models.data_source import VirtualTableDefinition, VirtualColumnDefinition

class Measure(BaseModel):
    field: str
    aggregation: Literal['sum', 'avg', 'count', 'count_distinct', 'min', 'max'] # Add more as needed
    alias: str

class Dimension(BaseModel):
    field: str
    flavour: Literal['discrete', 'continuous']
    axis: Optional[Literal['x', 'y']] = None  # Optional: which axis the dimension is on
    date_part: Optional[Literal['year', 'month', 'day', 'weekday', 'hour', 'minute', 'second', 'millisecond', 'microsecond', 'nanosecond']] = None
    date_mode: Optional[Literal['distinct', 'timeline']] = None

class Filter(BaseModel):
    field: str
    # Define allowed operators - expand later as needed
    operator: Literal['=', '!=', '>', '<', '>=', '<=', 'in', 'not in', 'like', 'ilike', 'not like', 'not ilike', 'is null', 'is not null']
    value: Any # Value type depends on operator (e.g., list for 'in')
    date_part: Optional[Literal['year', 'month', 'day', 'weekday', 'hour', 'minute', 'second', 'millisecond', 'microsecond', 'nanosecond']] = None
    date_mode: Optional[Literal['distinct', 'timeline']] = None
    # 'row' → WHERE clause (default); 'group' → HAVING clause (filters on aggregated values)
    scope: Literal['row', 'group'] = 'row'

class OrderBy(BaseModel):
    field: str # Can be a dimension field or a measure alias
    direction: Literal['asc', 'desc'] = 'asc'

class FieldOptimizationHint(BaseModel):
    """
    Field-level optimization hint.
    Specifies optimization settings for a specific field based on its characteristics.
    """
    
    field: str  # Field name (column name)
    enable_rounding: bool = False  # Apply rounding to this field
    rounding_threshold: Optional[int] = Field(None, ge=0)  # Custom threshold for this field
    enable_sampling: bool = False  # Apply sampling for this field (future)
    sampling_rate: Optional[float] = Field(None, ge=0.0, le=1.0)  # Sampling rate
    reason: str  # Why this optimization (e.g., "continuous_dimension")

class OptimizationHints(BaseModel):
    """
    Optimization hints provided by frontend to guide query optimization.
    
    These hints reflect the frontend's knowledge about:
    - Field characteristics (continuous/discrete, cardinality, data type)
    - User preferences for speed vs precision
    - Dataset size expectations
    - Context (preview vs final result)
    """
    
    # NEW: Field-level hints (each field gets its own optimization config)
    field_hints: Optional[List[FieldOptimizationHint]] = None
    
    # Global optimizations (apply to entire query)
    enable_global_distinct: Optional[bool] = None  # Apply DISTINCT to remove duplicate rows
    
    # DEPRECATED but kept for backward compatibility
    enable_distinct: Optional[bool] = None  # Use enable_global_distinct instead
    enable_rounding: Optional[bool] = None  # Use field_hints instead
    enable_sampling: Optional[bool] = None  # Use field_hints instead
    enable_binning: Optional[bool] = None  # Use field_hints instead
    
    # Thresholds and limits (deprecated in favor of field-level settings)
    rounding_threshold: Optional[int] = Field(None, ge=0)
    max_result_size: Optional[int] = Field(None, ge=0)
    sampling_rate: Optional[float] = Field(None, ge=0.0, le=1.0)
    
    # Precision requirements
    required_precision: Optional[Dict[str, int]] = None
    
    # Performance vs accuracy preference
    optimization_level: Optional[Literal['none', 'light', 'balanced', 'aggressive']] = None
    
    # Context information (for logging/debugging)
    purpose: Optional[str] = None
    chart_context: Optional[Dict[str, Any]] = None

class OptimizationOverride(BaseModel):
    """
    Backend-determined override that supersedes frontend hints.
    
    Used when backend detects conditions that make frontend hints
    inappropriate or unnecessary (e.g., very small tables).
    """
    
    skip_all_optimizations: bool = False
    reason: Optional[str] = None  # e.g., "table_too_small", "already_aggregated"
    table_stats: Optional[Dict[str, Any]] = None  # e.g., {"row_count": 1234, "column_count": 5}

class ResultDimensions(BaseModel):
    """Information about result dimensions for UI display."""
    
    rows: int
    columns: int
    size_display: str  # e.g., "1,234 × 5"

class ResultBudget(BaseModel):
    """
    Frontend-provided safety budget for large result sets.
    
    Used primarily to avoid rendering failures (e.g. scatter with too many points).
    Backend treats this as best-effort and may fall back depending on DB support.
    
    Strategies:
    - 'none': No sampling applied
    - 'random': Random sampling with ORDER BY rand() LIMIT n
    - 'stratified': Proportional sampling across categories (stratify_field)
    - 'preserve_extremes': Random sampling that guarantees min/max rows are included
                          for stable axis scales in scatter plots
    """
    max_rows: int = Field(..., ge=1)
    strategy: Literal['none', 'random', 'stratified', 'preserve_extremes'] = 'none'
    stratify_field: Optional[str] = None
    min_per_stratum: Optional[int] = Field(None, ge=0)
    # Fields to preserve extremes for (used with preserve_extremes strategy)
    # If not specified, will auto-detect continuous dimensions
    preserve_fields: Optional[List[str]] = None

class CdfField(BaseModel):
    """A column for which cume_dist() should be computed."""
    field: str       # source column name
    alias: str       # output alias for the CDF value (e.g., "revenue__cdf")


class BoxPlotField(BaseModel):
    """A continuous field for which box-plot summary statistics should be computed."""
    field: str
    alias: str
    date_part: Optional[Literal['year', 'month', 'day', 'weekday', 'hour', 'minute', 'second', 'millisecond', 'microsecond', 'nanosecond']] = None
    date_mode: Optional[Literal['distinct', 'timeline']] = None


class QueryDescription(BaseModel):
    target_table: str
    target_database: Optional[str] = None # Required for database sources like ClickHouse

    dimensions: List[Dimension] = []
    measures: List[Measure] = []
    filters: List[Filter] = []
    orderBy: List[OrderBy] = []
    limit: Optional[int] = None
    offset: Optional[int] = None

    # CDF (cumulative distribution function) query mode.
    # When set to 'cdf', the backend uses quantile-breakpoint queries instead
    # of GROUP BY aggregation.  cdf_fields lists the columns to compute CDF for;
    # cdf_partition_fields lists discrete columns for GROUP BY (color + faceting).
    # Box-plot mode uses grouped summary statistics instead of raw rows.
    query_mode: Optional[Literal['standard', 'cdf', 'box_plot']] = None
    cdf_fields: Optional[List[CdfField]] = None
    cdf_partition_fields: Optional[List[str]] = None
    box_plot_fields: Optional[List[BoxPlotField]] = None
    box_plot_color_field: Optional[str] = None
    
    # NEW: Optimization hints from frontend
    optimization_hints: Optional[OptimizationHints] = None
    
    # Column-level casting for handling quoted numbers and special formats
    # Maps column_name to {cast_type, replacement_pattern}
    # Example: {'Revenue': {'cast_type': 'DOUBLE', 'replacement_pattern': ','}}
    column_casts: Optional[Dict[str, Dict[str, str]]] = None
    
    # For distinct value queries: apply LIKE pattern filter and random sampling
    distinct_value_regex: Optional[str] = None  # SQL LIKE pattern to filter distinct values
    use_random_sample: Optional[bool] = None  # Whether to use ORDER BY RANDOM() for sampling
    
    # NEW: Explicit flag for filter value queries
    # When True, indicates this query is fetching distinct values for a filter dropdown
    # In UNION mode, this triggers special handling to deduplicate across tables
    fetch_filter_values: Optional[bool] = None

    # When fetching filter values from a JOINed source table directly, the SELECT may
    # use an unqualified column name while the frontend expects the original qualified
    # field name (e.g. "races.status") in the result rows.
    filter_value_result_alias: Optional[str] = None
    
    # NEW: Fields needed for point/segment labels in visualization.
    # Frontend treats order as irrelevant; backend simply ensures these columns are selected.
    label_fields: Optional[List[str]] = None
    
    # NEW: Multi-table support - virtual table definition for joined queries
    virtual_table: Optional[VirtualTableDefinition] = None
    
    # NEW: Virtual columns - calculated columns defined by SQL expressions
    virtual_columns: Optional[List[VirtualColumnDefinition]] = None

    # NEW: Result budget / reduction hints for oversize results (best-effort)
    result_budget: Optional[ResultBudget] = None

    # NEW: Force raw row output (no DISTINCT / no GROUP BY) for local caching slices.
    # Backend will also use this to disable optimizations/sampling to preserve fidelity.
    force_raw_rows: Optional[bool] = None

class QueryResult(BaseModel):
    columns: List[Dict[str, str]] # e.g., [{"name": "col1", "type": "string"}, ...]
    rows: List[Dict[str, Any]] # e.g., [{"col1": "valA", "col2": 123}, ...]
    row_count: int
    query_sql: Optional[str] = None
    error: Optional[str] = None # Include error message if query failed
    
    # Optimization metadata
    optimizations_applied: Optional[List[Dict[str, Any]]] = None
    original_estimate: Optional[int] = None
    reduction_factor: Optional[float] = None 
    
    # NEW: Optimization hints and overrides
    optimization_hints_used: Optional[OptimizationHints] = None  # What hints were actually used
    optimization_override: Optional[OptimizationOverride] = None  # Backend override info
    
    # NEW: Result dimensions for UI display
    result_dimensions: Optional[ResultDimensions] = None 
    
    # Echo back label fields included so frontend can validate presence
    label_fields: Optional[List[str]] = None