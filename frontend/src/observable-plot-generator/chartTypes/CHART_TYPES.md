# Chart Types Module

This directory contains chart generators for Observable Plot. Each chart type is a self-contained module that produces `Plot.PlotOptions` for rendering.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                     High-Level Orchestration                        │
│  observablePlotGenerator.ts → chartRules.ts → coreGridGenerator.ts  │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        cellCharts.ts                                │
│  Central hub for pair-wise chart generation                         │
│  Uses CHART_HANDLERS registry for type dispatch                     │
│  Types: cellChartTypes.ts  Helpers: cellChartHelpers.ts             │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
    ┌─────────┬─────────┬───────┼────────┬─────────┬────────┐
    ▼         ▼         ▼       ▼        ▼         ▼        ▼
┌────────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────────────────┐
│scatter │ │ line │ │barCo-│ │ tick │ │ box  │ │ cdf  │ │measureValues     │
│Chart   │ │Chart │ │re    │ │Strip │ │Plot  │ │Chart │ │MultiMark         │
└────────┘ └──────┘ └──┬───┘ └──────┘ └──────┘ └──────┘ └──────────────────┘
                        │
                        ▼
                 ┌───────────┐
                 │barUnified │
                 └─────┬─────┘
                       │
                       ▼
                 ┌───────────┐
                 │ barChart  │
                 │ (wrapper) │
                 └───────────┘
