# Frontend API Communication

This document details the frontend's API communication system, including data source connections, query handling, and backend integration using pypika notation.

**Last Updated**: December 24, 2025

## API Service Architecture

### Core Service: `apiService.ts`

The `apiService.ts` module handles all communication with the backend, providing a centralized interface for:

- **Data source connections**: Database connections and file uploads with session management
- **Metadata operations**: Listing databases, tables, and columns
- **Multi-table support**: Table joins, unions, and relationship discovery
- **Query execution**: Dynamic SQL query execution with optimization support
- **Filter metadata**: Distinct values, ranges, and cardinality checks
- **Error management**: Comprehensive error handling and response processing
- **Request cancellation**: AbortController integration for cancellable operations

### Request/Response Flow

```typescript
Frontend Request → apiService.ts → Backend API (Session-based) → Database/Files → Response Processing
```

### Session Management

The backend uses session-based state management to track connections per user:
- Each connection is scoped to a session ID (managed via cookies)
- Session state includes active connector, connection details, and temporary files
- Disconnection properly cleans up session resources

## Connection Management

### ClickHouse Connections

#### Connection Establishment
```typescript
// Connect to ClickHouse (session-based; cookies are used)
await apiService.connect({
  type: 'clickhouse',
  host: 'localhost',
  port: 8123,       // ClickHouse HTTP interface
  user: 'default',
  password: '',
  database: 'default',
});
```

#### Connection State
- **Session-based tracking**: Each connection is scoped to a user session
- **State management**: Managed through backend `ConnectionStateManager`
- **Resource cleanup**: Automatic cleanup on disconnection or session timeout

### CSV Upload Support

#### CSV File Upload
```typescript
// Upload and connect to a CSV file (multipart/form-data under the hood)
await apiService.connect(
  { type: 'csv', csv_delimiter: ',', csv_has_header: true },
  csvFileObject
);
```

#### File Processing
- **DuckDB integration**: Backend uses DuckDB for file processing
- **Automatic schema detection**: Field types inferred from file content
- **Temporary storage**: Files stored in backend temporary directory

### Disconnection Handling
```typescript
// Clean disconnection
await apiService.disconnect();
```

## Metadata Operations

### Database Listing
```typescript
// Get available databases
const databases = await apiService.listDatabases();
// Returns: Array<{ name: string; type: string }>
```

### Table Discovery
```typescript
// Get tables in database
const tables = await apiService.listTables(databaseName);
// Returns: Array<{ name: string; type: string }>
```

### Column Introspection
```typescript
// Get columns for table
const columns = await apiService.listColumns(tableName, databaseName);
// Returns: Array<{ name: string; type: string; nullable: boolean }>
```

## Query System

### Query Description Interface

The frontend uses a structured query description format that gets translated to SQL:

```typescript
interface QueryDescription {
  target_table: string;
  target_database?: string;  // Required for ClickHouse and similar databases
  
  dimensions: Array<{
    field: string;
    flavour: 'discrete' | 'continuous';
    axis?: 'x' | 'y';  // For visualization positioning
    date_part?: 'year' | 'month' | 'day' | 'weekday' | 'hour' | 'minute' | 'second' | 'millisecond' | 'microsecond' | 'nanosecond';
    date_mode?: 'distinct' | 'timeline';  // How to handle datetime dimensions
  }>;
  
  measures: Array<{
    field: string;
    aggregation: 'count' | 'sum' | 'avg' | 'min' | 'max' | 'count_distinct';
    alias: string;
  }>;
  
  filters: Array<{
    field: string;
    operator: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'in' | 'not in' | 'like' | 'ilike' | 'is null' | 'is not null';
    value: any;
    date_part?: string;  // For datetime filtering
    date_mode?: string;
  }>;
  
  orderBy: Array<{
    field: string;
    direction: 'asc' | 'desc';
  }>;
  
  limit?: number;
  offset?: number;
  
  // Advanced features
  optimization_hints?: OptimizationHints;  // Query optimization configuration
  column_casts?: Record<string, { cast_type: string; replacement_pattern?: string }>;  // Handle quoted numbers
  distinct_value_regex?: string;  // Filter distinct values with LIKE pattern
  use_random_sample?: boolean;  // Use random sampling for distinct values
  fetch_filter_values?: boolean;  // Flag for filter dropdown queries
  label_fields?: string[];  // Fields needed for visualization labels
  virtual_table?: VirtualTableDefinition;  // Multi-table join/union support
  virtual_columns?: VirtualColumnDefinition[];  // Calculated columns
}
```

