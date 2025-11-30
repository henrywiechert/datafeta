# Observable Plot Charts

This document outlines the Observable Plot chart implementation and generation system used in the frontend.

**Last Updated**: November 30, 2025

## Overview

The chart system is built around Observable Plot, providing programmatic API access with high-level abstractions for chart generation. The system focuses on flexible chart construction with responsive layouts, intelligent field-based chart selection, and sophisticated faceting capabilities.

## Architecture

### Directory Structure

```
frontend/src/
├── observable-plot-generator/     # Observable Plot implementation
│   ├── observablePlotGenerator.ts # Main plot generator entry point
│   ├── types.ts                   # PlotResult and ChartGenerationContext types
│   ├── README.md                  # Technical implementation details
│   │
│   ├── analysis/                  # Field analysis
│   │   └── fieldAnalysis.ts      # Analyze fields to determine chart strategy
│   │
│   ├── chartTypes/                # Chart type implementations
│   │   ├── barChart.ts           # Bar chart (delegates to barUnified)
│   │   ├── barUnified.ts         # Unified bar chart (single+multi measure)
│   │   ├── barCore.ts            # Core bar chart utilities
│   │   ├── cellCharts.ts         # Individual grid cell chart generation
│   │   ├── lineChart.ts          # Line and vertical line charts
│   │   ├── scatterChart.ts       # Scatter plot charts
│   │   └── tickStrip.ts          # Tick strip distribution charts
│   │
│   ├── domains/                   # Domain calculation
│   │   ├── measureDomains.ts     # Shared measure domains for consistency
│   │   └── numericDomains.ts     # Numeric and categorical domain handling
│   │
│   ├── faceting/                  # Faceting system (see faceting.md)
│   │   ├── facetPlanner.ts       # Determine faceting strategy
│   │   ├── facetCoordinator.ts   # Orchestrate faceted grid generation
│   │   ├── facetGenerator.ts     # Generate faceted charts
│   │   ├── facetDomains.ts       # Shared domains for facets
│   │   ├── facetGrid.ts          # Grid layout for facets
│   │   └── facetUtils.ts         # Faceting utilities
│   │
│   ├── grid/                      # Grid generation
│   │   └── coreGridGenerator.ts  # Cartesian N×M grid generation
│   │
│   ├── helpers/                   # Helper utilities
│   │   ├── chartTypeResolver.ts  # Chart type resolution logic
│   │   └── fields.ts             # Field helper functions
│   │
│   ├── rules/                     # Chart selection rules
│   │   └── chartRules.ts         # Rule-based chart type selection
│   │
│   └── utils/                     # Utility functions
│       ├── colorSchemeUtils.ts   # Color scale configuration
│       ├── fieldOverrides.ts     # Per-field chart overrides
│       ├── labelUtils.ts         # Label sampling and display
│       ├── sizeUtils.ts          # Size encoding utilities
│       └── tooltipUtils.ts       # Tooltip configuration
│
└── components/Visualization/
    ├── ChartGrid/                 # Multi-chart grid rendering
    │   ├── ChartGrid.tsx         # Universal chart renderer
    │   ├── MultiPlotGrid.tsx     # Three-layer scrolling architecture
    │   ├── PlotArea.tsx          # Individual plot rendering
    │   ├── FacetLabels.tsx       # Facet header labels
    │   ├── XAxes.tsx             # X-axis rendering
    │   ├── YAxes.tsx             # Y-axis rendering
    │   ├── ChartGrid.module.css  # Chart-specific CSS styles
    │   └── hooks/                # Custom hooks for grid management
    │
    └── ObservablePlot.tsx        # React wrapper for Observable Plot
```

### Generation Pipeline

The chart generation follows a structured pipeline:

1. **Field Analysis**: Classify fields using `analyzeFields()` from `analysis/fieldAnalysis.ts`
   - Determines field types (measure vs dimension, discrete vs continuous)
   - Identifies multi-continuous scenarios
   - Analyzes candidate fields for cartesian grid generation

2. **Facet Planning**: Determine if faceting should be applied via `planFacets()` from `faceting/facetPlanner.ts`
   - Discrete dimensions trigger faceting
   - Returns `FacetPlan` with row and column facet fields
   - Chart generators decide if fields should be used for category encoding instead

