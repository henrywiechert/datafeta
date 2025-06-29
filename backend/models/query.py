"""Pydantic models related to query descriptions and results."""
from pydantic import BaseModel
from typing import List, Dict, Any, Optional, Literal

class Measure(BaseModel):
    field: str
    aggregation: Literal['sum', 'avg', 'count', 'count_distinct', 'min', 'max'] # Add more as needed
    alias: str

class Filter(BaseModel):
    field: str
    # Define allowed operators - expand later as needed
    operator: Literal['=', '!=', '>', '<', '>=', '<=', 'in', 'not in', 'like', 'ilike', 'is null', 'is not null']
    value: Any # Value type depends on operator (e.g., list for 'in')

class OrderBy(BaseModel):
    field: str # Can be a dimension field or a measure alias
    direction: Literal['asc', 'desc'] = 'asc'

class QueryDescription(BaseModel):
    target_table: str
    target_database: Optional[str] = None # Required for database sources like ClickHouse

    dimensions: List[str] = []
    measures: List[Measure] = []
    filters: List[Filter] = []
    orderBy: List[OrderBy] = []
    limit: Optional[int] = None
    offset: Optional[int] = None
    # Add other potential fields later, e.g., having_filters

class QueryResult(BaseModel):
    columns: List[Dict[str, str]] # e.g., [{"name": "col1", "type": "string"}, ...]
    rows: List[Dict[str, Any]] # e.g., [{"col1": "valA", "col2": 123}, ...]
    row_count: int
    query_sql: Optional[str] = None
    error: Optional[str] = None # Include error message if query failed 