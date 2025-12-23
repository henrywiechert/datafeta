# Apache Arrow Integration

This document describes how Apache Arrow is used as the data transport format between the backend and frontend in Data Slicer.

## Overview

Apache Arrow is a columnar memory format designed for efficient analytics. It provides:
- **Zero-copy reads**: Data can be accessed without deserialization overhead
- **Language-agnostic**: Same binary format works across Python, JavaScript, and other languages
- **Efficient compression**: Columnar layout enables better compression ratios
- **Streaming support**: Data can be transmitted as IPC (Inter-Process Communication) streams

## Why Arrow Instead of JSON?

Traditional JSON-based data transport has several drawbacks:

| Aspect | JSON | Arrow |
|--------|------|-------|
| Serialization | Text-based, requires parsing | Binary, zero-copy |
| Size | Larger (text + escaping) | Compact binary |
| Type preservation | Limited (no BigInt, Date precision) | Full type fidelity |
| Performance | O(n) parsing | Direct memory access |

For datasets with 10,000+ rows, Arrow typically provides 3-5x smaller payload sizes and significantly faster parsing.

## Backend Implementation

### Connector Interface

Each data connector (ClickHouse, DuckDB/CSV) can export Arrow via the base connector helper:

```python
# backend/connectors/base.py
class BaseConnector(ABC):
    def fetch_data_arrow(self, query: str) -> pa.Table:
        """Execute query and return results as a PyArrow Table."""
```

### ClickHouse Connector

ClickHouse natively supports Arrow format via the `arrow` format specifier:

```python
# Uses ClickHouse's native Arrow streaming
response = self.client.query(sql, fmt="arrow")
return pa.ipc.open_stream(response).read_all()
```

### File Connector (DuckDB)

DuckDB provides direct Arrow table export:

```python
result = self.conn.execute(sql)
return result.fetch_arrow_table()
```

### API Endpoint

The `/query-arrow` endpoint streams Arrow IPC format with metadata headers:

**Request**: Same `QueryDescription` JSON as `/query`

**Response**:
- Content-Type: `application/vnd.apache.arrow.stream`
- Headers:
  - `X-Arrow-Row-Count`: Number of rows
  - `X-Arrow-Column-Count`: Number of columns
  - `X-Query-Sql-Base64`: Base64-encoded SQL query (for debugging)
- Body: Arrow IPC stream bytes

## Frontend Implementation

### Parsing Arrow Data

The frontend uses the `apache-arrow` npm package to parse Arrow IPC streams:

```typescript
import { tableFromIPC } from 'apache-arrow';

const arrayBuffer = await response.arrayBuffer();
const arrowTable = tableFromIPC(arrayBuffer);
```

### Converting to Row Format

For compatibility with existing visualization code, Arrow tables are converted to row arrays:

```typescript
const rows = [];
for (let i = 0; i < arrowTable.numRows; i++) {
  const row = {};
  for (const field of arrowTable.schema.fields) {
    row[field.name] = arrowTable.getChild(field.name)?.get(i);
  }
  rows.push(row);
}
```

### BigInt Handling

Arrow preserves 64-bit integers as JavaScript BigInt, which requires conversion for JSON serialization and chart rendering:

```typescript
const convertValue = (value) => {
  if (typeof value === 'bigint') {
    return Number.isSafeInteger(Number(value)) 
      ? Number(value) 
      : value.toString();
  }
  return value;
};
```

## API Methods

### `executeQueryArrow(queryDesc)`
Returns parsed result with rows/columns in standard format. Used when DuckDB WASM is not ready.

### `executeQueryArrowRaw(queryDesc)`
Returns the raw Arrow table object along with metadata. Used when DuckDB WASM caching is enabled, allowing the Arrow table to be registered directly.

## Related Docs

- `frontend/DUCKDB_WASM.md` describes how Arrow results are registered into DuckDB WASM for local caching/querying.

## Fallback Mechanism

The frontend gracefully falls back to JSON if Arrow transport fails:

```typescript
try {
  result = await apiService.executeQueryArrow(queryDesc, signal);
} catch (arrowError) {
  console.warn('Arrow transport failed, falling back to JSON');
  result = await apiService.executeQuery(queryDesc, signal);
}
```

## Performance Considerations

### When Arrow Provides Most Benefit
- Large result sets (> 1,000 rows)
- Numeric-heavy data (aggregations, time series)
- Repeated queries (cached Arrow tables)

### When JSON May Be Acceptable
- Small result sets (< 100 rows)
- Metadata queries (table/column lists)
- Error responses (always JSON)

## Future Enhancements

1. **Streaming large results**: Process Arrow batches as they arrive instead of waiting for complete response
2. **Compression**: Enable LZ4/ZSTD compression for Arrow IPC streams
3. **Direct rendering**: Pass Arrow data directly to visualization libraries that support it
4. **Shared memory**: Use SharedArrayBuffer for web worker communication