3. **Chart Selection**: Apply rule-based chart selection
   - For faceted scenarios: Use `coordinateFacetedGrid()` from `faceting/facetCoordinator.ts`
   - For non-faceted scenarios: Use `generatePlotCore()` in `observablePlotGenerator.ts`
   - Delegates to specific chart type generators (bar, line, scatter, tick strip)

4. **Domain Calculation**: Compute shared domains for consistency
   - `computeSharedMeasureDomains()` for measures across charts
   - `computeSharedDomainsForFaceting()` for faceted charts
   - Ensures consistent scales across all charts in a grid

5. **Grid Generation**: Create N×M chart grids
   - Cartesian grids via `generateCartesianPlots()` from `grid/coreGridGenerator.ts`
   - Faceted grids via faceting coordinator
   - Returns array of positioned plots

6. **Layout Assembly**: Package into `PlotResult`
   - Grid layout with column/row sizes
   - Shared domains for consistency
   - Facet labels for hierarchical headers

7. **Rendering**: Apply three-layer scrolling architecture via `MultiPlotGrid`
   - Top layer: Facet column headers
   - Left layer: Y-axes and facet row headers
   - Main layer: Scrollable plot grid with X-axes

## Chart Selection Rules

The system automatically selects appropriate chart types based on field characteristics:

### Single Chart Types
- **Continuous dimension only** → Tick-strip chart showing value distribution
- **Single measure on one axis** → Bar chart (direction follows measure axis)
- **Measure on both axes** → Scatter plot with single aggregated point
- **Continuous dimension + measure** → Line chart
- **Continuous dimensions on both axes** → Scatter plot

### Multi-Chart Layouts
- **Multiple measures on same axis** → Grid of charts
  - X-axis measures → Horizontal alignment (columns)
  - Y-axis measures → Vertical stacking (rows)
  - Each measure gets its own chart
  
- **Multiple continuous dimensions/measures** → Cartesian grid (N×M)
  - Pairs each X candidate with each Y candidate
  - Creates grid of charts (bars, lines, or scatter plots)
  
- **Discrete dimensions present** → Faceting system
  - X-axis discrete → Column facets
  - Y-axis discrete → Row facets
  - Both axes → Matrix grid of facets
  - See [faceting.md](./faceting.md) for details

### Chart Type Resolution

The `chartTypeResolver.ts` determines specific chart types for field pairs:

```typescript
// Field pair → Chart type mapping
continuous_measure × continuous_measure → scatter
continuous_measure × continuous_dimension → line (horizontal)
continuous_dimension × continuous_measure → line (vertical)
continuous_measure × discrete_dimension → bar (horizontal)
discrete_dimension × continuous_measure → bar (vertical)
continuous_dimension × continuous_dimension → scatter
discrete_dimension × discrete_dimension → scatter (categorical)
```

### Overrides

Users can override automatic chart selection via `ChartTypeOverrides`:
- Per-field chart type preferences
- Stored in visualization state
- Applied during chart generation

## Layout System

### PlotResult Interface

**Location**: `frontend/src/observable-plot-generator/types.ts`

```typescript
export interface PlotResult {
  library: 'observable-plot';
  
  /**
   * @deprecated Legacy single chart format - use plots array instead
   * Kept for backward compatibility only
   */
  options?: Plot.PlotOptions;
  
  /**
   * Array of plots with their positions in a grid layout.
   * Even single charts are represented as a 1x1 grid for consistency.
   */
  plots: Array<{
    id: string;                    // Unique identifier for the plot
    title: string;                 // Display title
    options: Plot.PlotOptions;     // Observable Plot options
    position: { row: number; col: number; };  // 0-indexed position
  }>;
  
  sharedDomains?: {
    x?: any;                       // Shared X domain
    y?: any;                       // Shared Y domain
    byMeasure?: Record<string, [number, number]>;  // Per-measure domains
  };
  
  layout: {
    type: 'grid' | 'vertical' | 'horizontal';  // 'single' is deprecated
    columns: number;               // Number of columns
    rows: number;                  // Number of rows
    columnSizes: Array<number | 'fr'>;  // px or flexible units
    rowSizes: Array<number | 'fr'>;     // px or flexible units
  };
  
  // Facet labels for hierarchical headers (optional)
  facetLabels?: {
    rowsLevels?: Array<{ fieldLabel: string; values: any[] }>;
    colsLevels?: Array<{ fieldLabel: string; values: any[] }>;
    groupSpan?: { columnsPerFacet: number; rowsPerFacet: number };
    spans?: { 
      columns: number[]; 
      rows: number[]; 
      baseCols: number; 
      baseRows: number; 
    };
  };
}
```

