# Filter Render Debug Guide

## Problem

When changing filters:
1. You see a "flickery" render (brief visual update)
2. But the filter effect is NOT visible in the chart
3. Opening Debug Panel or Fullscreen triggers the correct render
4. This suggests a **data staleness issue**, not a dimensions issue

## Debug Steps

### Step 1: Check Console Logs

Open browser console (F12) and apply a filter change. Look for these logs:

```
[PlotArea] Rendering with: { plotsCount: 9, plotIds: 'plot-0-r0-c0, plot-0-r0-c1, ...', ... }
[ObservablePlot] Rendering plot: { width: 400, height: 300, marksCount: 1, dataInfo: '45 rows', dataSnapshot: [...] }
[ObservablePlot] Plot rendered successfully
```

### Step 2: Check Data Snapshot

The `dataSnapshot` should show the FIRST 3 rows of data. Check if:
- ✅ The data reflects the filter (e.g., if you filtered to "Category A", all rows should show Category A)
- ❌ The data doesn't reflect the filter (shows old data) → **Data staleness issue upstream**

### Step 3: Check Render Frequency

Count how many times you see:
```
[PlotArea] Rendering with: ...
[ObservablePlot] Rendering plot: ...
```

**Expected**: Each filter change should trigger ONE set of these logs

**If you see TWO or more**:
- First render might have stale data
- Second render has correct data
- But only first render is visible → React reconciliation issue

### Step 4: Verify Query Execution

Check if these logs appear (from query execution):
```
[QueryService] Executing query...
[QueryResult] Received X rows
```

**If missing**: The query isn't re-running when filters change

### Step 5: Check Resize Trigger

When you open Debug Panel, you should see:
```
[PlotArea] Rendering with: ...
[ObservablePlot] Rendering plot: { width: XXX, height: YYY, ... }
```

Note the `dataSnapshot` in this render. If it's different from Step 2, that confirms data staleness.

## Common Causes

### Cause 1: Query Not Re-running
**Symptom**: No new logs when filter changes  
**Fix**: Check filter state management, ensure query dependencies include filters

### Cause 2: Spec Using Cached Data
**Symptom**: ObservablePlot logs show old data in `dataSnapshot`  
**Fix**: Ensure spec generation uses fresh query results, not cached

### Cause 3: React Key Not Changing
**Symptom**: Same `plotIds` before/after filter  
**Fix**: PlotArea needs keys that include data version/hash

### Cause 4: Options Reference Not Changing
**Symptom**: ObservablePlot memoization skipping render  
**Fix**: Currently disabled (conservative mode), shouldn't be this

## Diagnostic Commands

In browser console, you can manually inspect:

```javascript
// Check current visualization state
window.__REACT_DEVTOOLS_GLOBAL_HOOK__.renderers.forEach(r => {
  // Find VisualizationContext
  console.log('Checking contexts...');
});

// Check if query result is updating
// (You'll need to expose this for debugging)
```

## Workarounds

### Temporary: Disable PlotArea Memoization

Edit `PlotArea.tsx`:
```typescript
export default PlotArea; // Remove React.memo wrapper
```

This forces re-render on every parent update.

### Temporary: Force New Keys

Edit `PlotArea.tsx`:
```typescript
const key = `${plot.id}-${Date.now()}`; // Always new key
```

This forces React to fully recreate components (slow but might work).

## Expected Behavior After Fix

1. Filter changes
2. Single console log burst:
   ```
   [PlotArea] Rendering with: ...
   [ObservablePlot] Rendering plot: ...
   [ObservablePlot] Plot rendered successfully
   ```
3. `dataSnapshot` shows filtered data
4. Chart updates immediately
5. No need to resize to trigger correct render

## Reporting

Please report with:
1. **Full console logs** from filter change
2. **Data snapshot** content (first 3 rows shown)
3. **Filter applied** (e.g., "Status = Active")
4. **Expected vs actual** data in chart

This will help pinpoint whether the issue is:
- Query execution
- Spec generation
- Component rendering
- React reconciliation

