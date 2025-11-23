# Faceting Performance Optimizations

## Problem Description

When changing filters that increase faceting effort (more facets), the following performance issues were observed:

1. **onScroll events taking long time** in Layout rendering (observed in Chrome DevTools)
2. **Multiple intermediate renders** creating a visual "animation" effect during faceting changes
3. **Sluggish UI response** when facet count changes

## Root Causes Identified

### 1. Scroll Handler Re-registration on Every Spec Change
**Location**: `ChartGrid.tsx` lines 237-252, 255-269

**Problem**: 
- Both vertical and horizontal scroll handlers had `spec` in their dependency arrays
- When faceting changed, `spec` object changed, causing scroll event listeners to be torn down and re-created
- This caused unnecessary DOM manipulations and event handler churn during filter changes

**Impact**: 
- Performance overhead from repeatedly detaching/attaching event listeners
- Potential scroll position jumps or inconsistencies during the transition

### 2. ResizeObserver Re-initialization on Every Spec Change
**Location**: `ChartGrid.tsx` lines 273-321, 324-361

**Problem**:
- ResizeObserver effects for row height calculation and container dimensions tracking both depended on full `spec` object
- Every spec change caused ResizeObservers to disconnect and reconnect
- This triggered multiple resize observation cycles and layout recalculations

**Impact**:
- Multiple layout thrashing cycles as ResizeObservers restart
- Unnecessary RAF (requestAnimationFrame) scheduling overhead
- Visual "intermediate" render states as measurements are recalculated

### 3. Complete DOM Rebuilds in ObservablePlot
**Location**: `ObservablePlot.tsx` line 106

**Problem**:
- The component used `innerHTML = ''` to clear and rebuild the entire SVG on every options change
- `options` object was likely being recreated on every render, even if content was similar
- No memoization to prevent re-renders when options hadn't meaningfully changed

**Impact**:
- Complete SVG teardown and recreation for each plot on every faceting change
- This is the "intermediate render" the user observed - browser showing empty state before new plots render
- Expensive DOM operations multiplied by number of facets

### 4. Lack of Component Memoization
**Location**: Multiple components (PlotArea, XAxes, YAxes, FacetLabels)

**Problem**:
- Child components weren't memoized, causing full re-renders even when their inputs hadn't changed
- When spec object reference changed, all child components re-rendered unconditionally

**Impact**:
- Cascading re-renders through the entire component tree
- Wasted React reconciliation effort
- More layout recalculations than necessary

## Solutions Implemented

### 1. Removed Unnecessary Dependencies from Scroll Handlers

**Change**: Removed `spec` from scroll effect dependency arrays

```typescript
// Before: useEffect(() => { ... }, [spec]);
// After:  useEffect(() => { ... }, []); // Empty deps - register once and keep active
```

**Reasoning**: 
- Scroll synchronization logic doesn't depend on spec content
- Handlers only need to track scroll position and update transforms
- Event listeners can persist across spec changes without issues

**Performance Gain**: Eliminates event listener churn, reduces overhead during filter changes

### 2. Made ResizeObserver Dependencies More Selective

**Changes**:
- Row height calculation: Now only depends on `rowsForSizing` instead of full `spec`
- Container dimensions: Removed `spec` dependency entirely (uses empty deps array)

**Reasoning**:
- Row height only needs to recalculate when the number of rows changes, not when spec content changes
- Container dimensions are independent of spec and should track continuously
- Both observers can persist across spec changes

**Performance Gain**: Prevents unnecessary observer disconnections/reconnections, eliminates resize observation cycles

### 3. Optimized ObservablePlot DOM Operations

**Changes**:
- Replaced `innerHTML = ''` with `replaceChildren()` for better performance
- Added React.memo with intelligent comparison function
- Comparison checks critical properties (marks, x, y, color, facet) rather than full object equality

**Reasoning**:
- `replaceChildren()` is a single synchronous operation that's faster for browsers to process
- Memoization prevents re-renders when options object reference changes but content is equivalent
- Selective comparison allows skipping re-renders for non-visual changes

**Performance Gain**: 
- Reduced SVG rebuild overhead
- Fewer unnecessary plot re-renders
- Eliminates visual "flash" of empty state during updates

### 4. Added Component Memoization Throughout

**Components Memoized**:
- `PlotArea`: Compares plots array structure and key properties
- `XAxes`: Compares columns, templates, and plot references
- `YAxes`: Compares rows, heights, and plot references  
- `TopFacetLabels`: Compares facetLabels reference
- `LeftFacetLabels`: Compares facetLabels reference and layout

**Reasoning**:
- Each component now only re-renders when its specific inputs actually change
- Breaks the cascading re-render chain when only unrelated spec properties change
- Maintains referential stability when possible

**Performance Gain**:
- Dramatically reduces React reconciliation work
- Prevents unnecessary component re-renders
- Allows React to short-circuit rendering for unchanged subtrees

## Expected Performance Improvements

### During Filter Changes (Increasing Facets):