### Optimization Hints

The frontend can provide optimization hints to improve query performance:

```typescript
interface OptimizationHints {
  // Field-level optimization hints
  field_hints?: Array<{
    field: string;
    enable_rounding: boolean;  // Apply rounding to continuous values
    rounding_threshold?: number;  // Custom threshold for this field
    enable_sampling: boolean;  // Apply sampling for this field
    sampling_rate?: number;  // Sampling rate (0.0 - 1.0)
    reason: string;  // Explanation (e.g., "continuous_dimension")
  }>;
  
  // Global optimizations
  enable_global_distinct?: boolean;  // Apply DISTINCT to remove duplicates
  
  // Performance vs accuracy
  optimization_level?: 'none' | 'light' | 'balanced' | 'aggressive';
  
  // Context information
  purpose?: string;  // e.g., "preview", "final_result"
  chart_context?: Record<string, any>;
}
```

### Virtual Table Definition

Support for multi-table queries (joins and unions):

```typescript
interface VirtualTableDefinition {
  primary_table: string;
  mode: 'join' | 'union';
  
  // JOIN mode
  joined_tables?: string[];  // Tables to join
  join_conditions?: Array<{
    left_table: string;
    left_column: string;
    right_table: string;
    right_column: string;
    join_type: 'inner' | 'left' | 'right' | 'full';
  }>;
  
  // UNION mode (cross-database support)
  union_tables?: Array<{
    database?: string;  // Optional: different database
    table_name: string;
  }>;
  
  name?: string;  // Virtual table name
}
```

### Virtual Columns

Define calculated columns using SQL expressions:

```typescript
interface VirtualColumnDefinition {
  name: string;  // Column alias
  expression: string;  // SQL expression
  data_type?: string;  // Expected data type
}
### Query Execution

```typescript
// Execute query
const result = await apiService.executeQuery(queryDescription);
// Returns: QueryResult with columns, data, and optimization metadata
```

### Arrow transport

For larger result sets, the frontend may use the Arrow endpoint to reduce payload size and parse time:

- `POST /api/v1/data/query-arrow` (Arrow IPC stream)
- Falls back to JSON (`/api/v1/data/query`) when needed

### Query Result Structure

```typescript
interface QueryResult {
  columns: Array<{ name: string; type: string }>;
  rows: Array<Record<string, any>>;
  row_count: number;
  query_sql?: string;  // Generated SQL (for debugging)
  error?: string;  // Error message if query failed
  
  // Optimization metadata
  optimizations_applied?: Array<{
    type: string;
    details: any;
  }>;
  original_estimate?: number;  // Estimated rows before optimization
  reduction_factor?: number;  // How much data was reduced
  optimization_hints_used?: OptimizationHints;  // Hints actually applied
  optimization_override?: {
    skip_all_optimizations: boolean;
    reason?: string;  // e.g., "table_too_small"
    table_stats?: any;
  };
  
  // Result dimensions
  result_dimensions?: {
    rows: number;
    columns: number;
    size_display: string;  // e.g., "1,234 × 5"
  };
  
