# Source Database/Table Chart Update Fix

## Problem

When using `_source_database` or `_source_table` in the Color field or on an axis **before** adding a UNION table, the chart does not update even though the query re-executes with correct data.

### Reproduction Steps

1. Connect to database with partitioned tables (e.g., `table_0001`, `table_0002`)
2. Select `table_0001`
3. **Drag `_source_database` to Color field** (shows single value: current database)
4. Add union table `table_0002`
5. ❌ **Chart does NOT update** - still shows only one color
6. Remove `_source_database` from Color and drag it back
7. ✅ Chart now updates correctly - shows two colors (one per database/table)

## Root Cause

### Why the Chart Didn't Update

The issue involves **React's dependency tracking** in `useChartGeneration`:

```typescript
const generateChartSpec = useCallback(async () => {
  // ... chart generation logic
}, [xAxisFields, yAxisFields, colorField, queryResult, ...]);

useEffect(() => {
  generateChartSpec();
}, [generateChartSpec]);
```

When you add a UNION table:

1. ✅ `queryVersion` increments (triggers query)
2. ✅ Query executes with UNION mode
3. ✅ Backend returns data with `_source_database` values for each row
4. ✅ `queryResult` changes (new object reference)
5. ❌ **But `generateChartSpec` doesn't detect the change!**

### The Missing Link

The problem is **field reference identity**:

- `colorField` is a Field object: `{ id: 'field-_source_database', columnName: '_source_database', ... }`
- When you add a UNION table, the **Field object reference stays the same**
- React's `useCallback` compares dependencies by **reference equality**
- Since `colorField` reference didn't change, React doesn't recreate `generateChartSpec`

### Why Removing and Re-adding Fixed It

When you **remove and re-add** `_source_database`:

1. Remove: `colorField` becomes `null` → callback recreates
2. Add: `colorField` becomes Field object → callback recreates again
3. Chart generates with new data ✅

This forced a dependency change that triggered chart regeneration.

## Solution

**Add `queryVersion` as a dependency to `useChartGeneration`.**

### Why This Works

`queryVersion` increments whenever:
- Fields are added/removed from axes
- Filters are applied
- **UNION or JOIN tables are added/removed** ← The critical case!
- Any change that requires a new query

By adding `queryVersion` as a dependency:

1. User adds UNION table
2. `TABLE_JOINS_UNIONS_MODIFIED` dispatched
3. `queryVersion` increments (e.g., 5 → 6)
4. Query re-executes
5. `queryResult` changes
6. **`queryVersion` also changed** → `generateChartSpec` callback recreates
7. `useEffect` triggers
8. Chart re-generates with new data ✅

## Implementation

### 1. Updated `useChartGeneration` Hook

**File:** `frontend/src/components/Visualization/ChartArea/hooks/useChartGeneration.ts`

```typescript
interface UseChartGenerationProps {
  // ... existing props
  queryResult: any;
  queryVersion?: number; // NEW: Track query version for union/join changes
  // ... other props
}

export const useChartGeneration = ({
  // ... existing params
  queryResult,
  queryVersion, // NEW: Destructure queryVersion
  // ... other params
}: UseChartGenerationProps): UseChartGenerationReturn => {
  
  const generateChartSpec = useCallback(async () => {
    // ... chart generation logic
  }, [
    xAxisFields, 
    yAxisFields, 
    colorField, 
    // ... other dependencies
    queryResult, 
    queryVersion, // NEW: Add to dependencies
    // ... more dependencies
  ]);
  
  // ... rest of hook
}
```

### 2. Updated `ChartArea` Component

**File:** `frontend/src/components/Visualization/ChartArea/ChartArea.tsx`

```typescript
const ChartArea: React.FC = () => {
  const { state } = useVisualizationContext();
  
  const {
    xAxisFields,
    yAxisFields,
    colorField,
    queryResult,
    queryVersion, // NEW: Extract from state
    // ... other state
  } = state as any;
  
  const { spec, chartInfo, renderingError } = useChartGeneration({
    xAxisFields,
    yAxisFields,
    colorField,
    queryResult,
    queryVersion, // NEW: Pass to hook
    // ... other props
  });
  
  // ... rest of component
}
```

## How It Works Now

### Scenario: Adding UNION Table with `_source_database` Already in Color

1. **Initial State:**
   - User has `table_0001` selected
   - `_source_database` is in Color field
   - Chart shows one color (database: "analytics")
   - `queryVersion = 5`

2. **User adds UNION table `table_0002`:**
   ```typescript
   addUnionTable('analytics', 'table_0002');
   ```

3. **Metadata Updates:**
   - `useMetadataOperations` detects `unionTables` change
   - Calls `fetchMergedColumns()`
   - Updates `availableFields` with merged schema
   - Updates `virtualTable` with UNION mode
   - Dispatches `TABLE_JOINS_UNIONS_MODIFIED`

