"""Pydantic models related to data sources and connections."""
from pydantic import BaseModel
from typing import List, Dict, Any, Optional, Literal

# --- Data Source Primitives --- #

class Database(BaseModel):
    name: str

class Table(BaseModel):
    name: str

class Column(BaseModel):
    name: str
    data_type: str
    # Add other parameters as needed, e.g., is_nullable, default_value
    cast_type: Optional[str] = None  # Override detected type, e.g., 'DOUBLE' for quoted numbers
    cast_replacement: Optional[str] = None  # Regex pattern to remove (e.g., ',' for thousands separator)
    is_datetime: bool = False
    table_name: Optional[str] = None  # Source table for this column (for multi-table support)

# --- Multi-Table Support Models --- #

class ForeignKeyRelationship(BaseModel):
    """Represents a foreign key relationship between two tables."""
    from_table: str
    from_column: str
    to_table: str
    to_column: str
    relationship_type: Literal['one_to_one', 'one_to_many', 'many_to_one', 'many_to_many'] = 'one_to_many'

class TableJoinDefinition(BaseModel):
    """Defines how a table should be joined to the primary table."""
    table_name: str
    join_type: Literal['INNER', 'LEFT', 'RIGHT', 'FULL'] = 'LEFT'
    on_conditions: List[str]  # e.g., ["primary.id = joined.primary_id"]
    alias: Optional[str] = None  # Optional table alias

class UnionTableDefinition(BaseModel):
    """Defines a table to be combined with UNION ALL (same schema)."""
    table_name: str
    filter_condition: Optional[str] = None  # Optional WHERE clause for this table

class VirtualTableDefinition(BaseModel):
    """Defines a virtual merged table composed of multiple physical tables."""
    primary_table: str
    mode: Literal['join', 'union'] = 'join'  # How to combine tables
    joined_tables: List[TableJoinDefinition] = []  # For JOIN mode
    union_tables: List[UnionTableDefinition] = []  # For UNION ALL mode
    name: Optional[str] = None  # Optional name for the virtual table

# --- Connection and Listing Models --- #

class DataSource(BaseModel):
    # This might be less used now, maybe just for listing potential types?
    type: str  # "csv" or "clickhouse"
    name: str
    # Removed connection details from here to avoid duplication with ConnectionDetails

class ConnectionDetails(BaseModel):
    type: str # "csv" or "clickhouse"
    connection_string: Optional[str] = None
    # file_path: Optional[str] = None # Managed internally by backend for uploads

    # Optional fields for ClickHouse connection without connection string
    host: Optional[str] = None
    port: Optional[int] = 8123  # HTTP interface port (not 9000 which is native protocol)
    user: Optional[str] = 'default'
    password: Optional[str] = ''
    database: Optional[str] = 'default' # Default database for connection

    # Optional fields for CSV file configuration
    csv_delimiter: Optional[str] = ','  # Delimiter character (comma, semicolon, tab, pipe, etc.)
    csv_has_header: Optional[bool] = True  # Whether first line contains column headers
    csv_decimal_separator: Optional[str] = '.'  # Decimal separator for numbers (. or ,)
    csv_thousands_separator: Optional[str] = ''  # Thousands separator for numbers (empty, comma, apostrophe, space, etc.)
    csv_date_format: Optional[str] = '%Y-%m-%d'  # Date format pattern
    csv_timestamp_format: Optional[str] = '%Y-%m-%d %H:%M:%S'  # Timestamp format pattern
    
    # Column-level casting configuration for handling special cases (e.g., quoted numbers)
    column_casts: Optional[Dict[str, Dict[str, str]]] = None  # Maps column_name to {cast_type, replacement_pattern}

class DataSourceListResponse(BaseModel):
    data_sources: List[DataSource]

class DatabaseListResponse(BaseModel):
    databases: List[Database]

class TableListResponse(BaseModel):
    tables: List[Table]

class ColumnListResponse(BaseModel):
    columns: List[Column]

class TableRelationshipsResponse(BaseModel):
    """Response containing detected foreign key relationships for a database."""
    relationships: List[ForeignKeyRelationship]

class MergedColumnsResponse(BaseModel):
    """Response containing columns from multiple joined tables with table prefixes."""
    columns: List[Column]
    virtual_table: VirtualTableDefinition

class SuggestedUnionsResponse(BaseModel):
    """Response containing tables with matching schemas that can be combined with UNION ALL."""
    primary_table: str
    suggested_tables: List[str]  # Tables with identical schema
    schema_hash: Optional[str] = None  # Hash of the schema for validation 