  // Label fields included in result
  label_fields?: string[];
}
```

## Filter Metadata Operations

The API provides specialized endpoints for fetching filter metadata:

### Get Distinct Values

Fetch distinct values for a discrete field (used in filter dropdowns):

```typescript
const values = await apiService.getDistinctValues(
  field: string,
  table: string,
  database?: string,
  dateTimePart?: string,  // Extract part of datetime
  dateTimeMode?: string,
  regexPattern?: string,  // Filter values with LIKE pattern
  limit?: number,
  useRandomSample?: boolean,  // Use random sampling
  unionTables?: string[],  // For union queries
  virtualColumns?: VirtualColumnDefinition[],
  signal?: AbortSignal
);
// Returns: Array of distinct values
```

### Get Distinct Values Count

Check cardinality before fetching all values:

```typescript
const count = await apiService.getDistinctValuesCount(
  field: string,
  table: string,
  database?: string,
  regexPattern?: string,
  dateTimePart?: string,
  dateTimeMode?: string,
  unionTables?: string[],
  virtualColumns?: VirtualColumnDefinition[],
  signal?: AbortSignal
);
// Returns: Number of distinct values
```

### Get Field Range

Fetch min/max range for continuous fields:

```typescript
const range = await apiService.getFieldRange(
  field: string,
  table: string,
  database?: string,
  virtualColumns?: VirtualColumnDefinition[],
  unionTables?: string[],
  signal?: AbortSignal
);
// Returns: { min: number, max: number }
```

### Get DateTime Range

Fetch min/max date range for datetime fields:

```typescript
const range = await apiService.getDateTimeRange(
  field: string,
  table: string,
  database?: string,
  virtualColumns?: VirtualColumnDefinition[],
  unionTables?: string[],
  signal?: AbortSignal
);
// Returns: { min: string, max: string }
```

## Multi-Table Support

### Table Relationships

Detect foreign key relationships in a database:

```typescript
const relationships = await apiService.getTableRelationships(
  database: string,
  signal?: AbortSignal
);
// Returns: Array of detected relationships with join conditions
```

### Suggested Joins

Get tables that can be joined to a primary table:

```typescript
const suggestions = await apiService.getSuggestedJoins(
  database: string,
  primaryTable: string,
  signal?: AbortSignal
);
// Returns: { primary_table: string, suggested_tables: string[] }
```

### Merged Columns

Get merged column list from multiple tables (JOIN or UNION mode):

```typescript
const merged = await apiService.getMergedColumns(
  database: string,
  primaryTable: string,
  joinedTables?: string[],  // For JOIN mode
  unionTables?: Array<{database: string, table_name: string}> | string[],  // For UNION mode
  autoDetect?: boolean,  // Auto-detect join conditions
  signal?: AbortSignal
);
// Returns: MergedColumnsResponse with columns and virtual table definition
```

**UNION Mode**: Supports cross-database unions with flexible schemas:
- Tables can have different columns (NULL fill for missing columns)
- Automatically adds `_source_database` and `_source_table` virtual columns
- Supports both new format: `[{database: "db1", table_name: "orders"}, ...]`
- And legacy format: `["table1", "table2"]` (uses default database)

## Pypika Integration

### Backend Query Translation

The backend translates frontend query descriptions to SQL using pypika:

#### Basic Query Structure
```python
from pypika import Query, Table, Field, Order

# Basic query construction
table = Table('table_name')
query = Query.from_(table)
```

#### Dimension Handling
```python
# Discrete dimensions - grouping
query = query.select(table.dimension1, table.dimension2)
         .groupby(table.dimension1, table.dimension2)

# Continuous dimensions - distinct values
query = query.select(table.continuous_dim).distinct()
         .orderby(table.continuous_dim)

# DateTime dimensions with date_part extraction
from pypika.functions import Extract
query = query.select(Extract('year', table.order_date).as_('order_date_year'))
         .groupby(Extract('year', table.order_date))
```

#### Measure Aggregation
```python
from pypika.functions import Sum, Avg, Count, Min, Max

# Aggregation functions
query = query.select(
    Sum(table.revenue).as_('total_revenue'),
    Avg(table.price).as_('avg_price'),
    Count('*').as_('record_count'),
    Count(table.customer_id).distinct().as_('unique_customers')
)
```

#### Filter Application
```python
from pypika import Criterion

