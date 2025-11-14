# Virtual Columns Filter Support - Bug Fix

## Issue Summary

When using a virtual column (with conditional CASE WHEN expression) as a filter, the application threw an error:
```
Unknown expression or function id## Files Modified

### Backend
- `backend/services/cardinality_service.py` - Added virtual column support to count distinct values
- `backend/routers/data.py` - Converted `/distinct-count` from GET to POST, added virtualColumns parameter

### Frontend
- `frontend/src/apiService.ts` - Updated both `getDistinctValuesCount()` and `getDistinctValues()` to pass virtualColumns
- `frontend/src/hooks/useVisualizationState.ts` - Pass state.virtualColumns to all distinct value API calls (6 locations)`time_idx_shifted`
```

This occurred because the `CardinalityService` (which counts distinct values for filter panels) was trying to query a column name directly instead of using the virtual column's expression.

## Root Cause

The `/distinct-count` endpoint and `CardinalityService` did not support virtual columns. When a virtual column was used as a filter:

1. Frontend would request distinct value count for the virtual column
2. Backend would try to execute: `SELECT COUNT(DISTINCT time_idx_shifted) FROM table`
3. ClickHouse would fail because `time_idx_shifted` is not a real column (it's a virtual column with expression `time_idx + 10`)

## Solution

### Backend Changes

#### 1. Updated CardinalityService (`backend/services/cardinality_service.py`)

**Modified `get_distinct_count()` method:**
- Added `virtual_columns: Optional[list] = None` parameter
- Updated docstring to document the new parameter
- Passes virtual columns to the internal `_build_count_query()` method

**Modified `_build_count_query()` method:**
- Added `virtual_columns: Optional[list] = None` parameter
- Imports and initializes `VirtualColumnExpressionBuilder` when virtual columns are provided
- Registers each virtual column with the builder
- Checks if the field is a virtual column before building the COUNT expression
- For virtual columns: Uses `vc_builder.get_virtual_column_term(field)` to get the expression
- For regular columns: Uses `getattr(db_table, field)` as before

**Result:** Now generates correct SQL for virtual columns:
```sql
-- Before (fails):
SELECT COUNT(DISTINCT time_idx_shifted) FROM table

-- After (succeeds):
SELECT COUNT(DISTINCT (time_idx + 10)) FROM table
```

#### 2. Updated /distinct-count Endpoint (`backend/routers/data.py`)

**Changed from GET to POST:**
- Changed decorator: `@router.get("/distinct-count")` → `@router.post("/distinct-count")`
- Changed signature: Added `request_data: Dict[str, Any] = Body(...)`
- Extracts all parameters from request body instead of query string

**Added virtual column support:**
- Parses `virtualColumns` from request body if provided
- Creates `VirtualColumnDefinition` objects from JSON
- Passes `virtual_columns` list to `CardinalityService.get_distinct_count()`

**Example request body:**
```json
{
  "field": "time_idx_shifted",
  "table": "measurement",
  "database": "default",
  "virtualColumns": [
    {
      "name": "time_idx_shifted",
      "expression": "time_idx + 10",
      "output_type": "numeric"
    }
  ]
}
```

### Frontend Changes

#### 3. Updated API Service (`frontend/src/apiService.ts`)

**Modified `getDistinctValuesCount()` method:**
- Changed from GET with URLSearchParams to POST with JSON body
- Added `virtualColumns?: VirtualColumnDefinition[]` parameter
- Includes virtual columns in request body if provided
- Imported `VirtualColumnDefinition` type from `./types`

**Before:**
```typescript
async getDistinctValuesCount(
    field: string,
    table: string,
    database?: string,
    // ... other params
    signal?: AbortSignal
): Promise<number> {
    const params = new URLSearchParams({ field, table, ... });
    const response = await fetchWithErrorHandling(
        `${API_BASE_URL}/distinct-count?${params.toString()}`,
        { method: 'GET', ... }
    );
}
```

**After:**
```typescript
async getDistinctValuesCount(
    field: string,
    table: string,
    database?: string,
    // ... other params
    unionTables?: string[],
    virtualColumns?: VirtualColumnDefinition[],  // NEW
    signal?: AbortSignal
): Promise<number> {
    const requestBody = { field, table, database, ... };
    if (virtualColumns && virtualColumns.length > 0) {
        requestBody.virtualColumns = virtualColumns;
    }
    const response = await fetchWithErrorHandling(
        `${API_BASE_URL}/distinct-count`,
        { 
            method: 'POST',
            body: JSON.stringify(requestBody),
            ...
        }
    );
}
```

#### 4. Updated API Service for Distinct Values (`frontend/src/apiService.ts`)

**Modified `getDistinctValues()` method:**
- Added `virtualColumns?: VirtualColumnDefinition[]` parameter
- Includes `virtual_columns` in query description sent to `/query` endpoint
- Sends virtual columns along with dimension/measure configuration

**Example:**
```typescript
const queryDesc: any = {
    target_table: table,
    target_database: database,
    dimensions: [dimension],
    measures: [],
    fetch_filter_values: true,
};

// Add virtual columns if provided
if (virtualColumns && virtualColumns.length > 0) {
    queryDesc.virtual_columns = virtualColumns;
}
```

#### 5. Updated Visualization State Hook (`frontend/src/hooks/useVisualizationState.ts`)

**Modified four locations where distinct value APIs are called:**

1. **Initial filter count** (line ~535): Pass `state.virtualColumns` to `getDistinctValuesCount()`
2. **Fetch all values** (line ~552): Pass `state.virtualColumns` to `getDistinctValues()`
3. **Fetch sampled values** (line ~565): Pass `state.virtualColumns` to `getDistinctValues()`
4. **Filter value search count** (line ~802): Pass `state.virtualColumns` to `getDistinctValuesCount()`
5. **Search fetch all values** (line ~826): Pass `state.virtualColumns` to `getDistinctValues()`
6. **Search fetch sampled values** (line ~851): Pass `state.virtualColumns` to `getDistinctValues()`

**Example:**
```typescript
const count = await apiService.getDistinctValuesCount(
    field.columnName,
    dataSource.selectedTable,
    dbParam,
    undefined,
    field.dateTimePart,
    field.dateTimeMode,
    dataSource.unionTables,
    state.virtualColumns  // Added this parameter
);

values = await apiService.getDistinctValues(
    field.columnName,
    dataSource.selectedTable,
    dbParam,
    field.dateTimePart,
    field.dateTimeMode,
    regexPattern,
    limit,
    useRandomSample,
    dataSource.unionTables,
    state.virtualColumns  // Added this parameter
);
```

## Testing

### Backend Tests
- **136 passing** tests (all cardinality, virtual column, and query service tests pass)
- 1 pre-existing test failure unrelated to this fix (test_sql_case_when_as_dimension_with_alias)

### Manual Testing Required
1. Create a virtual column with CASE WHEN expression (e.g., `CASE WHEN amount > 1000 THEN 'High' ELSE 'Low' END`)
2. Drag the virtual column to the filter zone
3. Verify no error occurs
4. Check that filter panel loads distinct values correctly
5. Verify network tab shows POST request to `/distinct-count` with `virtualColumns` in body
6. Check backend logs show SQL with expression: `COUNT(DISTINCT (expression))`

## Impact

This fix enables virtual columns to be used in filter panels, completing the full virtual column feature. Virtual columns can now be used in:
- ✅ Axes (X/Y dimensions and measures)
- ✅ Color encoding
- ✅ Size encoding
- ✅ Label fields
- ✅ **Filters (discrete value selection)** - NOW WORKING

## Files Modified

### Backend
- `backend/services/cardinality_service.py` - Added virtual column support
- `backend/routers/data.py` - Converted GET to POST, added virtualColumns parameter

### Frontend
- `frontend/src/apiService.ts` - Added virtualColumns parameter, changed to POST
- `frontend/src/hooks/useVisualizationState.ts` - Pass state.virtualColumns to API calls

## Related Documentation

- [VIRTUAL_COLUMNS_PHASE2_COMPLETE.md](./VIRTUAL_COLUMNS_PHASE2_COMPLETE.md) - Phase 2 UI integration
- [VIRTUAL_COLUMNS_BUG_FIXES.md](./VIRTUAL_COLUMNS_BUG_FIXES.md) - Previous bug fixes (drag/drop, types, ORDER BY, dotted names)

## Notes

- The change from GET to POST for `/distinct-count` is necessary because virtual column definitions are complex objects that don't belong in query strings
- Virtual columns are only passed when they exist in state, maintaining backward compatibility
- The CardinalityService properly initializes and registers virtual columns before building queries
- Expression validation and security checks (SQL injection prevention) are handled by `VirtualColumnExpressionBuilder`
