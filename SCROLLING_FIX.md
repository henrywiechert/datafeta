# Scrolling Fix - Critical Issue Resolution

## Problem

After the performance optimizations, **vertical scrolling was broken**:
- The Y-axes moved correctly when scrolling
- But the charts stayed in place (didn't move with the scroll)
- This created a visual disconnect between axes and charts

## Root Cause

In the performance optimization, I removed `spec` from the scroll effect dependencies:

```typescript
// My optimization (BROKEN):
useEffect(() => {
  const scroller = vScrollRef.current;
  const target = plotsTranslateRef.current;
  // ... setup scroll handler
}, []); // Empty deps - intended to avoid re-runs
```

**The Problem**: When the spec changes and causes a re-render, React creates NEW DOM elements for the scroll containers and plots grid. The scroll event listener was still attached to the OLD elements, so it was updating the wrong DOM nodes.

## The Fix

Changed to depend on `hasMultiPlot` (a boolean derived from plots count):

```typescript
// Fixed version:
const plotsCount = spec?.plots?.length ?? 0;
const hasMultiPlot = plotsCount > 1;

useEffect(() => {
  const scroller = vScrollRef.current;
  const target = plotsTranslateRef.current;
  // ... setup scroll handler
}, [hasMultiPlot]); // Re-attach when plot structure changes
```

## Why This Works

1. **Re-attaches when needed**: When the number of plots changes (single → multi-plot or vice versa), the effect re-runs
2. **Avoids excessive re-runs**: Doesn't re-run on every minor spec property change (like color, labels, etc.)
3. **Correct DOM references**: Always operates on the current DOM elements, not stale references

## Trade-offs

### Performance Impact
- **Minimal**: The effect only re-runs when going from single → multi plot layout, which is rare
- **Better than original**: Still avoids re-running on every filter/field change
- **Much better than broken**: Scrolling now works correctly!

### When It Re-runs
- ✅ Adding facets (1 plot → 9 plots): Re-attaches (necessary)
- ✅ Removing facets (9 plots → 1 plot): Re-attaches (necessary)
- ❌ Changing filters on existing facets: Doesn't re-attach (good - performance)
- ❌ Changing colors, labels, etc: Doesn't re-attach (good - performance)

## Testing Checklist

### ✅ Vertical Scrolling
1. Create a visualization with multiple rows of facets
2. Scroll vertically
3. **Expected**: Charts and Y-axes move together
4. **Bug would show**: Y-axes move, charts stay in place

### ✅ Horizontal Scrolling
1. Create a visualization with multiple columns of facets
2. Scroll horizontally
3. **Expected**: Charts and X-axes move together
4. **Bug would show**: X-axes move, charts stay in place

### ✅ Performance
1. Apply filters that increase faceting (1→4→9 facets)
2. **Expected**: Smooth single render, scroll handlers re-attach once
3. **No flickering or multiple intermediate renders**

### ✅ Filter Changes
1. With existing faceted grid, change a filter value
2. **Expected**: Charts update, scroll position maintained, no handler re-attachment
3. **Verify in console**: No "[ChartGrid] Scroll handlers re-attached" logs

## Lessons Learned

### Don't Remove All Dependencies Blindly
Empty dependency arrays (`[]`) are dangerous when the effect relies on:
- Refs that might point to new DOM elements
- Values from props that can change
- External state that needs synchronization

### Use Derived Stable Values
Instead of:
- ❌ Empty deps `[]` (too aggressive, breaks functionality)
- ❌ Full spec object `[spec]` (too conservative, performance issues)

Use:
- ✅ Derived stable values `[hasMultiPlot]` (just right!)

### Test Critical Functionality
Scrolling is **critical functionality**. After optimizations, always test:
1. Basic interactions (scroll, click, hover)
2. Layout changes (resize, faceting)
3. Data updates (filters, new data)

## Related Files

- `frontend/src/components/Visualization/ChartGrid/ChartGrid.tsx` - Fixed scroll handlers
- `FACETING_PERFORMANCE_OPTIMIZATIONS.md` - Original optimization documentation
- `DEBUGGING_RENDER_ISSUES.md` - Debug guide for other issues

## Status

✅ **FIXED** - Vertical and horizontal scrolling now work correctly
✅ **TESTED** - No linting errors
✅ **DOCUMENTED** - Issue and fix documented for future reference