# Filter conditions
criteria = []
criteria.append(table.category == 'Electronics')
criteria.append(table.price > 100)
criteria.append(table.status.isin(['active', 'pending']))
criteria.append(table.description.like('%discount%'))

if criteria:
    query = query.where(Criterion.all(criteria))
```

#### Virtual Columns (Calculated Fields)
```python
# Define calculated column
from pypika import Case, Field

# Example: margin calculation
margin_expr = (table.revenue - table.cost) / table.revenue * 100
query = query.select(margin_expr.as_('profit_margin'))

# Conditional expressions
status_label = Case()
    .when(table.amount > 1000, 'High')
    .when(table.amount > 500, 'Medium')
    .else_('Low')
    .as_('tier')
```

#### Multi-Table Queries

**JOIN Mode:**
```python
# Join tables
orders = Table('orders')
customers = Table('customers')

query = Query.from_(orders)\
    .join(customers).on(orders.customer_id == customers.id)\
    .select(
        orders.order_id,
        customers.name,
        orders.total
    )
```

**UNION Mode (Cross-Database):**
```python
# Union multiple tables with different schemas
from pypika import Query, Table
from pypika.functions import Coalesce

db1_orders = Table('orders').from_('db1')
db2_orders = Table('orders').from_('db2')

# Add source tracking columns
query1 = Query.from_(db1_orders).select(
    db1_orders.order_id,
    Coalesce(db1_orders.amount, None).as_('amount'),  # NULL fill for missing columns
    'db1'.as_('_source_database'),
    'orders'.as_('_source_table')
)

query2 = Query.from_(db2_orders).select(
    db2_orders.order_id,
    Coalesce(db2_orders.amount, None).as_('amount'),
    'db2'.as_('_source_database'),
    'orders'.as_('_source_table')
)

union_query = query1.union_all(query2)
```

#### Column Casting (Quoted Numbers)
```python
# Handle quoted numbers with replacement patterns
from pypika import Field
from pypika.functions import Cast

# Replace commas and cast to numeric
revenue_field = Cast(
    table.revenue.replace(',', ''),
    'DOUBLE'
).as_('revenue')

query = query.select(revenue_field)
```

#### Query Optimization
```python
# Apply optimization hints

# 1. Rounding for continuous dimensions
from pypika.functions import Round
rounded_value = Round(table.price / 100) * 100
query = query.select(rounded_value.as_('price_rounded'))

# 2. Sampling for large datasets
query = query.orderby('RANDOM()').limit(10000)

# 3. Global DISTINCT for deduplication
query = query.distinct()
```

#### Complex Query Example
```python
# Complete query with dimensions, measures, filters, and optimization
from pypika import Query, Table, Order, Field
from pypika.functions import Sum, Count, Round, Extract

orders = Table('orders')
customers = Table('customers')

# Join with optimization
query = Query.from_(orders)\
    .join(customers).on(orders.customer_id == customers.id)\
    .select(
        Extract('year', orders.order_date).as_('year'),  # DateTime dimension
        customers.region,                                 # Discrete dimension
        Round(orders.amount / 100) * 100,                # Rounded continuous dimension
        Sum(orders.amount).as_('total_revenue'),         # Measure
        Count('*').as_('order_count')                    # Measure
    )\
    .where(orders.order_date >= '2023-01-01')\
    .where(orders.status == 'completed')\
    .groupby(
        Extract('year', orders.order_date),
        customers.region,
        Round(orders.amount / 100) * 100
    )\
    .orderby(
        Extract('year', orders.order_date),
        Sum(orders.amount),
        order=Order.desc
    )\
    .limit(1000)
