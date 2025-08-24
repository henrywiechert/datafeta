# Backend Documentation

The backend is a FastAPI-based REST API that provides data connectivity, query processing, and file handling capabilities for the data analysis platform.

## Architecture Overview

### Core Components
- **FastAPI Framework**: Modern Python web framework with automatic API documentation
- **Multi-Connector Architecture**: Support for various data sources (databases, files)
- **Query Generation Engine**: Dynamic SQL generation using pypika library
- **File Processing**: Integrated DuckDB for CSV and file-based data analysis
- **Error Handling**: Comprehensive exception handling and logging

### Main Features
- **Database Connectivity**: Connect to various database systems
- **File Upload Support**: CSV file upload and processing with DuckDB
- **Dynamic Query Generation**: Convert frontend query descriptions to optimized SQL
- **RESTful API Design**: Clean API endpoints with automatic documentation
- **CORS Support**: Configured for frontend integration

## Project Structure

```
backend/
├── main.py                 # FastAPI application entry point
├── routers/               # API route handlers
│   └── data.py           # Data-related endpoints
├── services/             # Business logic layer
│   └── query_service.py  # Query generation and execution
├── connectors/           # Data source connectors
│   ├── base_connector.py # Abstract base connector
│   ├── file_connector.py # File-based data sources
│   └── db_connector.py   # Database connectors (future)
├── models/               # Data models and schemas
├── exceptions.py         # Custom exception classes
└── dependencies.py       # Dependency injection utilities
```

## API Endpoints

### Data Source Management

#### Connect to Data Source
```http
POST /api/v1/data/connect
Content-Type: application/json

{
  "type": "database|file",
  "connection_details": {
    // Database: host, port, database, username, password
    // File: file upload via multipart/form-data
  }
}
```

#### Disconnect from Data Source
```http
POST /api/v1/data/disconnect
```

### Metadata Discovery

#### List Databases
```http
GET /api/v1/data/databases
```

#### List Tables
```http
GET /api/v1/data/tables?database={database_name}
```

#### List Columns
```http
GET /api/v1/data/columns?database={database_name}&table={table_name}
```

### Query Execution

#### Execute Query
```http
POST /api/v1/data/query
Content-Type: application/json

{
  "table_name": "table_name",
  "query_description": {
    "dimensions": [...],
    "measures": [...],
    "filters": [...],
    "orderBy": [...],
    "limit": 1000
  }
}
```

## Query Generation with Pypika

### QueryService Class

The `QueryService` handles translation of frontend query descriptions to SQL using pypika:

```python
from pypika import Query, Table, Field, Order, Criterion
from pypika.functions import Sum, Avg, Count, Min, Max

class QueryService:
    def translate_to_sql(self, query_desc: QueryDescription, table_name: str) -> str:
        # Convert query description to pypika Query object
        # Return optimized SQL string
```

### Query Translation Process

#### 1. Table Setup
```python
table = Table(table_name)
query = Query.from_(table)
```

#### 2. Field Selection
```python
# Add dimensions (grouping fields)
for dimension in query_desc.dimensions:
    query = query.select(table[dimension.field])

# Add measures (aggregated fields)  
for measure in query_desc.measures:
    agg_func = self._get_aggregation_function(measure.aggregation)
    query = query.select(agg_func(table[measure.field]).as_(f"{measure.field}_{measure.aggregation}"))
```

#### 3. Filter Application
```python
criteria = []
for filter_item in query_desc.filters:
    field = table[filter_item.field]
    operator_func = OPERATOR_MAPPING[filter_item.operator]
    criteria.append(operator_func(field, filter_item.value))

if criteria:
    query = query.where(Criterion.all(criteria))
```

#### 4. Grouping Logic
```python
if query_desc.dimensions and query_desc.measures:
    # Group by all dimensions when measures are present
    query = query.groupby(*[table[dim.field] for dim in query_desc.dimensions])
elif query_desc.dimensions and not query_desc.measures:
    # Use DISTINCT for dimension-only queries
    is_any_continuous = any(d.flavour == 'continuous' for d in query_desc.dimensions)
    if not is_any_continuous:
        query = query.distinct()
```

#### 5. Ordering and Limits
```python
for order in query_desc.orderBy:
    field_term = table[order.field] if order.field not in aliases else order.field
    pypika_order = Order.desc if order.direction == 'desc' else Order.asc
    query = query.orderby(field_term, order=pypika_order)

if query_desc.limit:
    query = query.limit(query_desc.limit)
```