### ChartGenerationContext Interface

Context object passed through the generation pipeline:

```typescript
export interface ChartGenerationContext {
  xFields: Field[];              // Fields on X-axis
  yFields: Field[];              // Fields on Y-axis
  colorField?: Field;            // Color encoding field
  colorScheme?: string;          // Color scheme name
  colorBias?: number;            // Color bias adjustment
  manualColor?: string;          // Manual color override
  sizeField?: Field;             // Size encoding field
  sizeRange?: [number, number];  // Size range
  manualSize?: number;           // Manual size override
  facetField?: Field;            // Faceting field (legacy)
  categoryAxisDescriptor?: {     // Category axis configuration
    axis: 'x' | 'y';
    columnName: string;
    domain?: any[];
  };
  queryResult: QueryResult;      // Data rows and columns
  
  // Label configuration
  labelFields?: Field[];
  labelsEnabled?: boolean;
  labelSamplingStrategy?: 'auto' | 'all' | 'sample';
  labelSamplingThreshold?: number;
  labelSampleEvery?: number;
  
  // Tooltip configuration
  tooltipFields?: Field[];
  
  // Field overrides (per-field chart type preferences)
  fieldOverrides?: Record<string, FieldOverrideState>;
  fieldOverrideTargets?: FieldOverrideTarget[];
  
  // Shared domains (for faceting)
  sharedDomainsOverride?: {
    measure?: Record<string, [number, number]>;
    numeric?: Record<string, [number, number] | [Date, Date]>;
  };
}
```

### CSS Grid Implementation

The `MultiPlotGrid` component implements a three-layer scrolling architecture:

#### Layer 1: Top Facet Headers (Fixed)
- **Position**: Sticky at top
- **Content**: Column facet labels (`TopFacetLabels` component)
- **Scrolling**: Synchronized horizontal scroll with plot area
- **Visibility**: Only shown when column facets exist

#### Layer 2: Y-Axes Area (Fixed)
- **Position**: Sticky on left
- **Content**: Y-axis labels and ticks
- **Scrolling**: Synchronized vertical scroll with plot area
- **Sub-components**: 
  - Y-axis (top and bottom if applicable)
  - Left facet labels (row headers)

#### Layer 3: Main Scrollable Plot Grid
- **Position**: Main content area
- **Content**: Chart plots in CSS Grid
- **Scrolling**: Both horizontal and vertical
- **CSS Grid Properties**:
  ```css
  display: grid;
  grid-template-columns: from layout.columnSizes
  grid-template-rows: from layout.rowSizes
  ```
- **Sub-areas**:
  - Left facet labels (if row facets exist)
  - Plot area with individual charts
  - X-axes (bottom)

### Grid Sizing Strategy

```typescript
// Column sizes
columnSizes: Array<number | 'fr'>

// Examples:
[300, 400, 'fr']  // First column 300px, second 400px, third flexible
['fr', 'fr', 'fr'] // All columns equal flexible width
[200, 'fr']        // First column 200px, second fills remaining space
```

**Sizing Rules**:
- **Bar charts**: Use intrinsic pixel width (`barStep × categoryCount`)
- **Other charts**: Use `'fr'` for flexible sizing
- **Minimum size**: `minmax()` enforces readable minimum dimensions
- **Responsive**: Container handles overflow with scrolling

### Scroll Synchronization

The `useScrollSync` hook manages synchronized scrolling:

```typescript
// Horizontal scroll: hScrollRef ↔ plotsTranslateRef
// Vertical scroll: vScrollRef ↔ plotsTranslateRef

// Implementation uses requestAnimationFrame for smooth updates
```

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

### Measure Domains

**Location**: `frontend/src/observable-plot-generator/domains/measureDomains.ts`

```typescript
computeSharedMeasureDomains(
  data: any[],
  xCandidates: Field[],
  yCandidates: Field[],
  colorField?: Field
): Record<string, [number, number]>
```

**Features**:
- **Per-measure domains**: Each measure gets its own shared `[min, max]`
- **Zero inclusion**: Domains include 0 for meaningful bar chart baselines
- **Headroom padding**: 10% additional space for visual clarity
- **Negative handling**: Proper domain calculation for negative-only datasets
- **Stacked bar support**: Computes total heights for stacked configurations

### Faceting Domains