4. **Query Version Increments:**
   ```typescript
   case 'TABLE_JOINS_UNIONS_MODIFIED':
     return { ...state, queryVersion: state.queryVersion + 1 }; // 5 → 6
   ```

5. **Query Re-executes:**
   - `useQueryExecution` sees `queryVersion` changed (5 → 6)
   - Builds UNION query
   - Backend returns data:
     ```javascript
     [
       { category: 'A', value: 100, _source_database: 'analytics', _source_table: 'table_0001' },
       { category: 'B', value: 200, _source_database: 'analytics', _source_table: 'table_0001' },
       { category: 'A', value: 150, _source_database: 'analytics', _source_table: 'table_0002' },
       { category: 'B', value: 250, _source_database: 'analytics', _source_table: 'table_0002' },
     ]
     ```
   - Dispatches `SET_QUERY_RESULT` with new data

6. **Chart Regenerates:**
   - `queryResult` changes (new object)
   - `queryVersion` changes (5 → 6)
   - `generateChartSpec` callback **recreates** (dependencies changed)
   - `useEffect` triggers
   - Chart generates with new data
   - Now shows colors distinguishing tables ✅

## Benefits

✅ **Fixes the reported bug** - Charts update immediately when union tables are added/removed  
✅ **No manual intervention** - User doesn't need to remove/re-add fields  
✅ **Consistent behavior** - Works for `_source_database`, `_source_table`, or any other field  
✅ **Minimal change** - Only added one dependency, no logic changes  
✅ **Covers all cases** - Also handles JOIN table changes, filter changes, etc.

## Edge Cases Handled

### 1. Multiple UNION Tables Added Quickly
- Each addition increments `queryVersion`
- Chart regenerates only after the final query completes
- No intermediate renders with partial data

### 2. `_source_table` in Facet/X-axis
- Same fix applies - `queryVersion` triggers regeneration
- Facets update to show correct number of tables

### 3. Remove UNION Table
- `queryVersion` increments
- Query re-executes with fewer tables
- Chart updates to show reduced dataset

### 4. Switch from UNION to JOIN
- Mode change increments `queryVersion`
- Chart regenerates with new query structure

## Testing

### Manual Test Steps

1. **Setup:**
   - Connect to database with partitioned tables
   - Select `table_0001`

2. **Test Case 1: Color Field**
   - Drag `_source_database` to Color
   - Verify: Chart shows one color
   - Add union table `table_0002`
   - Verify: Chart immediately updates with two colors ✅

3. **Test Case 2: X-Axis**
   - Remove color field
   - Drag `_source_table` to X-axis
   - Verify: Shows one bar for `table_0001`
   - Add union table `table_0002`
   - Verify: Chart immediately shows two bars ✅

4. **Test Case 3: Facet Grid**
   - Create scatter plot (continuous x continuous)
   - Drag `_source_table` to facet panel
   - Verify: Shows one facet
   - Add union table `table_0002`
   - Verify: Grid immediately shows two facets ✅

### Automated Test Suggestion

```typescript
describe('useChartGeneration', () => {
  it('should regenerate chart when queryVersion changes even if fields are same', () => {
    const { result, rerender } = renderHook(
      (props) => useChartGeneration(props),
      {
        initialProps: {
          colorField: { id: 'field-_source_database', columnName: '_source_database' },
          queryResult: { rows: [/* initial data */] },
          queryVersion: 1,
          // ... other props
        }
      }
    );
    
    const initialSpec = result.current.spec;
    
    // Same field, new queryResult, new queryVersion (simulates UNION table added)
    rerender({
      colorField: { id: 'field-_source_database', columnName: '_source_database' }, // Same reference!
      queryResult: { rows: [/* new union data */] },
      queryVersion: 2, // Changed!
      // ... other props
    });
    
    // Should regenerate even though colorField reference didn't change
    expect(result.current.spec).not.toBe(initialSpec);
  });
});
```

## Related Files

- `frontend/src/components/Visualization/ChartArea/hooks/useChartGeneration.ts` - Added `queryVersion` dependency
- `frontend/src/components/Visualization/ChartArea/ChartArea.tsx` - Passed `queryVersion` to hook
- `frontend/src/contexts/VisualizationContext.tsx` - `queryVersion` state management (unchanged)
- `devdoc/UNION_TABLE_CHART_UPDATE_FIX.md` - Related fix for query execution timing

## Summary

The fix ensures charts **always regenerate** when the underlying query changes, even if field references remain the same. By tracking `queryVersion` in `useChartGeneration`, we detect when UNION/JOIN tables are added/removed and trigger chart regeneration automatically.