1. **Single Render Pass**: No more intermediate visual states - direct render to final layout
2. **Reduced onScroll Overhead**: Scroll handlers persist without re-registration
3. **Stable Layout Measurements**: ResizeObservers remain active without restarting
4. **Faster SVG Updates**: Optimized DOM operations for plot rendering
5. **Minimal Re-renders**: Only components with actual changes re-render

### Measurement Recommendations:

To verify improvements, measure in Chrome DevTools:
- **Before**: Long onScroll handler execution, multiple Layout/Paint phases
- **After**: Minimal onScroll overhead, single Layout/Paint cycle per change

### Performance Testing Checklist:

1. ✅ Open Chrome DevTools Performance tab
2. ✅ Record while changing filter that increases faceting (e.g., 1→4→9 facets)
3. ✅ Check "onScroll" timing - should be minimal and consistent
4. ✅ Verify single Layout phase (not multiple intermediate layouts)
5. ✅ Confirm no visual "animation" or intermediate render states
6. ✅ Measure total update time - should be significantly faster

## Technical Notes

### Why Empty Dependency Arrays Are Safe Here:

1. **Scroll handlers**: Use refs and state setters (stable references) - don't depend on render-time values
2. **ResizeObservers**: Observe DOM elements (refs) and update state - independent of spec content
3. **Event cleanup**: Still properly cleaned up on unmount via return functions

### Memoization Strategy:

- **Shallow comparisons** for primitive props (strings, numbers)
- **Reference comparisons** for arrays/objects when possible (e.g., `spec.plots`)
- **Deep comparisons** only for critical properties that determine visual output
- **Early bailout** on reference equality (common case after optimization)

### CSS/Animation Notes:

- No CSS transitions or animations on chart elements (only UI controls)
- `willChange: 'transform'` on plot grid hints browser for optimization
- `passive: true` on scroll listeners for better scrolling performance

## Files Modified

1. `frontend/src/components/Visualization/ChartGrid/ChartGrid.tsx`
   - Removed spec dependencies from scroll handlers
   - Optimized ResizeObserver dependencies
   
2. `frontend/src/components/Visualization/ChartGrid/PlotArea.tsx`
   - Added React.memo with intelligent comparison
   
3. `frontend/src/components/Visualization/ObservablePlot.tsx`
   - Replaced innerHTML with replaceChildren
   - Added React.memo with selective property comparison
   
4. `frontend/src/components/Visualization/ChartGrid/XAxes.tsx`
   - Added React.memo with prop comparison
   
5. `frontend/src/components/Visualization/ChartGrid/YAxes.tsx`
   - Added React.memo with prop and array comparison
   
6. `frontend/src/components/Visualization/ChartGrid/FacetLabels.tsx`
   - Memoized TopFacetLabels component
   - Memoized LeftFacetLabels component

## Memoization Strategy: Conservative Approach

After initial implementation, memoization was adjusted to be **more conservative** to avoid missing renders:

### Current Strategy (v2 - Conservative)

All memoized components now use **reference equality checks**:
- ✅ Simple and fast comparison
- ✅ Low risk of missing updates
- ✅ Debug logging in development mode
- ⚠️ May re-render more than strictly minimal

**ObservablePlot**: Only skips if `options` reference is identical (any new object triggers render)
**PlotArea**: Checks spec.plots, spec.layout, spec.facetLabels references
**XAxes/YAxes**: Checks all prop references including spec.plots and spec.layout
**FacetLabels**: Checks facetLabels and layout references

### Why Conservative?

1. **Correctness First**: Missing a render is worse than an extra render
2. **Complex State**: Chart specs have many interdependencies
3. **Debug Support**: Logging helps identify issues quickly
4. **Performance Still Good**: Reference checks are very fast

### Debug Logging

All components log their render decisions in development mode:
```javascript
console.log('[ComponentName] Re-rendering: reason');
console.log('[ComponentName] Skipping re-render');
```

See `DEBUGGING_RENDER_ISSUES.md` for full debugging guide.

## Backward Compatibility

All changes are:
- ✅ Backward compatible (no API changes)
- ✅ Non-breaking (same visual output and behavior)
- ✅ Pure optimization (no functional changes)
- ✅ Linter-approved (no errors introduced)
- ✅ Debug logging (development mode only)

## Future Optimization Opportunities

1. **Virtualization**: For grids with 50+ facets, consider virtualizing off-screen plots
2. **Web Workers**: Move plot spec generation to worker thread for large datasets
3. **Incremental Rendering**: Use React 18 concurrent features for progressive enhancement
4. **Shared Plot Context**: Memoize shared domain calculations across plots
5. **Plot Recycling**: Reuse SVG elements instead of destroying/recreating

## Conclusion

These optimizations target the root causes of performance issues during faceting changes:
- **Eliminated unnecessary effect re-runs** that caused layout thrashing
- **Added intelligent memoization** to prevent cascading re-renders
- **Optimized DOM operations** to reduce browser workload
- **Maintained clean code** without sacrificing readability or maintainability

The result should be a **single, fast render** to the target layout with no intermediate states or animations, focusing on **maximum performance** as requested.

