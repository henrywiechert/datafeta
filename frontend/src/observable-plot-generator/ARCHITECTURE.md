# Observable Plot Generator Architecture

## Overview

The `observable-plot-generator` subsystem transforms visualization configurations (fields, data, styling) into Observable Plot chart specifications. It serves as the **rendering engine** for the data visualization application.

## Module Structure

```
observable-plot-generator/
├── observablePlotGenerator.ts   # Main entry point
├── types.ts                     # Shared type definitions
├── analysis/                    # Field analysis
│   └── fieldAnalysis.ts
├── rules/                       # Chart type decision logic
│   └── chartRules.ts
├── chartTypes/                  # Individual chart renderers
│   ├── barChart.ts
│   ├── barUnified.ts
│   ├── barCore.ts
│   ├── cellCharts.ts
│   ├── lineChart.ts
│   ├── scatterChart.ts
│   ├── tickStrip.ts
│   └── measureValuesMultiMark.ts
├── grid/                        # Cartesian grid generation
│   └── coreGridGenerator.ts
├── faceting/                    # Faceted chart generation
│   ├── facetPlanner.ts
│   ├── facetGenerator.ts
│   ├── facetCoordinator.ts
│   ├── barFacetGenerator.ts
│   ├── facetDomains.ts
│   ├── facetGrid.ts
│   ├── facetValidation.ts
│   └── facetUtils.ts
├── domains/                     # Domain computation
│   ├── measureDomains.ts
│   └── numericDomains.ts
├── helpers/                     # Utility helpers
│   ├── chartTypeResolver.ts
│   └── fields.ts
└── utils/                       # Shared utilities
    ├── colorSchemeUtils.ts
    ├── configBuilder.ts
    ├── dateFormatUtils.ts
    ├── fieldOverrides.ts
    ├── labelUtils.ts
    ├── sizeUtils.ts
    └── tooltipUtils.ts
```

## Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                         EXTERNAL INPUT                              │
│  ChartGenerationContext { xFields, yFields, queryResult, ... }     │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    generatePlot() [entry point]                     │
│  • Validates inputs (empty fields, no data)                        │
│  • Normalizes datetime fields (epoch → Date)                       │
│  • Checks if faceting is needed (discrete dimensions present?)     │
└─────────────────────────────────────────────────────────────────────┘
                    │                               │
           [faceting needed]               [no faceting]
                    │                               │
                    ▼                               ▼
    ┌──────────────────────────┐    ┌──────────────────────────┐
    │   generateFacetedGrid()  │    │   generatePlotCore()     │
    │   faceting/facetGenerator│    │                          │
    │                          │    └──────────────────────────┘
    │  Creates outer grid by   │                    │
    │  discrete dimensions     │       ┌───────────┴───────────┐
    │                          │       │                       │
    │  For each facet cell:    │  [x & y candidates]    [single-axis]
    │    → cellGenerator()     │       │                       │
    │    (see nested grids     │       ▼                       ▼
    │     section below)       │  ┌──────────────┐    ┌──────────────┐
    └──────────────────────────┘  │generateCart- │    │generateChart-│
                                  │esianPlots()  │    │Options()     │
                                  └──────────────┘    └──────────────┘
                                           │
                                           ▼
                              ┌──────────────────────────┐
                              │   chartTypes/*           │
                              │   (barChart, lineChart,  │
                              │    scatterChart, etc.)   │
                              └──────────────────────────┘
                                           │
                                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         OUTPUT: GridResultModel                     │
│  { cells: [...], layout: { type, columns, rows, ... }, headers? }   │
│  (`generatePlot` collapses the internal `PlotResult` at the boundary)│
└─────────────────────────────────────────────────────────────────────┘
```

## Nested Grids: Faceting + Cartesian Combined

When both discrete dimensions (for faceting) AND multiple continuous fields (for cartesian grids)
are present, the system creates **nested grids** that are flattened into a single output grid.

### Example Scenario

```
Input:
  X-axis: [SUM(sales), SUM(profit)]     ← 2 measures → cartesian columns
  Y-axis: [region (discrete), year]     ← 1 discrete (facet), 1 continuous
```

### Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                    generateFacetedGrid()                            │
│  1. planFacets() detects "region" is discrete → FacetPlan          │
│  2. Filter to continuous candidates only:                          │
│       xCandidates = [sales, profit]                                │
│       yCandidates = [year]                                         │
│  3. Create cartesianCellGenerator that calls generateCartesianPlots│
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    coordinateFacetedGrid()                          │
│  For each facet value (e.g., region = East, West, North):          │
│    1. Filter data to this region                                   │
│    2. Call cartesianCellGenerator(filteredData, ...)               │
│       → generateCartesianPlots() returns 2×1 inner grid            │
│    3. Offset positions: row = facetRow × baseRows + innerRow       │
│                         col = facetCol × baseCols + innerCol       │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         Final Flattened Grid                        │
│  3 facet rows × 2 cartesian columns = 3×2 grid of 6 charts         │
│                                                                     │
│  ┌─────────────────────────┬─────────────────────────┐             │
│  │ Region: East            │ Region: East            │             │
│  │ year vs SUM(sales)      │ year vs SUM(profit)     │             │
│  ├─────────────────────────┼─────────────────────────┤             │
│  │ Region: West            │ Region: West            │             │
│  │ year vs SUM(sales)      │ year vs SUM(profit)     │             │
│  ├─────────────────────────┼─────────────────────────┤             │
│  │ Region: North           │ Region: North           │             │
│  │ year vs SUM(sales)      │ year vs SUM(profit)     │             │
│  └─────────────────────────┴─────────────────────────┘             │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Implementation Details

1. **Field Filtering** (`facetGenerator.ts` lines 162-167):
   ```typescript
   // Only continuous fields go to cartesian grid
   const xCandidates = xFields.filter(f => 
     f.type === 'measure' || (f.type === 'dimension' && f.flavour === 'continuous')
   );
   ```

2. **Cell Generator Strategy** (`facetGenerator.ts` lines 170-205):
   - Bar charts use `createBarCellGenerator()` (specialized for category handling)
   - Other charts use inline `cartesianCellGenerator` that calls `generateCartesianPlots()`

3. **Position Flattening** (`facetCoordinator.ts` ~line 269):
   ```typescript
   cellResult.plots.forEach((p) => {
     allPlots.push({
       ...p,
       position: {
         row: r * baseRows + p.position.row,
         col: c * baseCols + p.position.col,
       },
     });
   });
   ```

4. **Shared Domains**: Computed once across ALL facets before cell generation, ensuring consistent scales

## Layer Responsibilities

### 1. Entry Layer (`observablePlotGenerator.ts`)
- **`generatePlot()`**: Main entry point from UI. Returns a `GridResultModel`
  produced by `buildGridFromPlotResult` after the internal pipeline finishes.
- **`generatePlotAsResult()`** *(internal)*: Same logic, but returns the
  internal `PlotResult` shape that the chart-type / faceting helpers thread
  end-to-end.
- **`baseGeneratePlot()`**: Entry point for faceting system (skips validation).
  Returns `PlotResult` so the faceting coordinator can stitch per-cell results
  back together; only `generatePlot` performs the boundary translation.
- Handles input validation, datetime normalization, facet detection.

### 2. Analysis Layer (`analysis/`)
- **`analyzeFields()`**: Classifies fields by type (measure/dimension) and axis
- Returns `FieldAnalysis` with counts and boolean flags for decision-making

### 3. Decision Layer (`rules/`)
- **`generateChartOptions()`**: Rule-based chart type selection
- Handles single-axis and special cases (tick strips, mixed dim+measure)
- Falls through a priority-ordered decision tree

### 4. Grid Layer (`grid/`)
- **`generateCartesianPlots()`**: Creates N×M grids for multi-field scenarios
- Handles X×Y candidate pairing with shared domains

### 5. Faceting Layer (`faceting/`)
- **`planFacets()`**: Determines which discrete fields become row/column facets
- **`generateFacetedGrid()`**: Orchestrates faceted chart generation
  - Separates discrete fields (→ facets) from continuous fields (→ inner charts)
  - Creates appropriate `CellGenerator` (bar-specific or cartesian)
- **`coordinateFacetedGrid()`**: Chart-agnostic facet orchestration
  - Computes shared domains across all facets
  - Loops through facet combinations, filters data, calls cell generator
  - Flattens nested grids into single output grid with offset positions
- **`createBarCellGenerator()`**: Specialized cell generator for bar/tick charts
- **`facetDomains.ts`**: Computes shared domains for faceted charts

### 6. Chart Renderers (`chartTypes/`)
Each module generates `Plot.PlotOptions` for a specific chart type:
- `barChart.ts` / `barUnified.ts`: Bar charts (single and multi-measure)
- `lineChart.ts`: Line charts with optional color encoding
- `scatterChart.ts`: Scatter plots with size/color encoding
- `tickStrip.ts`: Distribution tick marks
- `cellCharts.ts`: Dispatches to appropriate renderer by chart type

### 7. Domain Computation (`domains/`)
- **`measureDomains.ts`**: Computes shared measure domains with padding
- **`numericDomains.ts`**: Numeric/date domain computation

### 8. Utilities (`utils/`)
- **`configBuilder.ts`**: Builds config objects from context
- **`colorSchemeUtils.ts`**: Color scale derivation
- **`labelUtils.ts`**: Data label rendering
- **`tooltipUtils.ts`**: Custom tooltip formatting
- **`fieldOverrides.ts`**: Per-field override resolution

## External Interfaces

### Consumed by (Importers)

| Module | What it imports |
|--------|-----------------|
| `ChartArea/hooks/useChartGeneration.ts` | `generatePlot`, `GridResultModel`, `ChartGenerationContext`, `computeOverrideTargets`, `planFacets`, `validateFacetCounts` |
| `ChartGrid/*.tsx` | `GridResultModel` and helpers from `gridModel.ts` |
| `Legend/LegendPanel.tsx` | `deriveColorScaleInfo` |
| `Overrides/FieldOverridesPanel.tsx` | `computeOverrideTargets` |
| `datetime/dateTimeValueModel.ts` | `formatDateTick` |

### Dependencies (What it imports)

| External Module | Usage |
|-----------------|-------|
| `@observablehq/plot` | Chart rendering primitives |
| `../types.ts` | `Field`, `QueryResult`, `FieldOverrideState`, `UserChartType` |
| `../config/chartLayoutConfig.ts` | Layout constants (`BAR_STEP_PX`, `DOMAIN_PAD_RATIO`, etc.) |
| `../utils/fieldUtils.ts` | `getResultColumnName`, `getFieldDisplayName`, `normalizeTimelineData` |
| `../datetime/*` | DateTime normalization and warnings |

## Key Types

### Input: `ChartGenerationContext`
```typescript
interface ChartGenerationContext {
  xFields: Field[];
  yFields: Field[];
  queryResult: QueryResult;
  colorField?: Field;
  colorScheme?: string;
  sizeField?: Field;
  sizeRange?: [number, number];
  labelFields?: Field[];
  labelsEnabled?: boolean;
  tooltipFields?: Field[];
  fieldOverrides?: Record<string, FieldOverrideState>;
  globalChartType?: UserChartType | null;
  // ... more optional properties
}
```

### Output: `GridResultModel`
The public boundary returns a generic grid model (`gridModel.ts`):
```typescript
interface GridResultModel {
  cells: Array<{
    id: string;
    position: { row: number; col: number };
    content:
      | { kind: 'plot'; options: Plot.PlotOptions; facetBackground?: ... }
      | { kind: 'pie';  pieSpec: PiePlotSpec; tooltipConfig?: ...; ... }
      | { kind: 'text'; rows: TextGridCellRow[]; ... }
      | { kind: 'mark'; symbols: MarkSymbolSpec[]; ... }
      | { kind: 'empty'; ... };
    metadata?: { title?: string; xField?: Field; yField?: Field };
  }>;
  layout: GridLayoutModel;     // type, columns/rows, columnSizes/rowSizes, ...
  headers?: GridHeaders;       // hierarchical row/col header levels with spans
  sharedDomains?: { byMeasure?: Record<string, [number, number]> };
}
```

### Internal: `PlotResult`
The chart-type and faceting helpers thread a legacy `PlotResult` between
themselves. It is private to the generator package; only `generatePlot`'s
boundary collapses it into `GridResultModel` via `buildGridFromPlotResult`.
```typescript
interface PlotResult {
  library: 'observable-plot';
  plots: Array<{
    id: string;
    title: string;
    options: Plot.PlotOptions;
    position: { row: number; col: number };
    renderer?: 'observable-plot' | 'pie-svg';
    pieSpec?: PiePlotSpec;
    facetBackground?: FacetBackgroundInfo;
    xField?: Field;
    yField?: Field;
  }>;
  layout: { ... };
  sharedDomains?: { byMeasure?: ... };
  facetLabels?: { ... };
}
```

### Cell-Kind Extension Model

`GridResultModel.cells[i].content` is a discriminated union (`GridCellContent`),
not a single shape. Adding a new cell kind is the canonical way to introduce a
chart that needs custom rendering inside the grid (text tables, symbol grids,
pie cells, etc.) without touching the rest of the pipeline.

The extension surface has three pieces:

1. **Type** (`gridModel.ts`):
   ```ts
   export type GridCellContent =
     | { kind: 'plot';  options: Plot.PlotOptions; ... }
     | { kind: 'pie';   pieSpec: PiePlotSpec; ... }
     | { kind: 'text';  rows: TextGridCellRow[]; ... }
     | { kind: 'mark';  symbols: MarkSymbolSpec[]; ... }
     | { kind: 'empty'; ... }
     // | add a new variant here, e.g. { kind: 'sparkline'; ... }
   ```

2. **Generator**: a chart-type module under `chartTypes/` that returns a
   `GridResultModel` whose cells use the new kind. Two patterns are supported:
   - Standard pipeline: emit `Plot.PlotOptions` from `cellCharts.ts` and let
     `buildGridFromPlotResult` wrap it as `kind: 'plot'`. This is what bar,
     line, scatter, heatmap, etc. use.
   - Direct emission: bypass `PlotResult` entirely and return
     `GridResultModel` from the chart-type module. `tableGrid.ts` does this for
     `kind: 'text'` / `kind: 'mark'` cells, and `pieChart.ts` for `kind: 'pie'`
     when used as the global chart type.

3. **Renderer dispatch** (`ChartGrid/PlotArea.tsx`): a `switch` on `cell.content.kind`
   selects the right renderer. Adding a new variant means adding a `case`.
   Renderers live alongside in `ChartGrid/` (e.g. `renderers/PieSvgRenderer.tsx`,
   inline `TextCell` / `SymbolCell` in `PlotArea.tsx`).

When the new kind needs a different *presentation* (e.g. table-style headers,
its own pager, no external X/Y axes), also register it in
`chartTypes/chartTypePresentation.ts`. The presentation registry is the single
source of truth for "is this chart-type rendered as a table / pie / standard
chart?" — `ChartArea`, `tableViewUtils`, and `observablePlotGenerator` consult
it instead of string-matching individual chart-type ids.

### Auto-Detection of the Default Chart Type

`detectDefaultUserChartType(xFields, yFields, colorField)` in
`helpers/chartTypeResolver.ts` is the single source of truth for "what does
auto pick?". It is consumed by both:

- `useChartGeneration` (to upgrade `globalChartType: null` to a concrete type
  before rendering), and
- `ChartTypeControl` / `FieldOverridesPanel` (to highlight the auto-picked
  toggle button).

Adding a new auto-route (e.g. a future "wordcloud" rule) means adding a branch
to that function — every consumer picks it up automatically.

### Shared: `LabelConfig`
```typescript
interface LabelConfig {
  labelFields: Field[];
  labelsEnabled: boolean;
  samplingStrategy: 'auto' | 'all' | 'sample';
  samplingThreshold: number;
  sampleEvery: number;
}
```

## Design Principles

1. **Single Layout Format**: All charts use grid layout (1×1 for single charts)
2. **Shared Domains**: Consistent scales across facets and multi-chart grids
3. **Layered Decision Making**: Analysis → Rules → Rendering
4. **Composition over Inheritance**: Small, focused chart generators
5. **Immutable Contexts**: No mutation of input context

## Known Inconsistencies (Fixed)

| Issue | Resolution |
|-------|------------|
| Duplicate `LabelConfig` in 3 files | Consolidated to `types.ts` |
| `BarLabelConfig` vs `LabelConfig` | Removed `BarLabelConfig`, using `LabelConfig` |
| `generateScatterPlot` dead code | Removed from `chartRules.ts` |
| Variable shadowing in `chartRules.ts` | Fixed by computing all dimensions once |

## Performance Considerations

- **Lazy faceting**: Only computes facet cells when needed
- **Domain memoization**: Shared domains computed once, passed to all cells
- **Intrinsic sizing**: Bar charts calculate exact pixel sizes to avoid relayout
