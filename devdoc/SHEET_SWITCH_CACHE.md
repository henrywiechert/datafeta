# Sheet Switch Cache Feature

## Overview

This feature implements caching of query results and chart specifications to enable near-instant sheet switching without re-querying the backend.

## Problem

Previously, switching between sheets triggered:
1. **Full re-query** to the backend (200ms - 5000ms+)
2. **Chart spec generation** (10-100ms)
3. **Observable Plot rendering** (50-2000ms+)

This resulted in 260ms - 7000ms+ of latency every time users switched sheets, even when returning to a sheet with unchanged configuration.

## Solution

Implement a multi-level caching strategy:

1. **Query Result Cache**: Store the aggregated data per sheet
2. **Chart Spec Cache**: Store the generated PlotResult
3. **Config Hash Validation**: Ensure cache is only used when configuration matches
4. **Data Source Version**: Invalidate all caches when shared state changes

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                   Sheet Render Cache Store                       │
│  ────────────────────────────────────────────────────────────── │
│  entries: Map<sheetId, {                                        │
│    queryResult: QueryResult,                                    │
│    chartSpec: PlotResult | null,                                │
│    configHash: string,                                          │
│    dataSourceVersion: number,                                   │
│    timestamp: number                                            │
│  }>                                                             │
│  dataSourceVersion: number (increments on shared state change)  │
└─────────────────────────────────────────────────────────────────┘
```

## Cache Invalidation Rules

### Global Invalidation (affects all sheets)

These changes increment `dataSourceVersion`, invalidating all cached entries:

- `selectedDatabase` changes
- `selectedTable` changes
- `virtualColumns` added/updated/removed
- `joinedTables` changes
- `unionTables` changes
- Connection disconnect

Note: `measureGroupFields` is now per-sheet (stored in VisualizationContext), so it only affects that specific sheet's cache.

### Per-Sheet Invalidation

Cache for a specific sheet becomes invalid when its `configHash` no longer matches:

- Axis fields changed (xAxisFields, yAxisFields)
- Measure group fields changed (measureGroupFields)
- Applied filters changed
- Color/size field changed
- Label/tooltip fields changed
- Chart styling changed (colorScheme, colorBias, etc.)
- Field overrides changed

## Flow

### On Sheet Switch Away

```
1. useSheetCacheSave hook captures current state on unmount
2. Computes configHash for current sheet configuration
3. Saves {queryResult, chartSpec, configHash, dataSourceVersion} to cache
```

### On Sheet Switch To

```
1. useQueryExecution checks cache on mount
2. If valid cache found (configHash + dataSourceVersion match):
   - Dispatches RESTORE_CACHED_QUERY_RESULT
   - Sets lastExecutedVersionRef to prevent re-query
   - Chart generation uses cached queryResult
3. If cache miss:
   - Normal query execution path
```

## Files

| File | Purpose |
|------|---------|
| `stores/sheetRenderCacheStore.ts` | Zustand store for cache entries |
| `utils/sheetConfigHash.ts` | Config hash computation |
| `hooks/useSheetCacheCoordinator.ts` | Hook for cache save/restore coordination |
| `hooks/useSheetRenderCache.ts` | Hook for data source version sync |

## Integration Points

1. **App.tsx**: `useDataSourceVersionSync` tracks shared state changes
2. **ChartArea.tsx**: `useSheetCacheSave` saves on unmount
3. **useQueryExecution.ts**: Checks cache on mount before querying
4. **useMetadataOperations.ts**: Skips metadata re-fetch when DataSourceContext already has data

## Metadata Re-Fetch Prevention

When `VisualizationProvider` remounts on sheet switch, `useMetadataOperations` gets a fresh `connectionInitializedRef`. Without special handling, this would cause:

1. Effect thinks it's a new connection (ref is null)
2. Clears `availableFields` to empty array
3. Next effect sees `availableFields.length === 0` and triggers `fetchColumns()`

**Fix**: Check if `dataSource.availableFields.length > 0` before deciding to re-initialize:

```typescript
// Skip if DataSourceContext already has metadata loaded (e.g., sheet switch remount)
if (dataSource.selectedTable && dataSource.availableFields.length > 0) {
    connectionInitializedRef.current = connectionId;
    return;
}
```

This ensures that on sheet switch:
- DataSourceContext persists (it's above VisualizationProvider)
- Fields are already loaded
- No API calls are made
- FieldsPanel displays instantly

## Benefits

- **Near-instant sheet switch**: No network round-trip when cache is valid
- **Memory efficient**: Only stores aggregated results (typically small)
- **Works with remote-only**: No dependency on DuckDB WASM caching
- **Automatic invalidation**: Cache is invalidated when stale

## Future Enhancements

1. **Phase 2: SVG Snapshot Caching**
   - Cache rendered SVG for instant visual feedback
   - Show cached SVG while re-rendering with fresh data

2. **LRU Eviction**
   - Limit cache size for many sheets
   - Evict least recently used entries

3. **Persistence**
   - Store cache in sessionStorage for page refresh survival