```

## Error Handling

### API Response Processing

```typescript
// Centralized error handling
try {
  const result = await apiService.executeQuery(query);
  return result;
} catch (error) {
  if (error.response?.status === 400) {
    // Bad request - query syntax error
    throw new QueryValidationError(error.message);
  } else if (error.response?.status === 500) {
    // Server error - execution failure
    throw new QueryExecutionError(error.message);
  } else {
    // Network or other errors
    throw new NetworkError(error.message);
  }
}
```

### Error Types

#### Query Validation Errors (HTTP 422)
- **Syntax errors**: Invalid query structure or malformed JSON
- **Field validation**: Non-existent fields or tables
- **Type mismatches**: Incompatible operations on field types
- **Pydantic validation**: Missing required fields or invalid data types

#### Query Execution Errors (HTTP 500)
- **Database errors**: SQL execution failures
- **Permission errors**: Access denied to resources
- **Timeout errors**: Query execution timeouts

#### Connection Errors (HTTP 400/500)
- **Connection failures**: Backend unreachable or database connection failed
- **Authentication errors**: Invalid credentials
- **Session errors**: Invalid or expired session

#### Network Errors
- **CORS issues**: Cross-origin request problems
- **Timeout**: Request timeout
- **Abort**: Request cancelled by user

## Loading States and Cancellation

### AbortController Integration

The API service uses AbortController for request cancellation:

```typescript
// Internal abort controller management
const controller = apiService.createNewAbortController();

// Execute query with cancellation support
try {
  const result = await apiService.executeQuery(query, controller.signal);
} catch (error) {
  if (error.message === 'Request was cancelled') {
    console.log('Query cancelled by user');
  }
}

// Cancel request
controller.abort();

// Cancel all ongoing requests
apiService.cancelAllRequests();
```

### Request Cancellation Pattern

Each API method accepts an optional `signal?: AbortSignal` parameter:

```typescript
// Pass custom signal
const customController = new AbortController();
await apiService.listTables(database, customController.signal);

// Or use internal controller (auto-created)
await apiService.listTables(database);  // Creates internal controller
```

### Loading State Management

The API integrates with the frontend's loading system:
- **Operation tracking**: Distinguishes between query, metadata, and connection operations
- **Progress indication**: Visual feedback for long-running operations
- **User cancellation**: Ability to cancel ongoing requests
- **Error recovery**: Graceful handling of cancelled requests

## Data Processing

### Response Transformation

```typescript
// Backend response format
interface QueryResult {
  columns: Array<{
    name: string;
    type: string;
  }>;
  rows: Array<Record<string, any>>;
  row_count: number;
  query_sql?: string;
  
  // Optimization metadata
  optimizations_applied?: Array<{
    type: string;
    details: any;
  }>;
  original_estimate?: number;
  reduction_factor?: number;
  optimization_hints_used?: OptimizationHints;
  optimization_override?: OptimizationOverride;
  
  result_dimensions?: {
    rows: number;
    columns: number;
    size_display: string;
  };
}

// Frontend processing
const processQueryResult = (result: QueryResult) => {
  // Type conversion and validation
  const processedData = result.rows.map(row => {
    // Handle null values, type conversions, etc.
    return processRowData(row, result.columns);
  });
  
  return {
    columns: result.columns,
    data: processedData,
    metadata: {
      rowCount: result.row_count,
      sqlQuery: result.query_sql,
      optimizations: result.optimizations_applied,
      dimensions: result.result_dimensions
    }
  };
};
```

### Virtual Column Handling

Virtual columns (calculated fields) are included in query results:

```typescript
// Define virtual column
const virtualColumn: VirtualColumnDefinition = {
  name: 'profit_margin',
  expression: '(revenue - cost) / revenue * 100',
  data_type: 'Float64'
};

// Include in query
const queryDesc = {
  target_table: 'sales',
  virtual_columns: [virtualColumn],
  dimensions: [{ field: 'profit_margin', flavour: 'continuous' }],
  // ...
};

// Result includes the calculated column
// rows: [{ profit_margin: 25.5, ... }]
```

### Source Tracking in UNION Queries

UNION queries automatically include source tracking columns:

```typescript
// Querying union of multiple tables
const result = await apiService.executeQuery({
  target_table: 'orders',
  virtual_table: {
    mode: 'union',
    union_tables: [
      { database: 'db1', table_name: 'orders' },
      { database: 'db2', table_name: 'orders' }
    ]
  },
  dimensions: [
    { field: 'order_id', flavour: 'discrete' },
    { field: '_source_database', flavour: 'discrete' },  // Auto-added
    { field: '_source_table', flavour: 'discrete' }      // Auto-added
  ]
});

