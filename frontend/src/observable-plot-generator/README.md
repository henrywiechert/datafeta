# Observable Plot Generator

This directory contains the Observable Plot chart generation path for the app.

> **Note**: For comprehensive documentation about Observable Plot charts, faceting, and field classification, see the main frontend documentation:
> - [Observable Plot Charts](../../observable-plot.md)
> - [Faceting System](../../faceting.md) 
> - [Field Classification](../../fields.md)

## Architecture

Simple direct generation using small chart helpers. The generator returns a `PlotResult` for a single chart or a CSS Grid of charts.

```
observablePlotGenerator.ts (main entry point)
├── analyzeFields() - Simple field analysis
├── generateChartOptions() - Rule-based chart selection
├── generateCartesianGrid() - N×M pairing grid
└── chartTypes/
    ├── barChart.ts (delegates to barUnified)
    ├── barUnified.ts (single+multi measure unified)
    ├── tickStrip.ts
    ├── lineChart.ts
    └── scatterChart.ts
```

## Layout Model

The generator returns a `PlotResult` describing either a single chart (`options`) or multiple charts (`plots`) with a `layout` description.

```ts
interface PlotResult {
  library: 'observable-plot';
  options?: Plot.PlotOptions;
  plots?: Array<{
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
    columnSizes?: Array<number | 'fr'>; // number => px, 'fr' => flexible
    rowSizes?: Array<number | 'fr'>;
  };
}
```

When `layout.type === 'grid'`, the React `ChartGrid` uses CSS Grid to place each plot at `position.row/col`, sets `gridTemplateColumns/Rows` from `layout.columnSizes/rowSizes`, and ensures a single scroll container with no gaps. Flexible tracks use `minmax(MIN_PX, 1fr)` to enforce a minimum readable size.

## Chart Selection Rules (default)

- Single continuous measure on one axis → bar chart (direction follows the measure axis)
- 2+ continuous measures on same axis → grid of bar charts (X→horizontal aligned horizontally; Y→vertical stacked vertically)
- Single continuous dimension → tick-strip (`tickX`/`tickY`) in same direction as bars would be
- Multiple continuous dimensions on same axis → grid of tick-strips
- Continuous measure on both axes → scatter plot (single point)
- Continuous measure on one axis, continuous dimension on the other → line chart
- Continuous dimension on both axes → scatter plot
- With multiple candidates on both axes, a Cartesian product grid (N×M) is created.

## Sizing and Scrolling Policy

- Bar charts: intrinsic size from fixed bar step × category count along categorical axis; they never shrink; the container scrolls if needed.
- Other charts: fill available grid cell; grid enforces reasonable minimum via `minmax`.
- Only one scrollbar per direction: the grid container scrolls; plots do not.
- No gaps between plots.

## Shared Domains

- For multi-measure comparisons or Cartesian grids, the generator computes `sharedDomains.byMeasure[measureName] = [min, max]` across all cells, including 0 and 10% headroom. These are applied to axes where the measure appears so comparisons are fair across facets.

## Edge Cases

- Empty data or non-numeric values: charts degrade to a centered message (e.g., "No numeric data …").
- Negative-only datasets: domains include 0 for context; when all values ≤ 0, the lower bound is the min and upper bound clamps to 0 to avoid inverted axes.
- Extremely large facet counts: no virtualization/pagination yet.
