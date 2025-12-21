# DuckDB WASM Integration

This document describes how DuckDB WASM is integrated into the Data Slicer frontend for local data caching and query optimization.

## Overview

DuckDB WASM brings a full SQL analytics database to the browser. In Data Slicer, it serves as a **local cache layer** that enables:

- Reduced backend round-trips for repeated queries
- Per-chart query optimization without server involvement
- Offline capability for cached data
- Client-side aggregations and transformations

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────┐  │
│  │   Charts    │───▶│ DuckDB WASM │◀───│  Cache Manager  │  │
│  └─────────────┘    └──────┬──────┘    └────────┬────────┘  │
│                            │                     │           │
│                     Local Queries          Cache Metadata    │
└────────────────────────────┼─────────────────────┼───────────┘
                             │                     │
                    ┌────────▼─────────────────────▼────────┐
                    │              Backend API              │
                    │   (Arrow transport, SQL generation)   │
                    └───────────────────────────────────────┘
```

## Service Components

### DuckDBService (`services/duckdbService.ts`)

Manages the DuckDB WASM instance lifecycle:

- **Initialization**: Loads WASM binary and creates database connection
- **Table registration**: Stores query results as in-memory tables
- **Query execution**: Runs SQL against cached tables
- **Resource cleanup**: Manages table lifecycle

**Key Features:**
- Worker-based execution (non-blocking main thread)
- Blob URL workaround for CORS restrictions on CDN-hosted worker scripts
- BigInt-to-Number conversion for JavaScript compatibility

### CacheManager (`services/cacheManager.ts`)

Tracks what data is cached and manages cache lifecycle:

- **Cache keys**: Generated from table name, database, and filter state
- **Metadata tracking**: Row counts, column names, cache timestamps
- **Invalidation**: Clears stale data when filters change
- **Statistics**: Provides cache hit/miss metrics for debugging

### ChartQueryService (`services/chartQueryService.ts`)

Executes optimized queries for individual charts:

- **Per-chart DISTINCT**: Only fetches unique value combinations needed for each chart
- **Adaptive rounding**: Applies precision reduction for continuous dimensions
- **Local aggregation**: Performs GROUP BY operations client-side

## Interaction with Backend Queries

### Query Flow

1. **Initial Query**: When user configures visualization axes, a query is sent to the backend
2. **Arrow Response**: Backend returns data in Arrow format with full precision
3. **Cache Storage**: Arrow table is converted to JSON and stored in DuckDB WASM
4. **Local Queries**: Subsequent chart renders query DuckDB WASM instead of backend

### What the Backend Still Does

| Responsibility | Backend | Frontend (DuckDB) |
|----------------|---------|-------------------|
| SQL generation | ✅ | ❌ |
| Data source connection | ✅ | ❌ |
| Filter application | ✅ | ❌ |
| Query optimization hints | ✅ | ❌ |
| Per-chart optimization | ❌ | ✅ |
| Result caching | ❌ | ✅ |
| DISTINCT reduction | Partial | ✅ |

The backend remains the authoritative query generator. DuckDB WASM performs **post-fetch optimization** on already-retrieved data.

## Caching Strategy

### What Gets Cached

- Complete query result sets from the backend
- One table per unique combination of:
  - Source table name
  - Source database
  - Applied filter hash (optional)

### Cache Key Structure

```
{sourceTable}_{sourceDatabase}_{filterHash?}
```

Example: `sales_analytics_abc123` for table "sales" in database "analytics" with filter hash "abc123".

### Table Schema

Cached tables preserve the original column structure from the query result:

```sql
-- Example cached table schema
CREATE TABLE "sales_analytics" (
  "date" VARCHAR,
  "product" VARCHAR,
  "region" VARCHAR,
  "revenue" DOUBLE,
  "quantity" INTEGER
);
```

Column types are inferred from the JavaScript values during JSON insertion.

## Query Optimization

### Backend Optimization (Still Active)

The backend continues to apply:
- Sampling for large tables
- Rounding for continuous dimensions
- Row limits
- Optimization hints based on field metadata

### Frontend Optimization (New)

DuckDB WASM enables additional optimizations:

**1. Per-Chart DISTINCT**
Instead of fetching all combinations of X and Y values across all possible charts, each chart pair queries only its specific distinct values:

```sql
SELECT DISTINCT "xField", "yField" 
FROM cached_table
WHERE ...
```

**2. Adaptive Local Rounding**
For scatter charts with continuous dimensions, precision is reduced locally:

```sql
SELECT ROUND("latitude", 2), ROUND("longitude", 2), AVG("value")
FROM cached_table
GROUP BY 1, 2
```

**3. Aggregation Push-down**
Simple aggregations can be computed locally without backend involvement.

## Current Limitations

1. **JSON Conversion**: Arrow tables are converted to JSON for DuckDB insertion (performance overhead)
2. **No Persistence**: Cache is cleared on page refresh
3. **Memory Constraints**: Browser memory limits apply
4. **Single Connection**: One DuckDB connection shared across all operations

## Debug Information

The Debug Panel displays DuckDB status:

- **Status**: Not initialized / Initializing / Ready / Error
- **Cached Tables**: Count of registered tables
- **Total Rows**: Sum of all cached row counts
- **Table Names**: List of cache keys

## Future Potential

### Short-term Enhancements

1. **Direct Arrow Registration**: Use DuckDB's native Arrow support instead of JSON conversion
2. **Incremental Caching**: Cache individual columns rather than full query results
3. **IndexedDB Persistence**: Store cache across sessions
4. **Web Worker Isolation**: Run DuckDB entirely in a worker for better responsiveness

### Medium-term Opportunities

1. **Predictive Caching**: Pre-fetch likely-needed data based on field selections
2. **Columnar Storage**: Cache only requested columns, fetch additional columns on demand
3. **Federated Queries**: Combine cached data with live backend queries
4. **Cross-tab Sharing**: Share cache between browser tabs via SharedArrayBuffer

### Long-term Vision

1. **Offline-first Mode**: Full visualization capability with cached data
2. **Client-side Optimization Engine**: Move more query planning to frontend
3. **Progressive Loading**: Stream data into cache while rendering partial results
4. **Collaborative Caching**: Share cached datasets between users via service worker

## Configuration

Currently, DuckDB WASM is automatically initialized on first query. Future versions may include:

- Cache size limits
- TTL (time-to-live) for cached data
- Selective caching (enable/disable per data source)
- Memory pressure handling

## Related Files

- `services/duckdbService.ts` - Core DuckDB WASM wrapper
- `services/cacheManager.ts` - Cache metadata and lifecycle
- `services/chartQueryService.ts` - Per-chart query optimization
- `hooks/useLocalDataCache.ts` - React integration hook
- `observable-plot-generator/grid/localQueryGridGenerator.ts` - Chart grid with local queries

