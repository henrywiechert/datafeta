# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Pydantic models related to data sources and connections."""
from pydantic import BaseModel, ConfigDict, Field, field_validator
from typing import List, Dict, Any, Optional, Literal

# --- Data Source Primitives --- #

class Database(BaseModel):
    name: str

class Table(BaseModel):
    name: str


class TableReference(BaseModel):
    database: str
    table_name: str


class PatternMatchedDatabaseTables(BaseModel):
    database: str
    tables: List[str]


class ClickHousePatternPreviewRequest(BaseModel):
    database_pattern: str = Field(..., min_length=1)
    table_pattern: str = Field(..., min_length=1)
    pattern_mode: Literal['regex', 'wildcard'] = 'regex'
    max_databases: int = Field(25, ge=1, le=200)
    max_total_matches: int = Field(100, ge=1, le=1000)
    max_tables_per_database: int = Field(20, ge=1, le=500)
    current_primary: Optional[TableReference] = None
    existing_union_tables: List[TableReference] = Field(default_factory=list)


class ClickHousePatternPreviewResponse(BaseModel):
    matched_databases: List[str]
    matches: List[PatternMatchedDatabaseTables]
    resolved_tables: List[TableReference]
    excluded_existing: List[TableReference]
    truncated: bool = False
    warnings: List[str] = Field(default_factory=list)

class Column(BaseModel):
    name: str
    data_type: str
    # Add other parameters as needed, e.g., is_nullable, default_value
    cast_type: Optional[str] = None  # Override detected type, e.g., 'DOUBLE' for quoted numbers
    cast_replacement: Optional[str] = None  # Regex pattern to remove (e.g., ',' for thousands separator)
    is_datetime: bool = False
    table_name: Optional[str] = None  # Source table for this column (for multi-table support)
    is_virtual: Optional[bool] = False  # True if this is a virtual/calculated column

# --- Multi-Table Support Models --- #

class ForeignKeyRelationship(BaseModel):
    """Represents a foreign key relationship between two tables.

    Supports composite keys via multi-element lists in from_columns / to_columns.
    """
    from_table: str
    from_columns: List[str]
    to_table: str
    to_columns: List[str]
    relationship_type: Literal['one_to_one', 'one_to_many', 'many_to_one', 'many_to_many'] = 'one_to_many'

class TableJoinDefinition(BaseModel):
    """Defines how a table should be joined to the primary table."""
    table_name: str
    join_type: Literal['INNER', 'LEFT', 'RIGHT', 'FULL'] = 'LEFT'
    on_conditions: List[str]  # e.g., ["primary.id = joined.primary_id"]
    alias: Optional[str] = None  # Optional table alias
    enforce_unique_keys: bool = False  # When True, wrap joined table in dedup subquery
    dedup_key_columns: Optional[List[str]] = None  # Key columns to deduplicate on

class UnionTableDefinition(BaseModel):
    """Defines a table to be combined with UNION ALL (flexible schema with NULL fill)."""
    table_name: str
    database: Optional[str] = None  # Optional database name (for cross-database unions)
    filter_condition: Optional[str] = None  # Optional WHERE clause for this table

class VirtualTableDefinition(BaseModel):
    """Defines a virtual merged table composed of multiple physical tables."""
    primary_table: str
    mode: Literal['join', 'union'] = 'join'  # How to combine tables
    joined_tables: List[TableJoinDefinition] = []  # For JOIN mode
    union_tables: List[UnionTableDefinition] = []  # For UNION ALL mode
    name: Optional[str] = None  # Optional name for the virtual table

