# Observable Plot Charts

This document outlines the Observable Plot chart implementation and generation system used in the frontend.

## Overview

The chart system is built around Observable Plot, providing programmatic API access with high-level abstractions for chart generation. The system focuses on flexible chart construction with responsive layouts and intelligent field-based chart selection.

## Architecture

### Directory Structure

```
frontend/src/
├── observable-plot-generator/     # Observable Plot implementation
│   ├── observablePlotGenerator.ts # Main plot generator
│   ├── chartTypes/                # Plot mark implementations
│   │   ├── barChart.ts
│   │   ├── multiMeasureBarChart.ts
│   │   ├── tickStrip.ts
│   │   ├── lineChart.ts
│   │   └── scatterChart.ts
│   ├── types.ts                   # PlotResult and related types
│   └── README.md                  # Technical implementation details
│
└── components/Visualization/
    ├── ChartGrid.tsx              # Universal chart renderer
    ├── ObservablePlot.tsx         # React wrapper for Observable Plot
    └── ChartGrid.module.css       # Chart-specific CSS styles
```

### Generation Pipeline

The chart generation follows a structured pipeline:

1. **Field Analysis**: Classify fields using `analyzeFields()` for type and flavour detection
2. **Chart Selection**: Apply rule-based chart selection via `generateChartOptions()`
3. **Grid Generation**: Create N×M chart grids using `generateCartesianGrid()`
4. **Rendering**: Apply CSS Grid layouts for responsive multi-chart displays

## Chart Selection Rules

The system automatically selects appropriate chart types based on field characteristics:

### Single Chart Types
- **Continuous dimension only** → Tick-strip chart showing value distribution
- **Single measure on one axis** → Bar chart (direction follows measure axis)
- **Measure on both axes** → Scatter plot with single aggregated point
- **Continuous dimension + measure** → Line chart
- **Continuous dimensions on both axes** → Scatter plot

### Multi-Chart Layouts
- **Multiple continuous measures on same axis** → Grid of bar charts
  - X-axis measures → Horizontal alignment
  - Y-axis measures → Vertical stacking
- **Multiple continuous dimensions** → Grid of tick-strips
- **Cartesian combinations** → N×M grid when multiple candidates exist on both axes

## Layout System

### PlotResult Interface

```typescript
interface PlotResult {
  library: 'observable-plot';
  options?: Plot.PlotOptions;        // Single chart
  plots?: Array<{                    // Multi-chart grid
    id: string;
    title: string;
    options: Plot.PlotOptions;
    position?: { row: number; col: number };
  }>;
  sharedDomains?: {
    x?: any;
    y?: any;
    byMeasure?: Record<string, [number, number]>;
  };
  layout?: {
    type: 'single' | 'grid' | 'vertical' | 'horizontal';
    columns?: number;
    rows?: number;
    columnSizes?: Array<number | 'fr'>;
    rowSizes?: Array<number | 'fr'>;
  };
}
```

### CSS Grid Implementation

When `layout.type === 'grid'`, the React `ChartGrid` component:
- Uses CSS Grid to position each plot at `position.row/col`
- Sets `gridTemplateColumns/Rows` from `layout.columnSizes/rowSizes`
- Ensures single scroll container with no gaps between charts
- Uses `minmax(MIN_PX, 1fr)` for flexible tracks with minimum readable size

## Responsive Sizing Policy

### Chart-Specific Sizing
- **Bar Charts**: Intrinsic sizing based on `fixed bar step × category count`
  - Never shrink below readable size
  - Container scrolls when content exceeds available space
- **Other Chart Types**: Fill available grid cell space
  - Grid enforces minimum size via `minmax()`
  - Responsive to container dimensions

### Scrolling Behavior
- **Single scrollbar per direction**: Only the grid container scrolls
- **No nested scrolling**: Individual plots do not have scrollbars
- **Gap-free layout**: No spaces between adjacent charts

## Shared Domains

For consistent multi-chart comparisons, the system computes shared domains:

- **Cross-chart consistency**: `sharedDomains.byMeasure[measureName] = [min, max]`
- **Zero inclusion**: Domains include 0 for meaningful comparisons
- **Headroom padding**: 10% additional space for visual clarity
- **Negative handling**: Proper domain calculation for negative-only datasets

## CSS Integration

### Observable Plot Specific Styles

```css
.observablePlotContainer {
  align-items: stretch;
}

.observablePlotContainer > div {
  width: 100%;
  height: 100%;
}
```

### Detection Points

The system detects chart types at key points:

1. **Generation**: `chartingLibrary` state variable in context
2. **Rendering**: `spec.library === 'observable-plot'` property check
3. **CSS Application**: Chart-type specific class application
4. **Interactions**: Observable Plot component handles its own events

## Edge Cases and Error Handling

### Data Quality Issues
- **Empty datasets**: Display centered "No data available" message
- **Non-numeric values**: Graceful degradation with appropriate messaging
- **Missing fields**: Fallback to simpler chart types or table view

### Performance Considerations
- **Large datasets**: Performance warnings for >50K rows
- **Extreme facet counts**: No virtualization implemented yet (future enhancement)
- **Memory management**: Efficient domain calculation across large grids

## Future Development

### Planned Enhancements
- ✅ Programmatic API for flexible chart construction
- ✅ High-level abstractions for common chart types
- 🔄 Custom interaction and tooltip handling
- 🔄 Advanced faceting and small multiples
- 📋 Chart virtualization for large facet grids
- 📋 Custom interaction patterns and brushing
- 📋 Enhanced accessibility features