**Location**: `frontend/src/observable-plot-generator/faceting/facetDomains.ts`

```typescript
computeSharedDomainsForFaceting(
  data: any[],
  xFields: Field[],
  yFields: Field[],
  colorField?: Field,
  categoryField?: Field,
  facetFields?: Field[]
): SharedDomains
```

**Features**:
- **Cross-facet consistency**: All facets share the same domains
- **Categorical domains**: Ensures all categories appear in all facets
- **Per-facet aggregation**: Measures aggregated within each facet to avoid inflation
- **Color domains**: Shared color scales across all facets

### Domain Override

For faceted charts, domains are computed once and passed down:

```typescript
context.sharedDomainsOverride = {
  measure: sharedMeasureDomains,
  numeric: sharedNumericDomains
};
```

This ensures all facet cells use identical scales for meaningful comparison.

## Chart Features

### Color Encoding

**Location**: `frontend/src/observable-plot-generator/utils/colorSchemeUtils.ts`

- **Field-based coloring**: Map discrete/continuous fields to color scales
- **Color schemes**: Support for Observable Plot color schemes (categorical and continuous)
- **Color bias**: Adjust color distribution for better visibility
- **Manual override**: Single color override for all marks

### Size Encoding

**Location**: `frontend/src/observable-plot-generator/utils/sizeUtils.ts`

- **Field-based sizing**: Map values to marker sizes
- **Size range**: Configurable min/max size bounds
- **Manual override**: Fixed size for all marks

### Labels

**Location**: `frontend/src/observable-plot-generator/utils/labelUtils.ts`

- **Label fields**: Display multiple fields as labels on points/bars
- **Sampling strategies**:
  - `auto`: Automatic threshold-based sampling
  - `all`: Show all labels (may be crowded)
  - `sample`: Sample every N labels
- **Threshold-based**: Only enable labels when point count is reasonable

### Tooltips

**Location**: `frontend/src/observable-plot-generator/utils/tooltipUtils.ts`

- **Custom tooltip fields**: User-selected fields for tooltip display
- **Formatted output**: Proper formatting for numbers, dates, etc.
- **Interactive**: Hover to reveal additional data

### Field Overrides

**Location**: `frontend/src/observable-plot-generator/utils/fieldOverrides.ts`

- **Per-field preferences**: Override chart type for specific fields
- **Persistent**: Stored in visualization state
- **UI control**: Exposed via chart controls panel

## CSS Integration

### Observable Plot Specific Styles

**Location**: `frontend/src/components/Visualization/ChartGrid/ChartGrid.module.css`

```css
.observablePlotContainer {
  align-items: stretch;
  display: flex;
  flex-direction: column;
}

.observablePlotContainer > div {
  width: 100%;
  height: 100%;
}
```

### Rendering Flow

1. **Generation**: `observablePlotGenerator.ts` creates `PlotResult`
2. **Component**: `ChartGrid.tsx` receives spec and data
3. **Layout**: `MultiPlotGrid.tsx` applies three-layer architecture
4. **Plots**: `PlotArea.tsx` renders individual `ObservablePlot` components
5. **Wrapper**: `ObservablePlot.tsx` creates SVG from Plot.plot() options

## Edge Cases and Error Handling

### Data Quality Issues
- **Empty datasets**: Display centered "No data available" message
- **Non-numeric values**: Type coercion and null handling in domain calculations
- **Missing fields**: Graceful degradation to simpler chart types
- **All null values**: Proper domain handling with fallback ranges

### Field Configuration Issues
- **No fields selected**: Display instructional message
- **Type mismatches**: Automatic field classification adjustment
- **Incompatible combinations**: Fallback to most appropriate chart type

### Rendering Issues
- **Large facet counts**: Performance warnings and progressive rendering
- **Extreme aspect ratios**: Minimum size enforcement via `minmax()`
- **Overflow content**: Scrolling containers handle excess content
- **Re-render optimization**: React.memo and stable references prevent unnecessary re-renders

## Performance Considerations

### Data Volume
- **Large datasets**: Query-level optimizations (sampling, aggregation) handled by backend
- **Result size limits**: Frontend handles up to ~50K rows efficiently
- **Progressive rendering**: Charts render incrementally for better UX

### Facet Counts
- **Reasonable limits**: System handles hundreds of facets
- **Memory management**: Each facet is a separate Plot instance
- **Rendering coordination**: `useRenderingCoordinator` tracks completion
- **Future**: Virtualization planned for very large facet counts (100+)