class VirtualColumnDefinition(BaseModel):
    """
    Definition of a virtual (calculated) column.
    
    Virtual columns are calculated from other columns using SQL expressions,
    evaluated at the database level for performance.
    
    Examples:
        # Simple arithmetic
        VirtualColumnDefinition(
            name="profit",
            expression="(revenue - cost)",
            output_type="DOUBLE"
        )
        
        # With functions
        VirtualColumnDefinition(
            name="rounded_price",
            expression="ROUND(price, 2)",
            output_type="DOUBLE"
        )
        
        # Conditional
        VirtualColumnDefinition(
            name="status_label",
            expression="CASE().when(active == 1, 'Active').else_('Inactive')",
            output_type="VARCHAR"
        )
    """
    name: str = Field(..., description="Name of the virtual column (must be unique)")
    expression: str = Field(..., description="SQL expression to calculate the column")
    output_type: Optional[str] = Field(None, description="Expected SQL data type (e.g., 'DOUBLE', 'VARCHAR', 'INTEGER')")
    description: Optional[str] = Field(None, description="Human-readable description of the column")
    
    @field_validator('name')
    @classmethod
    def validate_name(cls, v: str) -> str:
        """Ensure name is a valid identifier."""
        if not v or not v.strip():
            raise ValueError("Virtual column name cannot be empty")
        v = v.strip()
        if not v[0].isalpha() and v[0] != '_':
            raise ValueError("Virtual column name must start with a letter or underscore")
        if not all(c.isalnum() or c == '_' for c in v):
            raise ValueError("Virtual column name must contain only letters, numbers, and underscores")
        return v
    
    @field_validator('expression')
    @classmethod
    def validate_expression_not_empty(cls, v: str) -> str:
        """Ensure expression is not empty."""
        if not v or not v.strip():
            raise ValueError("Expression cannot be empty")
        return v.strip()

    model_config = ConfigDict(json_schema_extra={
            "example": {
                "name": "profit",
                "expression": "(revenue - cost)",
                "output_type": "DOUBLE",
                "description": "Net profit calculated as revenue minus cost"
            }
        })

# --- Connection and Listing Models --- #

class DataSource(BaseModel):
    # This might be less used now, maybe just for listing potential types?
    type: str  # "csv" or "clickhouse"
    name: str
    # Removed connection details from here to avoid duplication with ConnectionDetails

class ConnectionDetails(BaseModel):
    # NOTE: intentionally a plain string to enable plugin connectors without
    # modifying core models. Validation is enforced by the connector registry.
    type: str
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
    csv_sample_size: Optional[int] = Field(default=1000, ge=1)  # Rows DuckDB samples for CSV type inference
    csv_sample_full_dataset: Optional[bool] = False  # Infer CSV types from the full dataset (DuckDB sample_size=-1)
    csv_trim_numeric_whitespace: Optional[bool] = False  # Trim numeric-looking VARCHAR columns and cast to DOUBLE
    
    # Column-level casting configuration for handling special cases (e.g., quoted numbers)
    column_casts: Optional[Dict[str, Dict[str, str]]] = None  # Maps column_name to {cast_type, replacement_pattern}
    
    # Optional fields for Kaggle connection
    kaggle_username: Optional[str] = None  # Kaggle username for API authentication
    kaggle_api_key: Optional[str] = None  # Kaggle API key for authentication
    kaggle_dataset: Optional[str] = None  # Dataset reference in format "owner/dataset-name"
    kaggle_csv_files: Optional[List[str]] = None  # Pre-fetched list of CSV files to avoid 403 errors
    
    # Optional fields for HuggingFace datasets
    hf_token: Optional[str] = None  # Optional HuggingFace token for private datasets
    hf_dataset: Optional[str] = None  # Dataset reference in format "owner/dataset-name"
    hf_splits: Optional[List[str]] = None  # Selected Parquet-backed split table names

    # Optional fields for Hive-partitioned Parquet connection
    hive_file_structure: Optional[List[str]] = None  # Relative file paths from folder picker

class DataSourceListResponse(BaseModel):
    data_sources: List[DataSource]

class DatabaseListResponse(BaseModel):
    databases: List[Database]

class TableListResponse(BaseModel):
    tables: List[Table]

class ColumnListResponse(BaseModel):
    columns: List[Column]


class TableReferenceListResponse(BaseModel):
    tables: List[TableReference]

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