### Supported Operators

```python
OPERATOR_MAPPING = {
    '=': lambda f, v: f == v,
    '!=': lambda f, v: f != v,
    '>': lambda f, v: f > v,
    '<': lambda f, v: f < v,
    '>=': lambda f, v: f >= v,
    '<=': lambda f, v: f <= v,
    'in': lambda f, v: f.isin(v),
    'not in': lambda f, v: ~f.isin(v),
    'like': lambda f, v: f.like(v),
    'ilike': lambda f, v: f.ilike(v),
    'is null': lambda f, v: f.isnull(),
    'is not null': lambda f, v: f.notnull(),
}
```

### Aggregation Functions

```python
def _get_aggregation_function(self, aggregation: str):
    aggregation_map = {
        'count': lambda field: Count('*'),
        'countd': lambda field: Count(field).distinct(),
        'sum': lambda field: Sum(field),
        'avg': lambda field: Avg(field),
        'min': lambda field: Min(field),
        'max': lambda field: Max(field),
        'median': lambda field: self._median_function(field),  # DB-specific
    }
    return aggregation_map.get(aggregation)
```

## Data Source Connectors

### Base Connector Architecture

```python
from abc import ABC, abstractmethod

class BaseConnector(ABC):
    @abstractmethod
    def connect(self, connection_details: Dict[str, Any]) -> None:
        pass
    
    @abstractmethod
    def disconnect(self) -> None:
        pass
    
    @abstractmethod
    def list_databases(self) -> List[Database]:
        pass
    
    @abstractmethod
    def list_tables(self, database: str = None) -> List[Table]:
        pass
    
    @abstractmethod
    def list_columns(self, database: str = None, table: str = None) -> List[Column]:
        pass
    
    @abstractmethod
    def fetch_data(self, query: str) -> Tuple[List[Dict[str, str]], List[Dict[str, Any]]]:
        pass
```

### File Connector (DuckDB Integration)

The `FileConnector` provides CSV file processing using DuckDB:

```python
class FileConnector(BaseConnector):
    def __init__(self, state_manager: ConnectionStateManager):
        self.file_path = None
        self._table_name = None
        self._file_type = None
        self.state_manager = state_manager
```

#### CSV Processing
```python
def connect(self, connection_details: Dict[str, Any]) -> None:
    self.file_path = connection_details.get("file_path")
    
    # Validate file exists and is CSV
    if not os.path.exists(self.file_path):
        raise DataSourceConnectionError(f"File not found: {self.file_path}")
    
    _, file_ext = os.path.splitext(self.file_path)
    if file_ext.lower() != '.csv':
        raise InvalidInputError(f"Unsupported file type: {file_ext}")
    
    self._table_name = os.path.splitext(os.path.basename(self.file_path))[0]
```

#### Query Execution
```python
def fetch_data(self, query: str) -> Tuple[List[Dict[str, str]], List[Dict[str, Any]]]:
    con = duckdb.connect(database=':memory:', read_only=False)
    
    # Create temporary view from CSV
    safe_view_name = f'"{self._table_name}"'
    file_reader = f"read_csv_auto('{self.file_path}', SAMPLE_SIZE=-1, nullstr='NaN')"
    create_view_sql = f"CREATE OR REPLACE TEMPORARY VIEW {safe_view_name} AS SELECT * FROM {file_reader};"
    
    con.execute(create_view_sql)
    
    # Execute query against the view
    result_relation = con.execute(query)
    arrow_table = result_relation.fetch_arrow_table()
    
    # Convert to expected format
    return self._convert_arrow_to_response(arrow_table)
```

#### Schema Detection
```python
def list_columns(self, database: str = None, table: str = None) -> List[Column]:
    # Use DuckDB's automatic schema detection
    con = duckdb.connect(database=':memory:', read_only=False)
    
    # Get column information from CSV
    describe_query = f"DESCRIBE SELECT * FROM read_csv_auto('{self.file_path}', SAMPLE_SIZE=1000);"
    result = con.execute(describe_query).fetchall()
    
    columns = []
    for row in result:
        columns.append(Column(
            name=row[0],
            type=self._map_duckdb_type_to_standard(row[1]),
            nullable=True  # CSV files typically allow nulls
        ))
    
    return columns
```

## Error Handling

### Custom Exception Classes

