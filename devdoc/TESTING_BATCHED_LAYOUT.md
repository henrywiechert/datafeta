# Testing Batched Layout Calculations

## What Changed

ChartGrid now batches all layout calculations into a single `useMemo` hook. This ensures that when `rowHeightPx` (or any other dependency) changes, **all** derived properties update in **one atomic render cycle**.

## What to Test

### 1. Faceting Changes (Primary Test)

**Scenario**: Change filters to increase/decrease the number of facets

**What to look for**:
- ✅ **Single, clean render** to final layout
- ✅ **No intermediate "flicker"** or animation-like transitions
- ✅ Charts appear at their **final size immediately**
- ✅ No brief flash of smaller/larger charts before settling

**Test steps**:
1. Open the app with development console open
2. Start with a filter that shows 1-2 facets
3. Change filter to show 30-330 facets
4. Watch the console for `[ChartGrid] Layout calculations recomputed:`
5. Observe the visual transition - should be instant, no flicker

**Expected console output**:
```
[ChartGrid] Layout calculations recomputed: {
  columns: 11,
  rows: 30,
  rowHeightPx: 180,
  plotRowsSpec: "180px 180px 180px..."
}
[PlotArea] Rendering: 330 plots
```

You should see the layout calculations log **once** per faceting change, not multiple times.

### 2. Resize Browser Window

**Scenario**: Resize the browser window while viewing a faceted grid

**What to look for**:
- ✅ Charts resize smoothly
- ✅ No excessive console logging (debouncing should limit updates)
- ✅ Final size is correct after resize completes

**Test steps**:
1. Display 30+ facets
2. Resize browser window (make it narrower/wider, shorter/taller)
3. Check console - should see layout recalculations, but **debounced** (not continuous)

**Expected**: Smooth resize with minimal console spam (debouncing working)

### 3. Filter Changes (Non-Faceting)

**Scenario**: Change a filter that affects data but NOT the number of facets

**What to look for**:
- ✅ Charts update to show new data
- ✅ **No layout recalculation** (layout is stable)
- ✅ No `[ChartGrid] Layout calculations recomputed:` log

**Test steps**:
1. Display a faceted grid (e.g., 11x30)
2. Change a filter that doesn't affect faceting dimensions
3. Check console - should see plot re-renders but NOT layout recalculations

**Expected console output**:
```
[ObservablePlot] Re-rendering due to changes in: data
[ObservablePlot] Re-rendering due to changes in: data
... (one per plot)
```

But **NOT**:
```
[ChartGrid] Layout calculations recomputed:  ← Should NOT appear
```

### 4. Stabilization Freeze

**Scenario**: Change faceting and watch for stabilization mechanism

**What to look for**:
- ✅ `[ChartGrid] Stabilizing: freezing dimension updates for 200ms` appears
- ✅ Followed by `[ChartGrid] Stabilization complete: dimension updates allowed`
- ✅ No dimension updates during the 200ms freeze window

**Test steps**:
1. Change faceting (e.g., from 2x2 to 11x30)
2. Watch console for stabilization logs

**Expected console output**:
```
[ChartGrid] Stabilizing: freezing dimension updates for 200ms
[ChartGrid] Layout calculations recomputed: { columns: 11, rows: 30, ... }
[PlotArea] Rendering: 330 plots
[ChartGrid] Stabilization complete: dimension updates allowed
```

### 5. Scroll Performance

**Scenario**: Scroll through a large faceted grid

**What to look for**:
- ✅ Smooth scrolling
- ✅ No console spam during scrolling
- ✅ Scroll handlers remain attached (no `addEventListener` logs)

**Test steps**:
1. Display 30+ facets (more than fit on screen)
2. Scroll vertically and horizontally
3. Check console - should be silent during scroll
4. Charts should translate smoothly

**Expected**: Smooth scroll, silent console

## Performance Comparison

### Before (Cascading Renders)
```
1. User changes faceting 1x1 → 11x30
2. Initial render: rowHeightPx=120px
   → plotRowsSpec: "120px 120px..." (30 times)
   → 330 plots render at 120px
   → USER SEES: 120px charts (FLICKER FRAME 1)
3. rowHeightPx updates to 180px
   → plotRowsSpec: "180px 180px..." (30 times)
   → 330 plots re-render at 180px
   → USER SEES: Charts grow from 120px → 180px (FLICKER FRAME 2)
```