```

## Module Inventory

| File | Lines | Purpose |
|------|-------|---------|
| `cellCharts.ts` | 676 | Central pair-wise chart dispatcher with registry pattern |
| `cellChartTypes.ts` | 54 | Shared type definitions (`Domains`, `ChartContext`, `ChartHandler`) |
| `cellChartHelpers.ts` | 104 | Utility functions used by cell chart handlers |
| `barCore.ts` | 448 | Core bar chart building utilities |
| `barUnified.ts` | 372 | Multi-measure bar/tick-strip chart builder |
| `barChart.ts` | 13 | Thin wrapper around `barUnified` for API compatibility |
| `scatterChart.ts` | 455 | Scatter plot generator with stratified sampling |
| `lineChart.ts` | 732 | Line chart generator with bin-aggregation |
| `tickStrip.ts` | 350 | Tick strip (1D distribution) generator |
| `boxPlot.ts` | 388 | Box plot generator with client-side summary statistics |
| `cdfChart.ts` | 198 | CDF curve generator (pre-computed CDF columns) |
| `ganttChart.ts` | 604 | Gantt/interval chart generator with intrinsic sizing |
| `measureValuesMultiMark.ts` | 453 | Multi-mark generator for MeasureValues with per-measure overrides |
| `barChart.test.ts` | 234 | Test suite for bar chart functionality |
| `lineChart.test.ts` | 226 | Test suite for line chart functionality |

---

## Core Components

### cellCharts.ts

The central hub for generating chart options for X×Y field pairs.

**Key Exports:**
- `generatePairChartOptions()` — Main API for generating PlotOptions given X/Y fields

**Chart Type Registry:**
```typescript
const CHART_HANDLERS: Record<CellChartType, ChartHandler> = {
  scatter: handleScatter,
  line: handleLine,
  barX: handleBarX,
  barY: handleBarY,
  tickX: handleTickX,
  tickY: handleTickY,
  boxX: handleBoxX,
  boxY: handleBoxY,
  dot: handleDot,
  ganttX: handleGanttX,
  ganttY: handleGanttY,
  cdf: handleCdf,
};
```

**Data Flow:**
1. Receives X/Y fields, data, and encoding options
2. Resolves chart type via `resolveChartTypeForPair()`
3. Dispatches to appropriate handler
4. Handler calls underlying chart generator (scatterChart, lineChart, etc.)

---

### barCore.ts

Low-level utilities for building bar charts.

**Key Exports:**
- `buildBarOptions()` — Main builder for Plot.PlotOptions
- `computeBandPaddingFromSizeField()` — Calculate band padding from size field or manual size
- `sortCategoriesByValue()` — Sort categories by aggregated measure values
- `resolveMeasureAlias()` — Get result column name for a measure field
- `ORIENTATION` — Orientation abstraction (vertical/horizontal)

**Internal Helpers (not exported for external use):**
- `computeValueDomain()` — Calculate value axis domain with zero-baseline
- `deriveCategories()` — Extract unique categories from data
- `aggregateByCategory()` — Sum measure values by category

---

### barUnified.ts

Higher-level bar chart builder that handles:
- Single or multiple measures
- Continuous dimensions (renders as tick strips)
- Composite categories from multiple discrete dimensions
- Bar sorting by value

**Key Export:**
- `barUnified()` — Returns a `PlotResult` with grid layout

**Returns:** `PlotResult` with:
- Array of plots (one per measure + one per continuous dimension)
- Grid layout with intrinsic sizing based on category count

---

### scatterChart.ts

Scatter plot generator with performance safeguards.

**Key Export:**
- `scatterChart()` — Generates scatter plot PlotOptions

**Features:**
- Handles numeric, date, and discrete axes
- Stratified sampling for discrete color (preserves representation)
- Budget system: 20,000 points (discrete color) / 100,000 points (no color)
- Auto-detects axis types from data samples

---

### lineChart.ts

Line chart generator with bin-aggregation for performance.

**Key Exports:**
- `buildLineOptions()` — Unified line/area builder with `orientation: 'horizontal' | 'vertical'`

**Features:**
- Bin-aggregation when data exceeds budget (1,000 points per series)
- Average-per-bin reduction for dense numeric/time axes
- Invisible hover dots for better tooltip detection
- Supports continuous color with bias transformation

---

### tickStrip.ts

1D distribution visualization (tick marks along one axis).

**Key Export:**
- `tickStrip()` — Generates tick strip PlotOptions

**Features:**
- Works with continuous dimensions or measures
- Optional category dimension for banded layout
- Band padding controlled by size field or manual size

---

### ganttChart.ts

Gantt/interval chart for visualizing ranges with start and duration values.

**Key Exports:**
- `ganttChart()` — Generates Gantt chart PlotOptions with intrinsic sizing
- `computeGanttIntrinsicSize()` — Calculate intrinsic width/height based on data range

**Features:**
- Uses Observable Plot's `barX`/`barY` with `x1`/`x2` (or `y1`/`y2`) channels for interval rendering
- **Size field semantics**: Unlike other charts, size field represents task DURATION, not visual thickness
- Band padding (bar thickness) controlled by manualSize only
- Intrinsic sizing: Chart width calculated from data range × pixels-per-unit
- Supports optional zoom level parameter for future zoom/pan controls
- Handles edge cases: negative durations (clamped to 0), zero durations (thin lines), null/undefined (fallback)
- Domain computation includes both start and end values (start + duration)

**Orientation:**
- `ganttX`: Horizontal Gantt (most common) — start on X-axis, categories on Y-axis
- `ganttY`: Vertical Gantt — start on Y-axis, categories on X-axis

**Configuration Constants (chartLayoutConfig.ts):**
- `GANTT_UNIT_PX`: Base pixels per data unit (default: 10)
- `MIN_GANTT_WIDTH_PX`: Minimum intrinsic width (default: 200)
- `MAX_GANTT_WIDTH_PX`: Maximum intrinsic width (default: 10000)

**Future Enhancements (Architecture-Ready):**
- DateTime support (currently numeric-only)
- Zoom/pan controls via `zoomLevel` parameter

---

### boxPlot.ts

Box plot generator with client-side summary statistics computation.

**Key Export:**
- `boxPlot()` — Generates `Plot.PlotOptions` for a horizontal (`boxX`) or vertical (`boxY`) box plot

**Signature:**
```typescript
boxPlot(
  context: ChartGenerationContext,
  orientation: 'x' | 'y',
  valueColumn: string,
  categoryColumn?: string,
  labels?: { dimension?: string; category?: string },
  axisDomain?: [number, number] | [Date, Date],
  sharedColorScale?: ColorScaleInfo | null,
): Plot.PlotOptions
```

**Features:**
- **Client-side aggregation**: Groups raw rows into `SummaryRow` objects (min, Q1, median, Q3, max, count) via `buildSummaryRows()`. No server-side pre-aggregation required.
- **Date support**: Parses ISO strings into `Date`; interpolates quantiles numerically then converts back to `Date`.
- **Discrete color**: `buildColorizedBoxData()` maps color field values onto category groups when a single color is consistent per category. Adds a synthetic `__box_plot_color` column.
- **Hover interaction**: Transparent `rectX`/`rectY` overlay keyed to `summaryRows` provides tooltip data (summary stats + count) without raw-row enumeration.
- **Category axis sizing**: Computed from `BAR_STEP_PX × categoryCount × bandThicknessScale`.
- **Band padding**: Delegated to `computeBandPaddingFromSizeField()` (respects `manualSize`; no size field semantics).
- **Orientation**: `'x'` → horizontal `Plot.boxX`; `'y'` → vertical `Plot.boxY`.

---

### cdfChart.ts

CDF (Cumulative Distribution Function) curve generator. Expects pre-computed CDF columns from the backend query.

**Key Exports:**
- `buildCdfOptions()` — Returns `Plot.PlotOptions` for a CDF line + hover dot chart
- `CDF_SUFFIX` — Column naming convention: `"__cdf"` (e.g., `revenue__cdf`)

**Features:**
- Validates that CDF columns are present; renders a friendly waiting message when the CDF query is still in flight (stale data from previous result).
- Explicit X domain computed from data to prevent Observable Plot defaulting to `[0, 1]`.
- Supports multi-curve CDFs via a discrete `colorField` (uses `stroke`/`z` partitioning).
- Invisible hover dots (r=6, transparent) for tooltip detection.
- Filters out non-finite rows before rendering.

---

### cellChartTypes.ts

Shared type definitions extracted from `cellCharts.ts` to avoid circular imports.

**Key Exports:**
- `Domains` — `Record<string, [number, number] | [Date, Date]> | undefined` for shared measure scales
- `ChartContext` — Bundle of common chart generation parameters (color, size, labels, zoom, etc.)
- `ChartHandler` — `(data, xf, yf, ctx) => Plot.PlotOptions` function signature

---

### cellChartHelpers.ts

Utility functions used by `cellCharts.ts` handlers, extracted to keep handler code readable.

**Key Exports:**
- `aggregateValues()` — Numeric aggregation (sum/count/min/max/avg) across data rows
- `resolveXYColumns()` — Resolve result column names for X/Y fields, handling measure aliases
- `messageOptions()` — Create a message-only `PlotOptions` for error/empty states
- `scatterForDimOnly()` — Fallback scatter when only dimensions are present
- `resolveColumnInData()` — Find a column that exists in the actual data rows

---

### measureValuesMultiMark.ts

Special generator for MeasureValues synthetic field with per-measure chart types.

**Key Exports:**
- `generateMeasureValuesMultiMarkPlot()` — Multi-mark plot generator
- `hasAnyMeasureOverrides()` — Check if per-measure overrides exist

**Features:**
- Renders each source measure as separate mark layer
- Per-measure chart type (line, scatter, bar, tick)
- Per-measure size and color overrides
- M4-ish reduction for line marks (10,000 point budget)

---

## Performance Budgets

Each chart type has safeguards against rendering too many points:

| Chart Type | Budget (w/ discrete color) | Budget (w/o color) |
|------------|---------------------------|-------------------|
| Scatter | 20,000 | 100,000 |
| Line | 1,000/series | 1,000 |
| Line Dots | 1,000/series | 1,000 |
| MeasureValues Line | 10,000/measure | 10,000 |
| MeasureValues Dots | 8,000/measure | 8,000 |

---

## Common Patterns

### Custom Tooltip Configuration

All chart types attach a `__customTooltip` property:

```typescript
(plotOptions as any).__customTooltip = {
  enabled: true,
  data: data,
  getFields: createTooltipFieldsGetter(mainFields, colorField, sizeField, tooltipFields)
};
```

### Color Scale Application

Continuous and categorical color handled uniformly:

```typescript
if (colorInfo.kind === 'continuous') {
  plotOptions.color = {
    type: 'linear',
    domain: colorInfo.domain,
    range: colorInfo.range,
    clamp: true,
  };
} else {
  plotOptions.color = {
    type: 'ordinal',
    domain: colorInfo.domain,
    range: colorInfo.range,
  };
}
```

### Orientation Abstraction

Bar and line charts use orientation objects for axis-agnostic code:

```typescript
const ORIENTATION = {
  vertical: { measure: 'y', category: 'x', bar: Plot.barY },
  horizontal: { measure: 'x', category: 'y', bar: Plot.barX },
};
```

---

## External Connections

### Consumed By:
- `coreGridGenerator.ts` — Uses `generatePairChartOptions()` for N×M grids
- `chartRules.ts` — Uses individual chart generators for specific scenarios
- `observablePlotGenerator.ts` — Uses `barUnified()` directly for bar scenarios
- `facetGenerator.ts` — Uses `barCore` utilities for faceted bar charts
- `barFacetGenerator.ts` — Uses `buildBarOptions()` for faceted bars

### Dependencies:
- `@observablehq/plot` — Core plotting library
- `../utils/colorSchemeUtils` — Color scale computation
- `../utils/sizeUtils` — Size scale computation
- `../utils/tooltipUtils` — Tooltip field configuration
- `../utils/labelUtils` — Data label rendering
- `../helpers/chartTypeResolver` — Chart type resolution logic
- `../../config/chartLayoutConfig` — Layout constants (BAR_STEP_PX, etc.)

---

## Improvement Opportunities

### Identified for Future Refactoring:

1. **Parameter Explosion**: `generatePairChartOptions()` and chart functions have 15+ positional parameters. Consider using config objects.

2. **Magic Numbers**: Budget constants scattered across files could be centralized in `chartLayoutConfig.ts`.

3. **Repeated Patterns**: Custom tooltip setup and color scale application are duplicated across chart types. Could extract to shared utilities.

4. **Type Safety**: Many `as any` casts for Plot options could be improved with better type definitions.

5. **Redundant Wrapper**: `barChart.ts` is a 14-line wrapper that could potentially be inlined.