// Result rows include source information
// rows: [
//   { order_id: 123, _source_database: 'db1', _source_table: 'orders' },
//   { order_id: 456, _source_database: 'db2', _source_table: 'orders' }
// ]
```

## Performance Optimizations

### Query Optimization System

The backend includes a comprehensive query optimization system:

#### Field-Level Optimization
```typescript
// Frontend sends field-specific optimization hints
const queryDesc = {
  target_table: 'sales',
  dimensions: [
    { field: 'price', flavour: 'continuous' },
    { field: 'category', flavour: 'discrete' }
  ],
  optimization_hints: {
    field_hints: [
      {
        field: 'price',
        enable_rounding: true,
        rounding_threshold: 100,  // Round to nearest $100
        reason: 'continuous_dimension'
      }
    ],
    optimization_level: 'balanced'
  }
};
```

#### Backend Optimization Logic
- **Sampling**: Apply random sampling for large raw queries
- **Rounding**: Round continuous values to reduce cardinality
- **Distinct**: Apply global DISTINCT for deduplication
- **Early filtering**: Push filters to database level
- **Smart overrides**: Backend can skip optimizations for small tables

#### Optimization Metadata
Query results include optimization information:
```typescript
{
  optimizations_applied: [
    { type: 'rounding', details: { field: 'price', threshold: 100 } },
    { type: 'sampling', details: { rate: 0.1, estimated_rows: 10000 } }
  ],
  original_estimate: 100000,
  reduction_factor: 0.1,
  optimization_override: {
    skip_all_optimizations: false,
    reason: null
  }
}
```

### Cardinality-Based Optimization

The system checks cardinality before fetching filter values:

```typescript
// Check cardinality first
const count = await apiService.getDistinctValuesCount(field, table, database);

if (count > 1000) {
  // High cardinality - use search with sampling
  const values = await apiService.getDistinctValues(
    field, table, database,
    undefined, undefined,
    searchPattern,  // LIKE filter
    100,           // Limit
    true           // Use random sampling
  );
} else {
  // Low cardinality - fetch all values
  const values = await apiService.getDistinctValues(field, table, database);
}
```

### Column Casting for Performance

Handle quoted numbers and special formats efficiently:

```typescript
const queryDesc = {
  target_table: 'sales',
  column_casts: {
    'Revenue': {
      cast_type: 'DOUBLE',
      replacement_pattern: ','  // Remove commas before casting
    }
  },
  measures: [
    { field: 'Revenue', aggregation: 'sum', alias: 'total_revenue' }
  ]
};

