# Multi-Chart Faceting System

The faceting system enables sophisticated multi-dimensional data exploration by automatically generating multiple related charts based on field combinations and types.

**Last Updated**: November 30, 2025

## Faceting Overview

Faceting creates multiple charts to display different slices or combinations of data, enabling users to explore patterns across dimensions and measures. The system uses a **coordinator pattern** where chart-type-agnostic orchestration is separated from chart-type-specific rendering logic.

### Architecture Components

- **Facet Planner** (`facetPlanner.ts`): Analyzes fields to determine which discrete dimensions should become facets
- **Facet Coordinator** (`facetCoordinator.ts`): Chart-type-agnostic orchestration of facet grid generation
- **Cell Generator**: Strategy pattern for chart-type-specific rendering of individual facet cells
- **Facet Domains** (`facetDomains.ts`): Computes shared domains across all facets for consistent scales
- **Facet Grid** (`facetGrid.ts`): Layout calculations and facet label generation
- **Facet Utils** (`facetUtils.ts`): Utility functions for facet combinations and data filtering

## Faceting Triggers

### Discrete Dimension Faceting
Faceting is primarily triggered by **discrete dimensions** positioned on chart axes:

- **First discrete dimension**: Determines the primary category for basic charts (e.g., bar chart categories)
- **Additional discrete dimensions**: Define hierarchical faceting structures
- **Axis positioning**: Determines faceting direction and layout

### Directional Faceting Rules

#### Horizontal Faceting (X-axis discrete dimensions)
- **Trigger**: Discrete dimensions placed on the X-axis
- **Layout**: Charts arranged horizontally in a row
- **Use case**: Comparing categories across different groupings

#### Vertical Faceting (Y-axis discrete dimensions)  
- **Trigger**: Discrete dimensions placed on the Y-axis
- **Layout**: Charts arranged vertically in a column
- **Use case**: Stacking related metrics or categories

#### Matrix Faceting (Both axes)
- **Trigger**: Discrete dimensions on both X and Y axes
- **Layout**: 2-dimensional grid matrix
- **Use case**: Cross-tabulation of two categorical variables

## Multi-Measure Faceting

### Same-Axis Multiple Measures
When multiple measures are placed on the same axis:

- **X-axis measures**: Create horizontal arrangement of charts
- **Y-axis measures**: Create vertical stacking of charts
- **Chart type consistency**: All charts use the same base type
- **Faceting interaction**: Discrete dimension faceting applies on top of measure-based layouts

### Example Scenarios

#### Multiple Measures + Discrete Dimensions
```
Measures: [Revenue, Profit] (Y-axis)
Dimensions: [Region] (discrete, X-axis)

Result: 
- 2 charts stacked vertically (Revenue chart, Profit chart)
- Each chart faceted horizontally by Region
- Final layout: 2×N grid (2 measures × N regions)
```

## Hierarchical Faceting

### Multiple Discrete Dimensions
When multiple discrete dimensions exist on the same axis:

- **Leftmost dimension**: Becomes the outer grouping level
- **Subsequent dimensions**: Create nested grouping hierarchies
- **Layout preservation**: Maintains readability through structured grouping

### Grouping Behavior
- **Outer grouping**: Primary categorical separation
- **Inner grouping**: Sub-categorical detail within outer groups
- **Visual hierarchy**: Clear visual separation between grouping levels

## Faceting Implementation

### Field Classification Integration
The faceting system works closely with field classification:

```typescript
// Field types that trigger faceting
type FacetingField = {
  type: 'dimension';
  flavour: 'discrete';
  // Other field properties
};
```

### Facet Planning
The `planFacets` function determines which discrete dimensions should become facets:

```typescript
export interface FacetPlan {
  rowFacetFields: Field[];
  colFacetFields: Field[];
}

// Simple rule: X discrete → column facets, Y discrete → row facets
// Chart generators can adjust by reserving fields for category encoding
```

### Facet Coordinator (Chart-Type-Agnostic)
The `coordinateFacetedGrid` function handles mechanical aspects:

- **Facet combinations**: Computing all row/column facet combinations
- **Shared domains**: Computing consistent scales across all facets
- **Data filtering**: Filtering data for each facet cell
- **Grid assembly**: Arranging plots in the final grid layout
- **Strategy delegation**: Delegates chart-specific rendering to cell generators

### Cell Generator (Strategy Pattern)
Chart-type-specific logic is encapsulated in cell generators:

```typescript
type CellGenerator = (
  cellData: any[],
  cellContext: ChartGenerationContext,
  sharedDomains: SharedDomains,
  facetPosition: { row: number; col: number }
) => CellResult;

// Different chart types provide their own generators:
// - Bar charts: generates bar plots with category encoding
// - Line charts: generates line plots with series
// - Scatter plots: generates scatter plots with points
```

## Layout Strategies

### Grid-Based Layouts
- **CSS Grid implementation**: Flexible grid system for multi-chart arrangements (`MultiPlotGrid` component)
- **Three-layer scrolling architecture**: Separate layers for facet labels, axes, and plot area
- **Dynamic sizing**: Mix of fixed pixel sizes and flexible 'fr' units
- **Consistent spacing**: Uniform gaps and alignment across all charts

### Grid Layout Computation
```typescript
export interface GridLayout {
  type: 'grid';
  columns: number;  // baseCols × numColFacets
  rows: number;     // baseRows × numRowFacets
  columnSizes: Array<number | 'fr'>;
  rowSizes: Array<number | 'fr'>;
}
```

### Facet Labels
Hierarchical facet labels with proper span calculations:

```typescript
export interface FacetLabels {
  rowsLevels?: Array<{ fieldLabel: string; values: any[] }>;
  colsLevels?: Array<{ fieldLabel: string; values: any[] }>;
  groupSpan: { columnsPerFacet: number; rowsPerFacet: number };
  spans: { baseCols: number; baseRows: number; columns: number[]; rows: number[] };
}
```

