"""
Pydantic models for API request and response structures.
"""
from pydantic import BaseModel
from typing import List, Dict, Any, Optional


class DataSource(BaseModel):
    type: str  # "csv" or "clickhouse"
    name: str
    connection_string: Optional[str] = None # For database connections
    file_path: Optional[str] = None # For file connections

class Database(BaseModel):
    name: str

class Table(BaseModel):
    name: str

class Column(BaseModel):
    name: str
    data_type: str
    # Add other parameters as needed, e.g., is_nullable, default_value

class DataSourceListResponse(BaseModel):
    data_sources: List[DataSource]

class DatabaseListResponse(BaseModel):
    databases: List[Database]

class TableListResponse(BaseModel):
    tables: List[Table]

class ColumnListResponse(BaseModel):
    columns: List[Column]

class ConnectionDetails(BaseModel):
    type: str # "csv" or "clickhouse"
    connection_string: Optional[str] = None
    # file_path: Optional[str] = None # No longer needed in request body for CSV
    # Optional fields for ClickHouse connection without connection string
    host: Optional[str] = None
    port: Optional[int] = 9000
    user: Optional[str] = 'default'
    password: Optional[str] = ''
    database: Optional[str] = 'default' 