**Result**: 2-3 visible render frames, user sees flicker/animation

### After (Batched Renders)
```
1. User changes faceting 1x1 → 11x30
2. Stabilization freeze activates (200ms)
3. layoutCalcs recomputes ALL properties in ONE batch
4. Single render with final values:
   → rowHeightPx: 180px
   → plotRowsSpec: "180px 180px..." (30 times)
   → 330 plots render at 180px
   → USER SEES: 180px charts immediately
```

**Result**: 1 visible render frame, instant transition

## Debug Console Logs

### Key Logs to Watch

1. **`[ChartGrid] Layout calculations recomputed:`**
   - Shows when layoutCalcs useMemo recalculates
   - Should appear **once** per faceting change
   - Should NOT appear on non-layout changes (e.g., data-only filter changes)

2. **`[ChartGrid] Stabilizing: freezing dimension updates for 200ms`**
   - Confirms stabilization freeze is active
   - Prevents ResizeObserver from causing intermediate renders

3. **`[PlotArea] Rendering: N plots`**
   - Shows when PlotArea renders
   - Should appear once per layout change

4. **`[ObservablePlot] Re-rendering due to changes in: ...`**
   - Shows which props changed to cause a plot re-render
   - Useful for debugging unnecessary re-renders

### Silence is Golden

During these actions, console should be **silent**:
- Scrolling (no logs)
- Hovering over charts (no logs)
- Opening/closing debug panel (no layout logs)
- Filter changes that don't affect faceting (no layout logs)

## Known Warnings (Safe to Ignore)

```
React Hook useMemo has a missing dependency: 'spec'
```

This is **intentional**. We use `spec?.plots`, `spec?.layout`, and `spec?.facetLabels` to track specific properties, not the entire `spec` object. This prevents unnecessary recalculations when unrelated spec properties change.

## Troubleshooting

### Issue: Still seeing intermediate renders

**Check**:
1. Are you seeing multiple `[ChartGrid] Layout calculations recomputed:` logs?
2. Is the stabilization freeze activating?
3. Are ResizeObservers firing during the freeze?

**Solution**: Share the console logs - they'll reveal which component is causing extra renders.

### Issue: Charts not updating when they should

**Check**:
1. Is `[ChartGrid] Layout calculations recomputed:` appearing?
2. Is `[PlotArea] Re-rendering: ...` appearing with the correct reason?

**Solution**: The memoization might be too aggressive. Share which action doesn't trigger an update.

### Issue: Console spam during resize

**Check**: Are you seeing rapid-fire layout recalculations?

**Solution**: Debouncing might not be working. Check if setTimeout/RAF are being cleared properly.

## Success Criteria

✅ **Faceting changes show no visual flicker**
✅ **Console shows one layout recalculation per faceting change**
✅ **Scrolling is smooth with no console spam**
✅ **Data-only filter changes don't trigger layout recalculations**
✅ **Browser window resize is smooth and debounced**

## Regression Testing

Make sure these still work:
- ✅ Vertical scrolling (charts move, Y-axes fixed)
- ✅ Horizontal scrolling (charts move, X-axes fixed)
- ✅ Filter changes (data updates)
- ✅ Facet label rendering
- ✅ Chart tooltips
- ✅ Debug panel toggle
- ✅ Fullscreen mode
- ✅ Save/load configuration

## Next Steps if Issues Persist

If intermediate renders are still visible after this change:

1. **Enable verbose logging**: We've minimized logs in production, but development mode should show key events.

2. **Profile with React DevTools**: Use the Profiler tab to see which components are re-rendering and why.

3. **Chrome Performance Tab**: Record a faceting change and look for multiple Paint/Layout phases.

4. **Check other state updates**: The issue might be outside ChartGrid (e.g., parent components updating multiple times).

## Alternative Solutions (If Needed)

If batching alone doesn't solve it, consider:

### Option A: Move calculations to parent
Compute layout props in `VisualizationPage.tsx` before passing to ChartGrid.

### Option B: Use React 18 useDeferredValue
Defer non-critical updates during transitions.

### Option C: Double-buffer rendering
Render new layout off-screen, swap when complete.

But try the current solution first - it should eliminate 95%+ of flickering.


