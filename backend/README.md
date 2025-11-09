# Backend Documentation

FastAPI-based REST API providing data connectivity, query processing, and optimization for the data analysis platform.

## Architecture Overview

### Core Components

- **FastAPI Application** (`main.py`): Entry point with CORS, exception handlers, static file serving
- **Multi-Connector System**: Pluggable connectors for different data sources (ClickHouse, CSV via DuckDB)
- **Query Generation Engine**: Dynamic SQL generation using PyPika with optimization strategies
- **Session-Based State Management**: Per-user connection state via cookie-based sessions
- **Query Optimization**: Automatic query optimization with adaptive rounding, binning, deduplication

### Component Connections

```
Request → FastAPI Router → Dependencies (Session/Connector) → Services → Connectors → Data Source
                                                                    ↓
                                                          Query Optimization
```

**Request Flow:**
1. FastAPI receives request, extracts/creates session ID from cookie
2. `get_state_manager` dependency provides session-specific `ConnectionStateManager`
3. Router endpoints use `get_active_connector` and `get_connection_details` dependencies
4. Services (`ConnectionService`, `QueryService`) orchestrate business logic
5. Connectors execute queries against data sources
6. Query optimizer applies strategies based on result size estimates

## Project Structure

```
backend/
├── main.py                    # FastAPI app, CORS, exception handlers, static serving
├── routers/
│   └── data.py               # API endpoints (connect, query, metadata)
├── services/
│   ├── connection_service.py    # Connection lifecycle, CSV upload handling
│   ├── query_service.py         # SQL generation from QueryDescription
│   ├── query_components/        # Modular query builders (select, filter, grouping, etc.)
│   ├── optimization/            # Query optimization system
│   │   ├── optimizer.py         # Main optimizer coordinating strategies
│   │   ├── strategies/          # Optimization strategies (rounding, binning, dedup)
│   │   ├── planners/            # Strategy planning logic
│   │   └── estimators/          # Result size estimation (ClickHouse, DuckDB)
│   ├── validation_service.py    # Input validation
│   ├── table_merge_service.py   # Multi-table JOIN/UNION support
│   └── query_result_builder.py  # Result formatting
├── connectors/
│   ├── base.py                 # BaseConnector abstract interface
│   ├── clickhouse_connector.py  # ClickHouse database connector
│   └── file_connector.py        # CSV file connector (DuckDB)
├── models/
│   ├── data_source.py          # ConnectionDetails, Database, Table, Column models
│   └── query.py                 # QueryDescription, Measure, Dimension, Filter models
├── dependencies.py              # Session management, dependency injection
└── exceptions.py               # Custom exception hierarchy
```

## Multi-User Support (Sessions)

### Session Management

The backend supports multiple concurrent users through **session-based state isolation**:

- **Session Identification**: Cookie-based (`session_id` cookie, httponly)
- **State Storage**: In-memory dictionary `session_storage: Dict[str, ConnectionStateManager]`
- **Per-Session State**: Each session has its own:
  - Active connector instance
  - Connection details
  - CSV temporary file path (session-scoped upload directory)
  - Async lock for connect/disconnect serialization

**Implementation** (`dependencies.py`):
```python
session_storage: Dict[str, ConnectionStateManager] = {}
# Thread-safe access via _session_storage_lock

async def get_state_manager(request, response, session_id) -> ConnectionStateManager:
    # Creates new session if missing, sets cookie
    # Returns session-specific ConnectionStateManager
```

**File Upload Isolation**: CSV uploads stored in `{upload_root_dir}/{session_id}/` directories, cleaned up on disconnect.

**Note**: For production with multiple server instances, replace in-memory storage with Redis or similar.

## API Endpoints

### Connection Management

**POST `/api/v1/data/connect`** (multipart/form-data)
- CSV: Upload file + connection details JSON
- ClickHouse: Connection details JSON only

**POST `/api/v1/data/connect/json`** (application/json)
- ClickHouse connections without file upload

**POST `/api/v1/data/disconnect`**
- Disconnects connector, cleans up session files

### Metadata Discovery

- **GET `/api/v1/data/databases`** - List databases
- **GET `/api/v1/data/tables?database={db}`** - List tables
- **GET `/api/v1/data/columns?table={table}&database={db}`** - List columns
- **GET `/api/v1/data/distinct-count?field={field}&table={table}`** - Cardinality queries

### Query Execution