// Backend generates: CAST(REPLACE(Revenue, ',', '') AS DOUBLE)
```

### Caching Strategy
- **Metadata caching**: Table and column information cached at session level
- **Query result caching**: Not implemented (stateless queries)
- **Connection pooling**: Managed by backend per session

## Security Considerations

### Session-Based Authentication
- **Cookie-based sessions**: Session ID managed via HTTP cookies
- **Session isolation**: Each user has isolated connection state
- **Automatic cleanup**: Resources cleaned up on disconnection or timeout

### Data Protection
- **HTTPS enforcement**: All API communication should use HTTPS in production
- **Input validation**: Backend validates all inputs using Pydantic models
- **SQL injection prevention**: Parameterized queries through pypika
- **File upload security**: Temporary files isolated per session, cleaned on disconnect

### Access Control
- **Connection-level isolation**: Users can only access their own connections
- **Database permissions**: Respects underlying database permissions
- **No credential storage**: Credentials not persisted (stateless connections)

## API Endpoints Reference

### Connection Management
- `POST /api/v1/data/connect` - Connect to database or upload CSV file (multipart/form-data)
- `POST /api/v1/data/connect/json` - Connect to database (JSON body, no file)
- `POST /api/v1/data/disconnect` - Disconnect and cleanup resources

### Metadata Operations
- `GET /api/v1/data/databases` - List available databases
- `GET /api/v1/data/tables?database={db}` - List tables in database
- `GET /api/v1/data/columns?table={table}&database={db}` - List columns in table

### Multi-Table Operations
- `GET /api/v1/data/table-relationships?database={db}` - Detect foreign key relationships
- `GET /api/v1/data/suggested-joins?database={db}&primary_table={table}` - Get joinable tables
- `GET /api/v1/data/suggested-unions?database={db}&primary_table={table}` - DEPRECATED (returns empty)
- `POST /api/v1/data/merged-columns?database={db}&primary_table={table}` - Get merged column list (JOIN/UNION)

### Query Execution
- `POST /api/v1/data/query` - Execute query with QueryDescription JSON body
- `POST /api/v1/data/distinct-count` - Get distinct value count for a field

### Environment Variables
- `REACT_APP_API_BASE` - API base URL prefix (default: `/api/v1`)

## Complete API Method Reference

### apiService Methods

```typescript
// Connection
connect(details: ConnectionDetails, file?: File, signal?: AbortSignal): Promise<{message: string}>
disconnect(signal?: AbortSignal): Promise<{message: string}>

// Metadata
listDatabases(signal?: AbortSignal): Promise<DatabaseListResponse>
listTables(database?: string, signal?: AbortSignal): Promise<TableListResponse>
listColumns(table: string, database?: string, signal?: AbortSignal): Promise<ColumnListResponse>

// Multi-table
getTableRelationships(database: string, signal?: AbortSignal): Promise<TableRelationshipsResponse>
getSuggestedJoins(database: string, primaryTable: string, signal?: AbortSignal): Promise<SuggestedJoinsResponse>
getSuggestedUnions(database: string, primaryTable: string, signal?: AbortSignal): Promise<SuggestedUnionsResponse>
getMergedColumns(
  database: string,
  primaryTable: string,
  joinedTables?: string[],
  unionTables?: Array<{database: string, table_name: string}> | string[],
  autoDetect?: boolean,
  signal?: AbortSignal
): Promise<MergedColumnsResponse>

// Query execution
executeQuery(queryDesc: QueryDescription, signal?: AbortSignal): Promise<QueryResult>

// Filter metadata
getDistinctValues(
  field: string,
  table: string,
  database?: string,
  dateTimePart?: string,
  dateTimeMode?: string,
  regexPattern?: string,
  limit?: number,
  useRandomSample?: boolean,
  unionTables?: string[],
  virtualColumns?: VirtualColumnDefinition[],
  signal?: AbortSignal
): Promise<any[]>

getDistinctValuesCount(
  field: string,
  table: string,
  database?: string,
  regexPattern?: string,
  dateTimePart?: string,
  dateTimeMode?: string,
  unionTables?: string[],
  virtualColumns?: VirtualColumnDefinition[],
  signal?: AbortSignal
): Promise<number>

getFieldRange(
  field: string,
  table: string,
  database?: string,
  virtualColumns?: VirtualColumnDefinition[],
  unionTables?: string[],
  signal?: AbortSignal
): Promise<{min: number, max: number}>

getDateTimeRange(
  field: string,
  table: string,
  database?: string,
  virtualColumns?: VirtualColumnDefinition[],
  unionTables?: string[],
  signal?: AbortSignal
): Promise<{min: string, max: string}>

// Request management
cancelAllRequests(): void
getCurrentAbortController(): AbortController | null
createNewAbortController(): AbortController
```

## Future Enhancements

### Planned Features
- **Real-time data**: WebSocket support for live data updates
- **Enhanced caching**: Smart query result caching with invalidation
- **Query optimization**: ML-based query performance tuning
- **Data export**: CSV/Excel export functionality
- **Query history**: Save and replay previous queries
- **Collaborative features**: Share connections and queries
- **Advanced analytics**: Window functions, pivoting, custom aggregations