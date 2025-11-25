# UNION Table Chart Update Fix

## Problem

When adding or removing UNION tables, the query was triggered but **charts did not update** with the new data.

## Root Cause

**Race condition** between metadata update and query execution:

1. User adds/removes union table
2. `VisualizationPage` dispatched `TABLE_JOINS_UNIONS_MODIFIED` after 100ms setTimeout
3. Meanwhile, `fetchMergedColumns()` triggered via useEffect (watches `unionTables`)
4. Query might execute **before** `fetchMergedColumns` completes
5. Query uses stale `virtualTable` (or no virtualTable)
6. Backend doesn't know about the union, returns wrong data
7. Chart doesn't update properly

### Why setTimeout Was Used

The comment said: *"We use setTimeout to ensure the metadata update (fetchMergedColumns) completes first"*

But this was flawed because:
- `fetchMergedColumns` is async and might take > 100ms
- No guarantee it completes before setTimeout fires
- Race condition depends on API latency

## Solution

**Dispatch `TABLE_JOINS_UNIONS_MODIFIED` from inside `fetchMergedColumns` after it completes:**

### Before (Race Condition)
```typescript
// VisualizationPage.tsx
const addUnionTable = (database, tableName) => {
    addUnionTableBase(database, tableName);
    setTimeout(() => {
        dispatch({ type: 'TABLE_JOINS_UNIONS_MODIFIED' }); // Too early!
    }, 100);
};

// Meanwhile...
// useMetadataOperations.ts - triggered by useEffect
fetchMergedColumns() // async, might take 200ms
```

### After (Guaranteed Order)
```typescript
// VisualizationPage.tsx
const addUnionTable = (database, tableName) => {
    addUnionTableBase(database, tableName);
    // No dispatch here - let fetchMergedColumns handle it
};

// useMetadataOperations.ts
const fetchMergedColumns = async () => {
    // ... fetch and update metadata
    dataSourceSetters.setVirtualTable(response.virtual_table);
    
    // NOW dispatch - virtualTable is guaranteed to be set
    dispatch({ type: 'TABLE_JOINS_UNIONS_MODIFIED' });
};
```

## Changes Made

### 1. `frontend/src/pages/VisualizationPage.tsx`

Removed `setTimeout` and dispatch from union operations:

```typescript
// Before
const addUnionTable = (database, tableName) => {
    addUnionTableBase(database, tableName);
    setTimeout(() => {
        dispatch({ type: 'TABLE_JOINS_UNIONS_MODIFIED' });
    }, 100);
};

// After
const addUnionTable = (database, tableName) => {
    addUnionTableBase(database, tableName);
    // fetchMergedColumns will trigger via useEffect and handle dispatch
};
```

Same fix applied to:
- `removeUnionTable()`
- `toggleJoinedTable()` (for JOIN tables)

### 2. `frontend/src/hooks/useMetadataOperations.ts`

Added dispatch **after** metadata is successfully updated:

```typescript
// UNION mode
dataSourceSetters.setAvailableFields(fieldsWithSynthetic);
dataSourceSetters.setVirtualTable(response.virtual_table);
dataSourceSetters.setIsLoadingMetadata(false);

// Dispatch NOW - virtualTable is guaranteed set
dispatch({ type: 'TABLE_JOINS_UNIONS_MODIFIED' });

// JOIN mode (also fixed)
dispatch({ type: 'SET_X_AXIS_FIELDS', payload: patchedX });
dispatch({ type: 'SET_Y_AXIS_FIELDS', payload: patchedY });

// Dispatch for consistency
dispatch({ type: 'TABLE_JOINS_UNIONS_MODIFIED' });
```

## How It Works Now

### Sequence of Events

1. **User adds union table**
   - `addUnionTable(database, tableName)` called
   - Updates `dataSource.unionTables` array (reference changes)

2. **useEffect triggers** (watches `unionTables`)
   ```typescript
   useEffect(() => {
       if (dataSource.selectedTable) {
           fetchMergedColumns();
       }
   }, [dataSource.unionTables]);
   ```

3. **fetchMergedColumns executes**
   - Calls `/merged-columns` API with union tables
   - Backend returns merged schema with `_source_table` field
   - Updates `availableFields`
   - **Updates `virtualTable`** ← Critical!
   - Dispatches `TABLE_JOINS_UNIONS_MODIFIED`

4. **queryVersion increments**
   - Reducer handles `TABLE_JOINS_UNIONS_MODIFIED`
   - `queryVersion++`

5. **Query re-executes** (watches `queryVersion`)
   - `useQueryExecution` sees queryVersion changed
   - Builds query with updated `virtualTable`
   - Backend uses UNION mode
   - Returns combined data from all tables

6. **Chart updates**
   - `queryResult` updated
   - `useChartGeneration` sees new queryResult
   - Chart re-renders with new data ✅

## Benefits

✅ **No race condition** - Guaranteed order of operations
✅ **No arbitrary delays** - Waits for actual completion
✅ **Works regardless of API latency** - Could be 50ms or 500ms
✅ **Cleaner code** - No setTimeout hacks
✅ **Consistent** - Same pattern for JOIN and UNION tables

## Testing

To verify the fix:

1. Connect to ClickHouse with partitioned tables
2. Select a table (e.g., `table_0001`)
3. Add union table (e.g., `table_0002`)
4. **Verify**: Chart updates immediately with data from both tables
5. Remove union table
6. **Verify**: Chart updates to show only primary table data
7. Add multiple union tables quickly
8. **Verify**: All tables included, no stale data

## Edge Cases Handled

### Fast API Response (< 100ms)
- **Before**: setTimeout might fire before fetchMergedColumns completes
- **After**: Dispatch happens after completion, regardless of speed

### Slow API Response (> 500ms)
- **Before**: Query would execute with stale virtualTable
- **After**: Query waits for virtualTable update

### Multiple Rapid Changes
- **Before**: Multiple setTimeouts, race conditions
- **After**: Each fetchMergedColumns dispatches after its own completion

### Error Cases
- If `fetchMergedColumns` fails, no dispatch happens
- Query doesn't execute with invalid state
- User sees error, can retry

## Related Files

- `frontend/src/pages/VisualizationPage.tsx` - Removed setTimeout dispatches
- `frontend/src/hooks/useMetadataOperations.ts` - Added dispatches after completion
- `frontend/src/contexts/VisualizationContext.tsx` - `TABLE_JOINS_UNIONS_MODIFIED` reducer (unchanged)

## Summary

The fix eliminates a race condition by **dispatching query re-execution only after metadata updates complete**, ensuring charts always update with correct data when UNION tables are added or removed.
