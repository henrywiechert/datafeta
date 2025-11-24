# Testing Guide: Rendering Coordination System

## Overview

This guide provides instructions for testing the new rendering coordination system that shows loading modals during actual chart rendering (not just spec generation).

## Prerequisites

1. Start the development server:
   ```bash
   cd frontend
   npm start
   ```

2. Ensure you have a data source configured (ClickHouse or CSV file)

## Test Scenarios

### Test 1: Simple Chart Rendering

**Goal**: Verify that fast-rendering charts don't show the modal unnecessarily.

**Steps**:
1. Connect to a data source
2. Create a simple bar chart with a single dimension and measure
3. Apply a filter to re-render the chart

**Expected Result**:
- Chart renders quickly without showing the loading modal (completes in < 2 seconds)

### Test 2: Complex Faceted Chart

**Goal**: Verify that complex faceted charts show the loading modal during rendering.

**Steps**:
1. Create a faceted chart with:
   - Multiple dimensions on X-axis (faceted)
   - Multiple measures on Y-axis
   - Color encoding
   - Large dataset (10,000+ rows)
2. Change a filter value to trigger re-rendering

**Expected Result**:
- Loading modal appears with "Rendering chart..." message
- Modal shows elapsed time
- Modal allows cancellation
- Modal disappears only after all plots have rendered
- UI is responsive during rendering

### Test 3: Filter Changes

**Goal**: Verify that filter changes trigger loading modal for complex charts.

**Steps**:
1. Set up a complex faceted chart (as in Test 2)
2. Change filter values multiple times in quick succession
3. Observe loading modal behavior

**Expected Result**:
- Each filter change that takes > 2 seconds to render shows the modal
- Modal updates correctly for each operation
- Cancelling stops the rendering operation

### Test 4: Table View Toggle

**Goal**: Verify that switching to table view doesn't cause issues.

**Steps**:
1. Create a complex faceted chart
2. While it's rendering (modal visible), switch to table view
3. Switch back to chart view

**Expected Result**:
- Switching to table view cancels the rendering batch
- No stuck loading modals
- Switching back works correctly

### Test 5: Rapid Configuration Changes

**Goal**: Test robustness under rapid changes.

**Steps**:
1. Create a complex chart
2. Rapidly change:
   - X-axis fields (add/remove)
   - Y-axis fields (add/remove)
   - Color encoding
   - Filters

**Expected Result**:
- No duplicate loading modals
- Modal only shows for operations > 2 seconds
- System remains stable
- No console errors

### Test 6: Timeout Fallback

**Goal**: Verify timeout protection works.

**Steps**:
1. Create an extremely complex chart that might hang
2. Wait for 30+ seconds if rendering gets stuck

**Expected Result**:
- After 30 seconds, the rendering operation completes automatically
- Modal disappears
- System doesn't hang indefinitely

## Development Mode Testing

In development mode, the rendering timeout is set to 100ms instead of 2000ms, making it easier to see the modal:

**To test in development mode**:
1. Ensure `NODE_ENV=development` (default for `npm start`)
2. Create any chart with faceting
3. Change any parameter to trigger re-rendering

**Expected Result**:
- Modal appears after 100ms for any chart
- Helps verify the system is working correctly

## Debug Information

### Console Logging

Look for these console messages:

- `[RenderingCoordinator] Rendering timeout reached, forcing completion` - Indicates timeout fallback triggered
- `Observable Plot generation failed:` - Indicates spec generation error

### Browser DevTools

Check the React DevTools to verify:
1. `isLoadingRendering` state transitions correctly
2. `showLoadingModal` appears only when appropriate
3. `activeOperations` array tracks 'rendering' correctly

### Network Tab

The rendering coordination is entirely client-side, so:
- No additional network requests should be made
- Query execution is separate and should already show loading states

## Performance Benchmarks

Record these metrics for comparison:

| Scenario | Chart Type | Data Size | Facets | Rendering Time | Modal Shown? |
|----------|-----------|-----------|---------|----------------|--------------|
| Simple | Bar | 100 rows | None | ~100ms | No |
| Medium | Bar | 1000 rows | 2x2 | ~500ms | No |
| Complex | Bar | 10000 rows | 3x3 | ~3s | Yes |
| Very Complex | Bar | 50000 rows | 5x5 | ~10s | Yes |

## Common Issues and Solutions

### Issue: Modal never appears for slow rendering
**Solution**: Check that `NODE_ENV` is correctly set. In production, timeout is 2000ms.

### Issue: Modal appears for fast renders
**Solution**: This is expected in development mode (100ms timeout). Test in production build.

### Issue: Modal gets stuck
**Solution**: Check browser console for errors. The 30s timeout should prevent indefinite hanging.

### Issue: Multiple modals appear
**Solution**: This indicates a bug in the coordination system. Check that `activeOperations` is being managed correctly.

### Issue: Console warnings about missing plotIds
**Solution**: Verify all plots in the spec have unique IDs. The ID generation happens in the plot generator.

## Regression Testing

After any changes to the rendering system, verify:

1. ✅ Simple charts render without modal
2. ✅ Complex charts show modal during rendering
3. ✅ Filter changes trigger appropriate loading states
4. ✅ Table view toggle works correctly
5. ✅ Rapid changes don't cause errors
6. ✅ Timeout fallback prevents hanging
7. ✅ Modal cancellation works
8. ✅ No memory leaks (check DevTools Memory profiler)

## Accessibility Testing

Verify the loading modal:
1. Can be dismissed with Escape key
2. Has appropriate ARIA labels
3. Maintains focus correctly
4. Announces state changes to screen readers

## Browser Compatibility

Test in:
- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)

All should handle the `requestAnimationFrame` callback correctly.

## Conclusion

The rendering coordination system should provide a better user experience by accurately reflecting when the application is busy rendering charts, especially for complex faceted visualizations. The system is designed to be robust, with timeout fallbacks and proper state management to prevent hanging or duplicate modals.

