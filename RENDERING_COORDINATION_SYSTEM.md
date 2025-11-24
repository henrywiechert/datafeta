# Rendering Coordination System

## Overview

This document describes the rendering coordination system implemented to ensure the loading modal is shown during actual DOM rendering of charts, not just during spec generation.

## Problem

Previously, the loading modal for rendering operations would appear briefly or not at all during complex faceted chart rendering because:

1. `startOperation('rendering')` was called when spec generation began
2. `completeOperation('rendering')` was called immediately after spec generation completed
3. The actual DOM rendering by Observable Plot happened **asynchronously** in React useEffect hooks
4. For complex faceted charts with many plots, this DOM rendering is what takes time and blocks the UI

## Solution

The new rendering coordination system tracks when all individual plots have actually rendered to the DOM, not just when the spec is generated.

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ useChartGeneration Hook                                      │
│ - Calls startOperation('rendering')                          │
│ - Generates plot spec (fast)                                 │
│ - Does NOT call completeOperation('rendering') anymore       │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ ChartArea Component                                          │
│ - Uses useRenderingCoordinator hook                          │
│ - Starts rendering batch when spec changes                   │
│ - Provides handlePlotRenderComplete callback                 │
│ - Calls completeOperation('rendering') when batch completes  │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ Component Hierarchy (ChartRenderer → ChartGrid → etc.)       │
│ - Threads onPlotRenderComplete callback down to plots        │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ ObservablePlot Component                                     │
│ - Receives plotId and onRenderComplete props                 │
│ - Calls Plot.plot() to render to DOM                         │
│ - Calls onRenderComplete(plotId) after DOM update            │
└─────────────────────────────────────────────────────────────┘
```

### Key Components

#### 1. useRenderingCoordinator Hook

Located in: `frontend/src/hooks/useRenderingCoordinator.ts`

Manages tracking of plot rendering completion:

```typescript
const coordinator = useRenderingCoordinator();

// Start tracking a batch of plots
coordinator.startRenderingBatch(
  ['plot-1', 'plot-2', 'plot-3'],
  () => {
    // Called when all plots complete
    completeOperation('rendering');
  }
);

// Mark individual plots as complete
coordinator.markPlotRendered('plot-1');
```

Features:
- Tracks pending plots in a Set
- Calls completion callback when all plots render
- Has timeout fallback (30s default) to prevent hanging
- Can cancel batches if needed

#### 2. ObservablePlot Enhancements

The `ObservablePlot` component now accepts:
- `plotId?: string` - Unique identifier for the plot
- `onRenderComplete?: (plotId: string) => void` - Callback when rendering completes

After calling `Plot.plot()` and updating the DOM, it notifies completion:

```typescript
requestAnimationFrame(() => {
  onRenderComplete(plotId);
});
```

Using `requestAnimationFrame` ensures the DOM has been updated before notifying completion.

#### 3. ChartArea Coordination

The `ChartArea` component orchestrates the entire process:

1. When `spec` changes, it extracts plot IDs and starts a rendering batch
2. Provides `handlePlotRenderComplete` callback to child components
3. When all plots complete, calls `completeOperation('rendering')`

Edge cases handled:
- If switching to table view, cancels rendering batch
- If spec has no plots, completes rendering immediately
- If in table view, no rendering tracking happens

### Component Threading

The callback is passed through the following component hierarchy:

```
ChartArea
  └─> ChartRenderer (onPlotRenderComplete)
        └─> ChartGrid (onPlotRenderComplete)
              └─> MultiPlotGrid (onPlotRenderComplete)
                    └─> PlotArea (onPlotRenderComplete)
                          └─> ObservablePlot (plotId, onRenderComplete)
```

## Configuration

The loading modal timeout for rendering is configured in `frontend/src/config/loadingConfig.ts`:

```typescript
timeouts: {
  rendering: 2000,  // 2 seconds in production
  rendering: 100,   // 100ms in development (for testing)
}
```

## Benefits

1. **Accurate Loading States**: The loading modal now appears during actual rendering, not just spec generation
2. **Responsive UI**: Users see the modal for complex charts that take time to render
3. **Interruptible**: The modal allows cancellation during long rendering operations
4. **Faceted Chart Support**: Properly tracks completion of multiple plots in faceted charts
5. **Timeout Protection**: Fallback timeout prevents indefinite loading states

## Testing

To test the system:

1. Create a complex faceted chart with many data points
2. Change filters or other parameters to trigger re-rendering
3. Observe that the loading modal appears during the rendering phase
4. Verify that the modal disappears only after all plots have rendered

Development mode (100ms timeout) makes it easier to see the modal during testing.

## Future Enhancements

Potential improvements:

1. **Progress Indication**: Show which plots are still rendering
2. **Incremental Rendering**: Render plots in batches to keep UI responsive
3. **Web Workers**: Move rendering to Web Workers for true non-blocking behavior
4. **Smart Cancellation**: Allow canceling only specific plots in a faceted grid

## Related Files

- `frontend/src/hooks/useRenderingCoordinator.ts` - Core coordinator logic
- `frontend/src/contexts/RenderingContext.tsx` - Context wrapper (for future use)
- `frontend/src/components/Visualization/ObservablePlot.tsx` - Enhanced plot component
- `frontend/src/components/Visualization/ChartArea/ChartArea.tsx` - Coordination orchestration
- `frontend/src/components/Visualization/ChartArea/hooks/useChartGeneration.ts` - Modified to defer completion
- `frontend/src/config/loadingConfig.ts` - Timeout configuration