### Layout Performance
- **Memoization**: Components use React.memo to prevent unnecessary re-renders
- **Stabilization**: `useStabilization` hook prevents layout thrashing
- **Scroll sync**: RequestAnimationFrame for smooth synchronized scrolling
- **Resize handling**: Debounced resize observers for efficient updates

### Domain Calculation
- **Single pass**: Shared domains computed once for all charts
- **Caching**: Domains cached and reused across facets
- **Efficient aggregation**: Optimized algorithms for measure domain calculation

## Key Implementation Files

### Core Generation
- **`observablePlotGenerator.ts`**: Main entry point, orchestrates chart generation
- **`types.ts`**: TypeScript interfaces (PlotResult, ChartGenerationContext)

### Analysis & Rules
- **`analysis/fieldAnalysis.ts`**: Field classification and analysis
- **`rules/chartRules.ts`**: Rule-based chart type selection logic
- **`helpers/chartTypeResolver.ts`**: Resolves chart types for field pairs

### Chart Types
- **`chartTypes/barUnified.ts`**: Unified bar chart implementation (single + multi-measure)
- **`chartTypes/barCore.ts`**: Core bar chart utilities and options builder
- **`chartTypes/lineChart.ts`**: Line chart (horizontal and vertical)
- **`chartTypes/scatterChart.ts`**: Scatter plot implementation
- **`chartTypes/tickStrip.ts`**: Distribution tick strip charts
- **`chartTypes/cellCharts.ts`**: Individual grid cell chart generation

### Faceting System
- **`faceting/facetPlanner.ts`**: Determines faceting strategy
- **`faceting/facetCoordinator.ts`**: Orchestrates faceted grid generation (chart-agnostic)
- **`faceting/facetGenerator.ts`**: Generates faceted charts
- **`faceting/facetDomains.ts`**: Computes shared domains for facets
- **`faceting/facetGrid.ts`**: Grid layout calculations for facets
- **`faceting/facetUtils.ts`**: Faceting utility functions

### Domains
- **`domains/measureDomains.ts`**: Shared measure domain computation
- **`domains/numericDomains.ts`**: Numeric and categorical domain handling

### Grid Generation
- **`grid/coreGridGenerator.ts`**: Cartesian N×M grid generation

### Utilities
- **`utils/colorSchemeUtils.ts`**: Color scale configuration
- **`utils/fieldOverrides.ts`**: Per-field chart type overrides
- **`utils/labelUtils.ts`**: Label sampling and display logic
- **`utils/sizeUtils.ts`**: Size encoding utilities
- **`utils/tooltipUtils.ts`**: Tooltip configuration

### React Components
- **`components/Visualization/ChartGrid/ChartGrid.tsx`**: Main chart grid renderer
- **`components/Visualization/ChartGrid/MultiPlotGrid.tsx`**: Three-layer scrolling architecture
- **`components/Visualization/ChartGrid/PlotArea.tsx`**: Individual plot rendering
- **`components/Visualization/ChartGrid/FacetLabels.tsx`**: Facet header labels
- **`components/Visualization/ChartGrid/XAxes.tsx`**: X-axis rendering
- **`components/Visualization/ChartGrid/YAxes.tsx`**: Y-axis rendering
- **`components/Visualization/ObservablePlot.tsx`**: React wrapper for Observable Plot

## Related Documentation

- **[Faceting System](./faceting.md)**: Comprehensive faceting documentation
- **[Field Classification](./fields.md)**: Field type system and classification
- **[API Communication](./api.md)**: Backend API integration
- **[Observable Plot Generator README](../src/observable-plot-generator/README.md)**: Technical implementation details

## Future Development

### Planned Enhancements
- ✅ Programmatic API for flexible chart construction
- ✅ High-level abstractions for common chart types
- ✅ Faceting and small multiples support
- ✅ Shared domain computation for consistency
- ✅ Three-layer scrolling architecture
- 🔄 Custom interaction patterns (brushing, linking)
- 🔄 Enhanced tooltip customization
- 📋 Chart virtualization for very large facet grids (100+ facets)
- 📋 Advanced animation transitions between states
- 📋 Enhanced accessibility features (ARIA labels, keyboard navigation)
- 📋 Export to PNG/SVG functionality
- 📋 Interactive legend with filtering
- 📋 Zoom and pan controls for continuous axes