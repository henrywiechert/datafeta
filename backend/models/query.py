"""Pydantic models related to query descriptions and results."""
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional, Literal, TYPE_CHECKING

if TYPE_CHECKING:
    from backend.models.data_source import VirtualTableDefinition

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
    operator: Literal['=', '!=', '>', '<', '>=', '<=', 'in', 'not in', 'like', 'ilike', 'is null', 'is not null']
    value: Any # Value type depends on operator (e.g., list for 'in')
    date_part: Optional[Literal['year', 'month', 'day', 'weekday', 'hour', 'minute', 'second', 'millisecond', 'microsecond', 'nanosecond']] = None
    date_mode: Optional[Literal['distinct', 'timeline']] = None

class OrderBy(BaseModel):
    field: str # Can be a dimension field or a measure alias
    direction: Literal['asc', 'desc'] = 'asc'

class OptimizationHints(BaseModel):
    """
    Optimization hints provided by frontend to guide query optimization.
    
    These hints reflect the frontend's knowledge about:
    - Chart type and visualization requirements
    - User preferences for speed vs precision
    - Dataset size expectations
    - Context (preview vs final result)
    """
    
    # Core optimization toggles
    enable_distinct: Optional[bool] = None
    enable_rounding: Optional[bool] = None
    enable_sampling: Optional[bool] = None
    enable_binning: Optional[bool] = None
    
    # Thresholds and limits
    rounding_threshold: Optional[int] = Field(None, ge=0)
    max_result_size: Optional[int] = Field(None, ge=0)
    sampling_rate: Optional[float] = Field(None, ge=0.0, le=1.0)
    
    # Precision requirements
    required_precision: Optional[Dict[str, int]] = None
    
    # Performance vs accuracy preference
    optimization_level: Optional[Literal['none', 'light', 'balanced', 'aggressive']] = None
    
    # Context information (for logging/debugging)
    # Frontend sends chart-specific purpose values
    purpose: Optional[str] = None  # e.g., 'scatter_plot_deduplication', 'bar_chart_aggregation', etc.
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

class QueryDescription(BaseModel):
    target_table: str
    target_database: Optional[str] = None # Required for database sources like ClickHouse

    dimensions: List[Dimension] = []
    measures: List[Measure] = []
    filters: List[Filter] = []
    orderBy: List[OrderBy] = []
    limit: Optional[int] = None
    offset: Optional[int] = None
    
    # NEW: Optimization hints from frontend
    optimization_hints: Optional[OptimizationHints] = None
    
    # Column-level casting for handling quoted numbers and special formats
    # Maps column_name to {cast_type, replacement_pattern}
    # Example: {'Revenue': {'cast_type': 'DOUBLE', 'replacement_pattern': ','}}
    column_casts: Optional[Dict[str, Dict[str, str]]] = None
    
    # For distinct value queries: apply LIKE pattern filter and random sampling
    distinct_value_regex: Optional[str] = None  # SQL LIKE pattern to filter distinct values
    use_random_sample: Optional[bool] = None  # Whether to use ORDER BY RANDOM() for sampling
    
    # NEW: Fields needed for point/segment labels in visualization.
    # Frontend treats order as irrelevant; backend simply ensures these columns are selected.
    label_fields: Optional[List[str]] = None
    
    # NEW: Multi-table support - virtual table definition for joined queries
    virtual_table: Optional['VirtualTableDefinition'] = None  # Forward reference

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