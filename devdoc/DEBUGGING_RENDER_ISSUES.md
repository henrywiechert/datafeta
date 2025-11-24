# Debugging Render Issues - Performance Optimization Guide

## Issue: Renders Not Triggering When Needed

The performance optimizations include React.memo on several components. If renders are being skipped when they shouldn't be, use the built-in debug logging.

## Debug Logging (Development Mode Only)

All memoized components now have debug logging that shows:
- **When they skip rendering** (props unchanged)
- **When they re-render** (and what changed)

### How to Use Debug Logging

1. **Open Browser Console** (F12 → Console tab)

2. **Perform the action** that should trigger a render:
   - Change a Size field
   - Load a configuration
   - Adjust filters that affect faceting
   - Add/remove fields

3. **Look for log messages** like:
   ```
   [ObservablePlot] Re-rendering due to changes in: marks, x, y
   [PlotArea] Re-rendering: plots array changed
   [XAxes] Re-rendering
   [YAxes] Re-rendering: primitive props changed
   [TopFacetLabels] Re-rendering
   [LeftFacetLabels] Re-rendering
   ```

4. **If you see "Skipping re-render"** when you expect an update:
   ```
   [PlotArea] Skipping re-render: all props stable
   ```
   This indicates the memoization is blocking a needed render.

## Common Scenarios to Test

### 1. Size Field Changes
**What to do**: Add or change a Size field in the visualization

**Expected logs**:
```
[ObservablePlot] Re-rendering due to changes in: marks, color, size
[PlotArea] Re-rendering: plots array changed
```

**If missing**: The size change isn't propagating through the spec correctly

### 2. Loading a Configuration
**What to do**: Load a saved configuration

**Expected logs**: Multiple components should re-render:
```
[PlotArea] Re-rendering: plots array changed
[XAxes] Re-rendering
[YAxes] Re-rendering: plots changed
[TopFacetLabels] Re-rendering
```

**If missing**: Check if spec object is being recreated or if references are being reused

### 3. Filter Changes (Increasing Facets)
**What to do**: Change a filter that creates more facets (e.g., 1→4→9 facets)

**Expected logs**:
```
[PlotArea] Re-rendering: plots array changed
[TopFacetLabels] Re-rendering
[YAxes] Re-rendering: rowHeights values changed
```

**Should be smooth**: No intermediate renders, just one update

### 4. Adding/Removing Fields
**What to do**: Drag a field to X or Y axis

**Expected logs**:
```
[ObservablePlot] Re-rendering due to changes in: marks, x, y, domain
[PlotArea] Re-rendering: plots array changed
```

## Current Memoization Strategy

All components now use **CONSERVATIVE** memoization:

### ObservablePlot
- **Skip**: Only if `options` reference is identical
- **Re-render**: Any new options object (even if content similar)
- **Why**: Ensures we never miss updates

### PlotArea
- **Skip**: Only if all spec references stable (plots, facetLabels, layout)
- **Re-render**: If any spec reference changes
- **Why**: Reference equality is fast and reliable

### XAxes / YAxes / FacetLabels
- **Skip**: Only if all prop references unchanged
- **Re-render**: If any reference changes
- **Why**: Simple reference checks avoid deep comparisons

## If Renders Are Still Missing

### Option 1: Identify the Component
Use console logs to see which component is incorrectly skipping:
```javascript
// Look for "Skipping re-render" messages when you expect an update
```

### Option 2: Check Upstream Data Flow
The issue might be that **the spec/props aren't changing** when they should:
- Check if the data source is updating correctly
- Verify that state changes are creating new objects (not mutating)
- Ensure parent components are passing new references

### Option 3: Temporarily Disable Memoization
To test if memoization is the issue, you can temporarily remove it:

**For ObservablePlot**: Comment out the entire `React.memo()` wrapper at the bottom of the file

**For PlotArea**: Change the comparison to always return `false`:
```typescript
export default React.memo(PlotArea, () => false); // Always re-render
```

**For other components**: Same approach

If the issue disappears with memoization removed, then we know the comparison logic needs adjustment.

### Option 4: Add More Detailed Logging
If you need to see exactly what's changing, add this to the component:

```typescript
React.memo(Component, (prevProps, nextProps) => {
  console.log('Prev props:', prevProps);
  console.log('Next props:', nextProps);
  console.log('Are equal?', prevProps.spec === nextProps.spec);
  // ... rest of comparison
});
```

## Reporting Issues

When reporting a render issue, please include:

1. **What action you performed** (e.g., "Changed Size field from None to Amount")
2. **What you expected** (e.g., "Chart should update to show sized bubbles")
3. **Console logs** showing which components skipped/rendered
4. **Spec dump** if possible (copy from Debug Panel)

## Trade-offs

Current approach prioritizes **correctness over performance**:
- ✅ Very unlikely to miss renders (conservative)
- ✅ Debug logging helps identify issues quickly
- ⚠️ May re-render more than strictly necessary
- ⚠️ Still much better than no memoization

If you see excessive re-renders in the logs but performance is acceptable, that's fine - it means we're erring on the side of correctness.

## Performance vs Correctness Spectrum

```
Too Aggressive              Current             No Memoization
(Misses updates)         (Conservative)       (Always renders)
       ❌                      ✅                     ⚠️
```

We're intentionally positioned in the "conservative" zone to avoid missing updates while still getting performance benefits.

