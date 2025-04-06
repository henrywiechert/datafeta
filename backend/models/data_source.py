"""Pydantic models related to data sources and connections."""
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

# --- Data Source Primitives --- #

class Database(BaseModel):
    name: str

class Table(BaseModel):
    name: str

class Column(BaseModel):
    name: str
    data_type: str
    # Add other parameters as needed, e.g., is_nullable, default_value

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
    port: Optional[int] = 9000
    user: Optional[str] = 'default'
    password: Optional[str] = ''
    database: Optional[str] = 'default' # Default database for connection

class DataSourceListResponse(BaseModel):
    data_sources: List[DataSource]

class DatabaseListResponse(BaseModel):
    databases: List[Database]

class TableListResponse(BaseModel):
    tables: List[Table]

class ColumnListResponse(BaseModel):
    columns: List[Column] 