# Frontend API Communication

This document details the frontend's API communication system, including data source connections, query handling, and backend integration using pypika notation.

## API Service Architecture

### Core Service: `apiService.ts`

The `apiService.ts` module handles all communication with the backend, providing a centralized interface for:

- **Data source connections**: Database connections and file uploads
- **Metadata operations**: Listing databases, tables, and columns
- **Query execution**: Dynamic SQL query execution with results handling
- **Error management**: Comprehensive error handling and response processing

### Request/Response Flow

```typescript
Frontend Request → apiService.ts → Backend API → Database/Files → Response Processing
```

## Connection Management

### Database Connections

#### Connection Establishment
```typescript
// Connect to database
const connection = await apiService.connect({
  type: 'database',
  host: 'localhost',
  port: 5432,
  database: 'analytics',
  username: 'user',
  password: 'password'
});
```

#### Connection State
- **Connected state tracking**: Managed through `ConnectionContext`
- **Auto-reconnection**: Handles connection timeouts and retries
- **Connection validation**: Periodic health checks

### File Upload Support

#### CSV File Upload
```typescript
// Upload and connect to CSV file
const fileConnection = await apiService.connect({
  type: 'file',
  file: csvFileObject,
  tableName: 'uploaded_data'
});
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
const columns = await apiService.listColumns(databaseName, tableName);
// Returns: Array<{ name: string; type: string; nullable: boolean }>
```

## Query System

### Query Description Interface

The frontend uses a structured query description format that gets translated to SQL:

```typescript
interface QueryDescription {
  dimensions: Array<{
    field: string;
    flavour: 'discrete' | 'continuous';
  }>;
  measures: Array<{
    field: string;
    aggregation: 'count' | 'sum' | 'avg' | 'min' | 'max' | 'median' | 'countd';
    flavour: 'discrete' | 'continuous';
  }>;
  filters: Array<{
    field: string;
    operator: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'in' | 'not in' | 'like' | 'ilike';
    value: any;
  }>;
  orderBy: Array<{
    field: string;
    direction: 'asc' | 'desc';
  }>;
  limit?: number;
}
```

### Query Execution

```typescript
// Execute query
const result = await apiService.executeQuery(queryDescription);
// Returns: { columns: ColumnInfo[], data: Record<string, any>[] }
```

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
```

#### Measure Aggregation
```python
from pypika.functions import Sum, Avg, Count, Min, Max

# Aggregation functions
query = query.select(
    Sum(table.revenue).as_('total_revenue'),
    Avg(table.price).as_('avg_price'),
    Count('*').as_('record_count')
)
```

#### Filter Application
```python
from pypika import Criterion

# Filter conditions
criteria = []
criteria.append(table.category == 'Electronics')
criteria.append(table.price > 100)

if criteria:
    query = query.where(Criterion.all(criteria))
```

#### Complex Query Example
```python
# Complete query with dimensions, measures, and filters
query = Query.from_(table)\
    .select(
        table.region,           # Dimension
        table.category,         # Dimension  
        Sum(table.revenue),     # Measure
        Count('*')              # Measure
    )\
    .where(table.date >= '2023-01-01')\
    .groupby(table.region, table.category)\
    .orderby(table.region, Sum(table.revenue), order=Order.desc)
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

#### Query Validation Errors
- **Syntax errors**: Invalid query structure
- **Field validation**: Non-existent fields or tables
- **Type mismatches**: Incompatible operations on field types

#### Execution Errors
- **Database errors**: SQL execution failures
- **Permission errors**: Access denied to resources
- **Timeout errors**: Query execution timeouts

#### Network Errors
- **Connection failures**: Backend unreachable
- **Authentication errors**: Invalid credentials
- **CORS issues**: Cross-origin request problems

## Loading States and Cancellation

### Timeout Management

```typescript
// Configurable timeouts
const timeoutConfig = {
  query: isDevelopment ? 2000 : 3000,      // Query execution
  metadata: isDevelopment ? 3000 : 5000,   // Metadata operations
  connection: isDevelopment ? 2000 : 4000  // Connection establishment
};
```

### Request Cancellation

```typescript
// AbortController integration
const controller = new AbortController();

try {
  const result = await apiService.executeQuery(query, {
    signal: controller.signal
  });
} catch (error) {
  if (error.name === 'AbortError') {
    // Request was cancelled
    console.log('Query cancelled by user');
  }
}

// Cancel request
controller.abort();
```

### Loading Modal Integration

The API service integrates with the loading modal system:

- **Operation tracking**: Distinguishes between query, metadata, and connection operations
- **Progress indication**: Visual feedback for long-running operations
- **User cancellation**: Ability to cancel ongoing requests

## Data Processing

### Response Transformation

```typescript
// Backend response format
interface QueryResult {
  columns: Array<{
    name: string;
    type: string;
    nullable: boolean;
  }>;
  data: Array<Record<string, any>>;
  rowCount: number;
  executionTime: number;
}

// Frontend processing
const processQueryResult = (result: QueryResult) => {
  // Type conversion and validation
  const processedData = result.data.map(row => {
    // Handle null values, type conversions, etc.
    return processRowData(row, result.columns);
  });
  
  return {
    columns: result.columns,
    data: processedData,
    metadata: {
      rowCount: result.rowCount,
      executionTime: result.executionTime
    }
  };
};
```

### Large Dataset Handling

#### Pagination Support
```typescript
// Paginated queries
const pagedQuery = {
  ...baseQuery,
  limit: 1000,
  offset: pageNumber * 1000
};
```

#### Streaming Support (Future)
- **Progressive loading**: Load data in chunks
- **Memory management**: Efficient handling of large result sets
- **User experience**: Incremental data display

## Performance Optimizations

### Query Optimization

#### Field Selection
- **Selective queries**: Only request needed fields
- **Aggregation pushdown**: Perform aggregations in database
- **Index hints**: Leverage database indexing strategies

#### Caching Strategy
- **Metadata caching**: Cache table and column information
- **Query result caching**: Cache frequently accessed data
- **Cache invalidation**: Smart cache refresh policies

### Network Optimization

#### Request Batching
- **Bulk operations**: Combine related requests
- **Metadata bundling**: Fetch related metadata together
- **Connection pooling**: Efficient connection reuse

#### Compression
- **Response compression**: Enable gzip/brotli compression
- **Request optimization**: Minimize request payload size

## Security Considerations

### Authentication
- **Token-based auth**: JWT or similar token systems
- **Session management**: Secure session handling
- **Credential protection**: Secure credential storage

### Data Protection
- **HTTPS enforcement**: All API communication over HTTPS
- **Input validation**: Sanitize all user inputs
- **SQL injection prevention**: Parameterized queries through pypika

### Access Control
- **Role-based access**: User permission checking
- **Resource isolation**: User-specific data access
- **Audit logging**: Track data access and modifications

## Future Enhancements

### Planned Features
- **Real-time data**: WebSocket support for live data updates
- **Advanced caching**: Intelligent query result caching
- **Query optimization**: Automatic query performance tuning
- **Batch operations**: Bulk data operations support
- **Data export**: CSV/Excel export functionality
- **Query history**: Save and replay previous queries