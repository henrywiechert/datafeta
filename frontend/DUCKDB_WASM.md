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

Legacy table-level cache manager. The current architecture primarily uses `ColumnCacheManager` for tracking cached slices and `DuckDBService` for storage.

### ColumnCacheManager (`services/columnCacheManager.ts`) - NEW

Manages **base-filtered slice caching** in DuckDB WASM and tracks which columns exist in that slice:

- **Slice keying**: cache entries are keyed by `(database, table, baseFilterHash)`\n- **Column tracking**: keeps metadata about which columns are present in the cached slice\n- **Invalidation**: base filter changes invalidate cached slices\n\nNote: despite the name, this is **not yet true incremental per-column fetching/merging**. Today, a cache refresh replaces the cached DuckDB table for a slice key.

### FilterTierManager (`services/filterTierManager.ts`) - NEW

Distinguishes between base and refinement filters:

- **Base filters**: Changes trigger backend re-query and cache invalidation
- **Refinement filters**: Applied locally via DuckDB WHERE clause (instant)
- **Hash tracking**: Tracks base filter state **scoped per (database, table)** for cache key generation
- **UI integration**: Toggle lock icon on filter chips

### QueryDecisionEngine (`services/queryDecisionEngine.ts`) - NEW

Determines query strategy based on dataset characteristics:

- **Size probing**: Calls backend `/row-count` endpoint to estimate dataset size
- **Strategy selection** (hybrid):
  - **≤ 100k base-filtered rows**: fetch a **raw slice** and do grouping/reduction locally
  - **> 100k base-filtered rows**: prefer backend aggregation and/or backend reduction
- **Cache awareness**: Checks which columns are already cached
- **Decision logging**: Tracks decisions for debugging

### ChartQueryService (`services/chartQueryService.ts`)

Executes optimized queries for individual charts:

- **Per-chart DISTINCT**: Only fetches unique value combinations needed for each chart
- **Adaptive rounding**: Applies precision reduction for continuous dimensions
- **Local aggregation**: Performs GROUP BY operations client-side

## Interaction with Backend Queries

### Query Flow

1. **Decision**: Frontend probes row count (base filters) and decides local vs backend.\n2. **Raw slice fetch (small datasets)**: Frontend requests a **raw slice** (base filters only) via Arrow and caches it in DuckDB.\n3. **Local grouping/reduction**: Refinement filters, grouping changes, and scatter reduction run locally against the cached slice.\n4. **Backend query (large datasets)**: Frontend sends the normal chart query to backend. For oversize scatter, it sends a **result budget** hint so backend can reduce the returned points before transport.
3. **Cache Storage**: Arrow table is registered into DuckDB WASM using native Arrow IPC insertion (no JSON conversion in the normal path).
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

Two conceptual layers:

- **Raw slice cache (DuckDB WASM)**: base-filtered slice of raw rows, used for local grouping and local filtering.\n- **Derived/remote results**: for large datasets we typically do not cache raw rows locally; results may be reduced/aggregated by backend.

### Result budgets (scatter safety)

Scatter plots can become unrenderable in Observable Plot when point counts are high (especially with discrete color). The frontend uses a conservative budget:\n\n- **No discrete color**: up to ~100k points\n- **Discrete color present**: up to ~50k points with **stratified sampling**\n\nBudget is applied as:\n- **Backend-side** when the decision engine prefers remote execution (via `QueryDescription.result_budget`).\n- **Frontend-side safeguard** in the scatter renderer to prevent crashes even if a larger result slips through.

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

Cached tables preserve the original column structure and types from the Arrow data:

```sql
-- Example cached table schema (types from Arrow)
CREATE TABLE "sales_analytics" (
  "date" TIMESTAMP,
  "product" VARCHAR,
  "region" VARCHAR,
  "revenue" DOUBLE,
  "quantity" BIGINT
);
```

Column types are preserved natively via Arrow IPC insertion (`insertArrowFromIPCStream`), which provides zero-copy data transfer from the Arrow table to DuckDB.

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

1. **No Persistence**: Cache is cleared on page refresh
2. **Memory Constraints**: Browser memory limits apply
3. **Single Connection**: One DuckDB connection shared across all operations

## Debug Information

The Debug Panel displays comprehensive caching information:

### DuckDB Status Section
- **Status**: Not initialized / Initializing / Ready / Error
- **Cached Tables**: Count of registered tables with column details
- **Total Rows**: Sum of all cached row counts
- **Local Queries**: Log of executed DuckDB queries with timing
- **Test Buttons**: COUNT(*), DISTINCT, Stats, Sample Rows

### Cache Strategy Section (NEW)
- **Last Query Decision**: Shows the strategy used (CACHE HIT, RAW COLUMNS, PRE-AGGREGATED)
- **Decision reason**: Explains why that strategy was chosen
- **Estimated row count**: From backend probe
- **Columns to fetch / cached**: Lists which columns need fetching vs already cached

### Filter Tiers Section (NEW)
- **Base Filter Hash**: Current hash of base filters
- **Base Filter Columns**: Which columns are marked as base filters (🔒)
- Toggle filter tier via lock icon on filter chips

### Column Cache Section (NEW)
- **Per-table cache entries**: Shows cached tables with filter hash
- **Column details**: List of cached columns with data types
- **Row counts and timestamps**: When data was cached

## Future Potential

### Short-term Enhancements

1. ~~**Direct Arrow Registration**: Use DuckDB's native Arrow support instead of JSON conversion~~ ✅ Implemented
2. ~~**Incremental Caching**: Cache individual columns rather than full query results~~ ✅ Implemented
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
- `services/cacheManager.ts` - Cache metadata and lifecycle (legacy)
- `services/columnCacheManager.ts` - Column-level cache tracking
- `services/filterTierManager.ts` - Base vs refinement filter management
- `services/queryDecisionEngine.ts` - Query strategy selection
- `services/chartQueryService.ts` - Per-chart query optimization
- `hooks/useLocalDataCache.ts` - React integration hook
- `observable-plot-generator/grid/localQueryGridGenerator.ts` - Chart grid with local queries
- `components/Visualization/Filters/FilterFieldChip.tsx` - Filter tier toggle UI