### Shared Domains
Critical for meaningful comparisons across faceted charts:

- **Synchronized scales**: Consistent axis ranges across all facets (computed in `facetDomains.ts`)
- **Domain types**: Supports numeric, temporal, and categorical domains
- **Per-measure domains**: Each measure gets its own shared domain
- **Color domains**: Shared color scales across facets
- **Zero baseline**: Automatic inclusion of zero for measures when appropriate

## Faceting with Different Chart Types

### Bar Charts
- **Category faceting**: Each discrete dimension value gets its own chart
- **Measure comparison**: Multiple measures create separate bar charts
- **Direction consistency**: All bars maintain the same orientation

### Line Charts
- **Series faceting**: Different discrete values become separate line series
- **Time-based faceting**: Temporal dimensions create time-series facets
- **Trend comparison**: Multiple facets enable trend analysis across categories

### Scatter Plots
- **Point cloud faceting**: Separate scatter plots for each discrete category
- **Correlation analysis**: Compare relationships across different subgroups
- **Multi-dimensional exploration**: Reveal patterns in different data slices

### Tick Strips
- **Distribution faceting**: Show value distributions across categories
- **Comparative analysis**: Side-by-side distribution comparisons
- **Dense data visualization**: Efficient space usage for many categories

## Rendering Architecture

### MultiPlotGrid Component
The `MultiPlotGrid` component implements a three-layer scrolling architecture:

#### Layer 1: Top Facet Headers
- **Position**: Fixed at top
- **Content**: Column facet labels (if present)
- **Behavior**: Sticky horizontal scroll synchronization

#### Layer 2: Y-Axes Area
- **Position**: Fixed on left
- **Content**: Y-axis labels and ticks
- **Behavior**: Sticky vertical scroll synchronization

#### Layer 3: Scrollable Plot Grid
- **Position**: Main scrollable area
- **Content**: Actual chart plots in CSS Grid
- **Sub-layers**:
  - Left facet labels (row headers)
  - Plot area (charts)
  - X-axes (bottom)

### FacetLabels Components
- **TopFacetLabels**: Renders column facet headers with hierarchical levels
- **LeftFacetLabels**: Renders row facet headers with hierarchical levels
- **Span calculations**: Proper colspan/rowspan for multi-level facets

### Discrete-Only Scenarios
When only discrete dimensions are present (no measures or continuous dimensions):

**Note**: The current implementation focuses on measure-based visualizations. Discrete-only scenarios (pure categorical cross-tabulation) may use simplified representations or alternative chart types like scatter plots with categorical axes.

#### Hierarchical Grouping
- **Multiple dimensions on same axis**: Creates hierarchical grouping structure
- **Leftmost dimension**: Becomes outer grouping level
- **Nested facets**: Inner dimensions create sub-facets within outer facets
- **Visual hierarchy**: Clear indication of grouping relationships through facet labels

## Performance Considerations

### Large Facet Counts
- **Memory usage**: Each facet creates a separate Observable Plot instance
- **Rendering coordination**: `useRenderingCoordinator` hook tracks when all plots complete
- **Progressive rendering**: Charts render incrementally as data becomes available
- **User experience**: Loading indicators during facet generation

### Data Volume
- **Per-facet filtering**: Each facet receives only its filtered subset of data
- **Shared domain computation**: Single pass through full dataset for domain calculation
- **Aggregation strategies**: Pre-aggregated queries from backend reduce client-side processing
- **Sampling techniques**: Backend optimization hints support sampling for large datasets

### Layout Optimization
- **Memoization**: FacetLabels components use React.memo to prevent unnecessary re-renders
- **Stabilization**: `useStabilization` hook prevents layout thrashing during resize
- **Scroll sync**: Efficient scroll synchronization using requestAnimationFrame
- **Cell size caching**: User-defined cell sizes cached in localStorage

## Implementation Details

### Key Files
- `frontend/src/observable-plot-generator/faceting/facetPlanner.ts`: Facet planning logic
- `frontend/src/observable-plot-generator/faceting/facetCoordinator.ts`: Main orchestration
- `frontend/src/observable-plot-generator/faceting/facetDomains.ts`: Shared domain computation
- `frontend/src/observable-plot-generator/faceting/facetGrid.ts`: Layout calculations
- `frontend/src/observable-plot-generator/faceting/facetUtils.ts`: Utility functions
- `frontend/src/components/Visualization/ChartGrid/MultiPlotGrid.tsx`: React rendering
- `frontend/src/components/Visualization/ChartGrid/FacetLabels.tsx`: Facet label components

### Data Flow
```
1. Field Analysis → Determine discrete dimensions
2. Facet Planning → Create FacetPlan (row/col facet fields)
3. Compute Combinations → All row × col facet value combinations
4. Compute Shared Domains → Consistent scales across all facets
5. Generate Sample Cell → Determine base layout dimensions
6. Loop Through Facets → Filter data and generate each cell
7. Assemble Grid → Combine all plots with layout configuration
8. Render → MultiPlotGrid component displays the result
```

## Future Enhancements

### Planned Features
- **Interactive brushing**: Cross-chart selection and filtering
- **Dynamic faceting**: User-controlled facet dimension changes
- **Facet virtualization**: Efficient handling of very large facet counts (100+ facets)
- **Custom facet layouts**: User-defined arrangement patterns and ordering
- **Facet legends**: Coordinated legend systems shared across charts
- **Animation transitions**: Smooth transitions between faceting states
- **Facet search/filter**: Find specific facets in large grids
- **Facet collapse/expand**: Hierarchical collapsible facet groups