```python
class AppException(Exception):
    """Base exception for application-specific errors."""
    pass

class InvalidInputError(AppException):
    """Raised when input validation fails."""
    pass

class DataSourceConnectionError(AppException):
    """Raised when data source connection fails."""
    pass

class QueryGenerationError(AppException):
    """Raised when SQL query generation fails."""
    pass

class QueryExecutionError(AppException):
    """Raised when query execution fails."""
    pass

class FileProcessingError(AppException):
    """Raised when file processing operations fail."""
    pass
```

### Exception Handlers

```python
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logger.error(f"Request validation error: {exc.errors()}")
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": exc.errors()},
    )

@app.exception_handler(AppException)
async def app_exception_handler(request: Request, exc: AppException):
    logger.error(f"Application error: {str(exc)}")
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={"detail": str(exc)},
    )
```

## File Upload and Management

### Temporary File Handling

```python
UPLOAD_DIR = "temp_uploads"

def create_upload_directory():
    if not os.path.exists(UPLOAD_DIR):
        os.makedirs(UPLOAD_DIR)
        logger.info(f"Created upload directory: {UPLOAD_DIR}")

@app.on_event("shutdown")
def shutdown_event():
    """Clean up temporary upload directory on application shutdown."""
    try:
        if UPLOAD_DIR and os.path.exists(UPLOAD_DIR):
            shutil.rmtree(UPLOAD_DIR)
            logger.info(f"Cleaned up temporary directory: {UPLOAD_DIR}")
    except Exception as e:
        logger.exception(f"Error cleaning up temp directory {UPLOAD_DIR}")
```

### File Upload Endpoint

```python
@router.post("/connect")
async def connect_data_source(
    connection_type: str = Form(...),
    file: UploadFile = File(None),
    # Database connection parameters...
):
    if connection_type == "file":
        if not file:
            raise InvalidInputError("File is required for file connection")
        
        # Save uploaded file
        file_path = os.path.join(UPLOAD_DIR, file.filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Connect using file connector
        connection_details = {"file_path": file_path}
        connector = FileConnector(state_manager)
        connector.connect(connection_details)
```

## Configuration and Environment

### CORS Configuration

```python
origins = [
    "http://localhost",
    "http://localhost:3000",
    # Add production frontend URLs
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### Logging Configuration

```python
log_level_name = os.environ.get("LOG_LEVEL", "INFO").upper()
log_level = getattr(logging, log_level_name, logging.INFO)

logging.basicConfig(
    level=log_level,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
```

## Database Support (Future)

### Planned Database Connectors

#### PostgreSQL Connector
```python
class PostgreSQLConnector(BaseConnector):
    def connect(self, connection_details):
        # psycopg2 or asyncpg integration
        pass
```

#### MySQL Connector
```python
class MySQLConnector(BaseConnector):
    def connect(self, connection_details):
        # MySQL connector integration
        pass
```

#### ClickHouse Connector
```python
class ClickHouseConnector(BaseConnector):
    def connect(self, connection_details):
        # ClickHouse driver integration
        pass
```

## Performance Optimizations

### Query Optimization
- **Connection pooling**: Reuse database connections
- **Query caching**: Cache frequently executed queries
- **Result pagination**: Handle large result sets efficiently

### File Processing Optimization
- **Streaming CSV processing**: Handle large files without loading entirely into memory
- **Columnar storage**: Leverage DuckDB's columnar format for analytics
- **Parallel processing**: Multi-threaded file processing for large datasets

## Security Features

### Input Validation
- **SQL injection prevention**: Parameterized queries through pypika
- **File type validation**: Restrict file uploads to supported types
- **Size limits**: Maximum file size restrictions

### Access Control
- **Authentication middleware**: Token-based authentication (future)
- **Role-based permissions**: User access control (future)
- **Audit logging**: Track all data access and modifications

## Monitoring and Observability

### Health Checks
```python
@app.get("/health")
def health_check():
    return {"status": "healthy", "timestamp": datetime.utcnow()}
```

### Metrics Collection
- **Query execution times**: Track performance metrics
- **Error rates**: Monitor exception frequencies
- **Resource usage**: CPU and memory monitoring

## Future Enhancements

### Planned Features
- **Advanced database connectors**: PostgreSQL, MySQL, ClickHouse support
- **Authentication system**: User authentication and authorization
- **Query caching**: Intelligent result caching system
- **Real-time data**: WebSocket support for live data streams
- **Data transformation**: ETL capabilities and data preprocessing
- **Advanced file formats**: Parquet, JSON, Excel support
- **Distributed processing**: Scaling for large dataset processing
- **API versioning**: Versioned API endpoints for backwards compatibility