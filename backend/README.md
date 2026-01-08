# Backend Documentation

FastAPI-based REST API providing data connectivity, query processing, and optimization for the data analysis platform.

## Running locally

From the `backend/` directory:

```bash
python -m pip install -r requirements.txt
uvicorn main:app --reload
```

From the repo root:

```bash
python -m pip install -r backend/requirements.txt
uvicorn backend.main:app --reload
```

## Architecture Overview

### Core Components

- **FastAPI Application** ([`main.py`](main.py)): Entry point with CORS, exception handlers, static file serving
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
2. [`get_state_manager`](dependencies.py#L58) dependency provides session-specific [`ConnectionStateManager`](dependencies.py#L17)
3. Router endpoints use [`get_active_connector`](dependencies.py#L99) and [`get_connection_details`](dependencies.py#L108) dependencies
4. Services ([`ConnectionService`](services/connection_service.py#L57), [`QueryService`](services/query_service.py#L75)) orchestrate business logic
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
│   ├── cardinality_service.py   # Distinct count calculations with filters
│   ├── datetime_service.py      # Datetime field transformations and extractions
│   ├── query_components/        # Modular query builders
│   │   ├── select_builder.py
│   │   ├── filter_builder.py
│   │   ├── grouping_ordering_builder.py
│   │   ├── sampling_limits_builder.py
│   │   ├── optimization_applier.py
│   │   ├── table_context_builder.py
│   │   ├── union_query_builder.py
│   │   ├── virtual_column_builder.py
│   │   ├── distinct_applier.py
│   │   ├── field_reference_parser.py
│   │   ├── contexts.py
│   │   └── terms.py
│   ├── optimization/            # Query optimization system
│   │   ├── optimizer.py         # Main optimizer coordinating strategies
│   │   ├── config.py            # Optimizer configuration
│   │   ├── count_cache.py       # Caching for count estimates
│   │   ├── table_size_detector.py  # Small table detection
│   │   ├── strategy_planner.py  # Strategy selection logic
│   │   ├── strategies/          # Optimization strategies
│   │   │   ├── adaptive_rounding.py
│   │   │   ├── datetime_binning.py
│   │   │   ├── category_dedup.py
│   │   │   ├── discrete_dedup.py
│   │   │   └── distinct_pairs.py
│   │   ├── planners/            # Strategy-specific planners
│   │   │   ├── adaptive_rounding_planner.py
│   │   │   └── dedup_planner.py
│   │   └── estimators/          # Result size estimation
│   │       ├── clickhouse.py
│   │       └── duckdb.py
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

The backend supports multiple concurrent users through **session-based state isolation** with **per-tab separation**:

- **Session Identification**: Cookie-based (`session_id` cookie, httponly)
- **Tab Identification**: Header-based (`X-Tab-Id` header, sent by frontend)
- **Composite Key**: State is keyed by `session_id:tab_id` allowing multiple independent sessions per browser
- **State Storage**: In-memory dictionary [`session_storage: Dict[str, ConnectionStateManager]`](dependencies.py)
- **Per-Session State**: Each session (per tab) has its own:
  - Active connector instance
  - Connection details
  - CSV temporary file path (session-scoped upload directory)
  - Async lock for connect/disconnect serialization
  - Creation and last-access timestamps

**Implementation** ([`dependencies.py`](dependencies.py)):
- `get_state_manager`: Creates new session if missing, uses composite key `session_id:tab_id`
- `ConnectionStateManager`: Holds per-session connection state with async lock and timestamps
- `list_active_sessions()`: Debug utility to enumerate all active sessions
- `remove_session()`: Clean up a specific tab session

### Tab Session Lifecycle

1. **Tab Opens**: Frontend generates UUID stored in `sessionStorage`, sent as `X-Tab-Id` header
2. **Tab Active**: All API requests include `X-Tab-Id` header for tab-specific state
3. **Tab Closes**: Frontend sends `navigator.sendBeacon()` to `/disconnect-beacon` endpoint
4. **Cleanup**: Backend removes tab-specific session state

### Debug Endpoint

**GET `/api/v1/data/debug/sessions`** - Lists all active sessions with metadata:
- Session ID and Tab ID
- Connection status and type
- CSV temp file paths
- Creation and last access timestamps

**File Upload Isolation**: CSV uploads stored in `{upload_root_dir}/{session_id}/` directories via [`_get_session_upload_dir`](services/connection_service.py#L69), cleaned up on disconnect via [`disconnect`](services/connection_service.py#L313).

**Note**: For production with multiple server instances, replace in-memory storage with Redis or similar.

## API Endpoints

### Connection Management

**POST [`/api/v1/data/connect`](routers/connection.py)** (multipart/form-data)
- CSV: Upload file + connection details JSON
- ClickHouse: Connection details JSON only
- Handler: [`connect_to_datasource`](routers/data.py#L54) → [`ConnectionService.connect_multipart`](services/connection_service.py#L156)

**POST [`/api/v1/data/connect/json`](routers/data.py#L65)** (application/json)
- ClickHouse connections without file upload
- Handler: [`connect_to_datasource_json`](routers/data.py#L66) → [`ConnectionService.connect_json`](services/connection_service.py#L259)

**POST [`/api/v1/data/disconnect`](routers/data.py#L76)**
- Disconnects connector, cleans up session files
- Handler: [`disconnect_datasource`](routers/data.py#L77) → [`ConnectionService.disconnect`](services/connection_service.py#L313)

### Metadata Discovery

- **GET [`/api/v1/data/databases`](routers/data.py#L86)** - List databases via [`list_databases`](routers/data.py#L87)
- **GET [`/api/v1/data/tables`](routers/data.py#L98)** - List tables via [`list_tables`](routers/data.py#L99)
- **GET [`/api/v1/data/columns`](routers/data.py#L109)** - List columns via [`list_columns`](routers/data.py#L110)
- **POST [`/api/v1/data/distinct-count`](routers/data.py#L140)** - Cardinality queries via [`CardinalityService`](services/cardinality_service.py)

### Query Execution

**POST [`/api/v1/data/query`](routers/data.py#L154)**
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
Handler: [`execute_query`](routers/data.py#L155) → [`QueryService.translate_to_sql`](services/query_service.py#L428)

### Arrow transport

- **POST `/api/v1/data/query-arrow`**: Returns Arrow IPC stream (see `frontend/ARROW.md` for details)

### Multi-Table Support

- **GET [`/api/v1/data/table-relationships`](routers/data.py#L230)** - Detect foreign keys via [`get_table_relationships`](routers/data.py#L231)
- **GET [`/api/v1/data/suggested-joins`](routers/data.py#L248)** - Suggest joinable tables via [`get_suggested_joins`](routers/data.py#L249)
- **GET [`/api/v1/data/suggested-unions`](routers/data.py#L271)** - Suggest UNION-compatible tables via [`get_suggested_unions`](routers/data.py#L272)
- **POST [`/api/v1/data/merged-columns`](routers/data.py#L294)** - Get merged schema via [`get_merged_columns`](routers/data.py#L295) → [`TableMergeService`](services/table_merge_service.py)

## Query Generation & Optimization

### QueryService Pipeline

[`QueryService.translate_to_sql`](services/query_service.py#L428) orchestrates:

1. **Table Context**: [`_build_table_context`](services/query_service.py#L128) - Build PyPika query with single table or JOINs/UNIONs
2. **Select Builder**: [`_build_select_clause`](services/query_service.py#L228) → [`SelectClauseBuilder`](services/query_components/select_builder.py) - Dimensions, measures, datetime extraction, type casting
3. **Filter Builder**: [`_build_filter_criteria`](services/query_service.py#L256) → [`FilterBuilder`](services/query_components/filter_builder.py) - WHERE clauses, regex sampling, null guards
4. **Optimization**: [`_apply_optimizations`](services/query_service.py#L280) → [`OptimizationApplier`](services/query_components/optimization_applier.py) - Apply strategies (rounding, binning, deduplication)
5. **Grouping/Ordering**: [`_apply_grouping`](services/query_service.py#L304) and [`_apply_ordering`](services/query_service.py#L330) → [`GroupingOrderingBuilder`](services/query_components/grouping_ordering_builder.py) - GROUP BY, DISTINCT, ORDER BY
6. **Sampling/Limits**: [`_apply_sampling_and_limits`](services/query_service.py#L345) → [`SamplingAndLimitsBuilder`](services/query_components/sampling_limits_builder.py) - Automatic sampling for large raw queries

### Query Optimization

[`QueryOptimizer`](services/optimization/optimizer.py#L51) analyzes queries and applies strategies:

- **Adaptive Rounding**: [`AdaptiveRoundingStrategy`](services/optimization/strategies/adaptive_rounding.py) - Round numeric values when result set is large
- **DateTime Binning**: [`DateTimeBinningStrategy`](services/optimization/strategies/datetime_binning.py) - Bin continuous datetime dimensions
- **Category Deduplication**: [`CategoryDeduplicationStrategy`](services/optimization/strategies/category_dedup.py) - Remove duplicate category values
- **Discrete Deduplication**: [`DiscreteDeduplicationStrategy`](services/optimization/strategies/discrete_dedup.py) - DISTINCT for discrete-only queries
- **Distinct Pairs**: [`DistinctPairStrategy`](services/optimization/strategies/distinct_pairs.py) - Apply DISTINCT to raw data queries for unique value/pair extraction
- **Sampling**: Automatic sampling for large raw queries (no aggregations)

**Optimization Flow**:
```
QueryDescription → Estimator (size estimate) → StrategyPlanner → OptimizationPlan → Apply Strategies
```

- [`QueryOptimizer.create_plan`](services/optimization/optimizer.py) creates [`OptimizationPlan`](services/optimization/optimizer.py#L20)
- [`StrategyPlanner`](services/optimization/strategy_planner.py) selects strategies based on query characteristics
- **Result Size Estimation**: Database-specific estimators ([`ClickHouseEstimator`](services/optimization/estimators/clickhouse.py), [`DuckDBEstimator`](services/optimization/estimators/duckdb.py)) use EXPLAIN queries or table statistics

## Connectors

### BaseConnector Interface

All connectors implement [`BaseConnector`](connectors/base.py):
- [`connect(connection_details)`](connectors/base.py) - Establish connection
- [`disconnect()`](connectors/base.py) - Close connection
- [`list_databases()`](connectors/base.py) - List available databases
- [`list_tables(database)`](connectors/base.py) - List tables
- [`list_columns(database, table)`](connectors/base.py) - List columns with types
- [`fetch_data(query)`](connectors/base.py) - Execute SQL, return (rows, columns)

### ClickHouseConnector

[`ClickHouseConnector`](connectors/clickhouse_connector.py#L17):
- Uses `clickhouse-connect` client
- Supports connection string or host/port/user/password
- Database-aware (schema-qualified tables)
- Foreign key detection via [`detect_foreign_keys`](connectors/clickhouse_connector.py) heuristics

### FileConnector (CSV via DuckDB)

[`FileConnector`](connectors/file_connector.py):
- CSV upload processing with DuckDB
- Configurable CSV parsing (delimiter, header, decimal/thousands separators, date formats)
- In-memory DuckDB connections per query
- Automatic schema detection via `DESCRIBE`

**Connector Registry**: [`ConnectorRegistry`](services/connection_service.py#L40) factory pattern in [`ConnectionService._get_connector`](services/connection_service.py#L122) for connector creation, registered by type (`csv`, `clickhouse`).

## Error Handling

**Exception Hierarchy** ([`exceptions.py`](exceptions.py)):
- [`AppException`](exceptions.py#L6) (base) - All custom exceptions
- [`InvalidInputError`](exceptions.py#L15) (400) - Validation errors
- [`DataSourceConnectionError`](exceptions.py#L33) (503) - Connection failures
- [`QueryGenerationError`](exceptions.py#L38) (400) - SQL generation failures
- [`QueryExecutionError`](exceptions.py#L43) (500) - Query execution failures
- [`FileProcessingError`](exceptions.py#L48) (500) - File upload/processing errors

**Global Exception Handlers** ([`main.py`](main.py#L123)): Convert exceptions to JSON responses with appropriate status codes via [`app_exception_handler`](main.py#L132), [`data_source_exception_handler`](main.py#L140), [`query_execution_exception_handler`](main.py#L149).

## Configuration

**Environment Variables**:
- `LOG_LEVEL` - Logging level (default: INFO), configured in [`main.py`](main.py#L20)
- `CORS_ALLOW_ORIGINS` - Comma-separated allowed origins (overrides defaults), configured in [`main.py`](main.py#L45)
- Optimization config via [`OptimizerConfig.from_env`](services/optimization/config.py) (thresholds, enable flags)

**Application State** (`app.state`):
- `upload_root_dir` - Temporary directory for CSV uploads (created at [`startup_event`](main.py#L77), cleaned at [`shutdown_event`](main.py#L108))

## Security & Validation

- **SQL Injection Prevention**: PyPika parameterized query construction in [`QueryService`](services/query_service.py)
- **File Upload Limits**: 64 MiB max CSV size, MIME type validation, CSV format validation in [`ConnectionService._save_uploaded_file_with_limit`](services/connection_service.py#L85) and [`_validate_csv_file`](services/connection_service.py#L103)
- **Path Safety**: Symlink-safe path checks via [`_is_path_within_directory`](services/connection_service.py#L75), session-scoped file deletion
- **Input Validation**: Pydantic models ([`ConnectionDetails`](models/data_source.py), [`QueryDescription`](models/query.py)) for request validation, [`ValidationService`](services/validation_service.py) for business rules

## Testing

- **Unit Tests**: [`tests/unit/`](tests/unit/) - Service and component tests
- **Integration Tests**: [`tests/integration/`](tests/integration/) - End-to-end query optimization tests
- **Contract Tests**: [`tests/contract/`](tests/contract/) - API contract validation