**POST `/api/v1/data/query`**
```json
{
  "target_table": "table_name",
  "target_database": "db_name",  // Optional, required for ClickHouse
  "dimensions": [{"field": "col", "flavour": "discrete"}],
  "measures": [{"field": "amount", "aggregation": "sum", "alias": "total"}],
  "filters": [{"field": "status", "operator": "=", "value": "active"}],
  "orderBy": [{"field": "total", "direction": "desc"}],
  "limit": 1000,
  "virtual_table": {...}  // Optional: multi-table JOIN/UNION
}
```

### Multi-Table Support

- **GET `/api/v1/data/table-relationships?database={db}`** - Detect foreign keys
- **GET `/api/v1/data/suggested-joins?database={db}&primary_table={table}`** - Suggest joinable tables
- **GET `/api/v1/data/suggested-unions?database={db}&primary_table={table}`** - Suggest UNION-compatible tables
- **POST `/api/v1/data/merged-columns`** - Get merged schema for JOIN/UNION queries

## Query Generation & Optimization

### QueryService Pipeline

`QueryService.translate_to_sql()` orchestrates:

1. **Table Context**: Build PyPika query with single table or JOINs/UNIONs
2. **Select Builder**: Dimensions, measures, datetime extraction, type casting
3. **Filter Builder**: WHERE clauses, regex sampling, null guards
4. **Optimization**: Apply strategies (rounding, binning, deduplication)
5. **Grouping/Ordering**: GROUP BY, DISTINCT, ORDER BY
6. **Sampling/Limits**: Automatic sampling for large raw queries

### Query Optimization

**QueryOptimizer** analyzes queries and applies strategies:

- **Adaptive Rounding**: Round numeric values when result set is large
- **DateTime Binning**: Bin continuous datetime dimensions
- **Category Deduplication**: Remove duplicate category values
- **Discrete Deduplication**: DISTINCT for discrete-only queries
- **Sampling**: Automatic sampling for large raw queries (no aggregations)

**Optimization Flow**:
```
QueryDescription → Estimator (size estimate) → StrategyPlanner → OptimizationPlan → Apply Strategies
```

**Result Size Estimation**: Database-specific estimators (`ClickHouseEstimator`, `DuckDBEstimator`) use EXPLAIN queries or table statistics.

## Connectors

### BaseConnector Interface

All connectors implement:
- `connect(connection_details)` - Establish connection
- `disconnect()` - Close connection
- `list_databases()` - List available databases
- `list_tables(database)` - List tables
- `list_columns(database, table)` - List columns with types
- `fetch_data(query)` - Execute SQL, return (rows, columns)

### ClickHouseConnector

- Uses `clickhouse-connect` client
- Supports connection string or host/port/user/password
- Database-aware (schema-qualified tables)
- Foreign key detection via heuristics

### FileConnector (CSV via DuckDB)

- CSV upload processing with DuckDB
- Configurable CSV parsing (delimiter, header, decimal/thousands separators, date formats)
- In-memory DuckDB connections per query
- Automatic schema detection via `DESCRIBE`

**Connector Registry** (`ConnectionService`): Factory pattern for connector creation, registered by type (`csv`, `clickhouse`).

## Error Handling

**Exception Hierarchy** (`exceptions.py`):
- `AppException` (base) - All custom exceptions
- `InvalidInputError` (400) - Validation errors
- `DataSourceConnectionError` (503) - Connection failures
- `QueryGenerationError` (400) - SQL generation failures
- `QueryExecutionError` (500) - Query execution failures
- `FileProcessingError` (500) - File upload/processing errors

**Global Exception Handlers** (`main.py`): Convert exceptions to JSON responses with appropriate status codes.

## Configuration

**Environment Variables**:
- `LOG_LEVEL` - Logging level (default: INFO)
- `CORS_ALLOW_ORIGINS` - Comma-separated allowed origins (overrides defaults)
- Optimization config via `OptimizerConfig.from_env()` (thresholds, enable flags)

**Application State** (`app.state`):
- `upload_root_dir` - Temporary directory for CSV uploads (created at startup, cleaned at shutdown)

## Security & Validation

- **SQL Injection Prevention**: PyPika parameterized query construction
- **File Upload Limits**: 64 MiB max CSV size, MIME type validation, CSV format validation
- **Path Safety**: Symlink-safe path checks, session-scoped file deletion
- **Input Validation**: Pydantic models for request validation, `ValidationService` for business rules

## Testing

- **Unit Tests**: `tests/unit/` - Service and component tests
- **Integration Tests**: `tests/integration/` - End-to-end query optimization tests
- **Contract Tests**: `tests/contract/` - API contract validation

