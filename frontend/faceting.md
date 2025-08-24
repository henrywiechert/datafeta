# Multi-Chart Faceting System

The faceting system enables sophisticated multi-dimensional data exploration by automatically generating multiple related charts based on field combinations and types.

## Faceting Overview

Faceting creates multiple charts to display different slices or combinations of data, enabling users to explore patterns across dimensions and measures. The system builds on top of basic chart types to create coordinated views.

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

### Faceting Manager
The `FacetingManager` component handles:

- **Dimension analysis**: Identifying discrete dimensions suitable for faceting
- **Layout calculation**: Determining grid dimensions and arrangements
- **Chart coordination**: Ensuring consistent scales and styling across facets
- **Responsive behavior**: Adapting layouts to screen size constraints

## Layout Strategies

### Grid-Based Layouts
- **CSS Grid implementation**: Flexible grid system for multi-chart arrangements
- **Responsive breakpoints**: Automatic adaptation to different screen sizes
- **Consistent spacing**: Uniform gaps and alignment across all charts

### Shared Domains
Critical for meaningful comparisons across faceted charts:

- **Synchronized scales**: Consistent axis ranges across related charts
- **Domain calculation**: Automatic computation of appropriate ranges
- **Zero baseline**: Inclusion of zero for meaningful measure comparisons

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

## Table View Integration

### Discrete-Only Scenarios
When only discrete dimensions are present (no measures or continuous dimensions):

#### Y-axis Only Layout
- **Format**: Vertical column display
- **Content**: Unique values listed vertically
- **Use case**: Simple category enumeration

#### X-axis Only Layout
- **Format**: Horizontal row display  
- **Content**: Unique values arranged horizontally
- **Use case**: Category comparison across horizontal space

#### Both Axes Layout
- **Format**: Grid table where X values become columns, Y values become rows
- **Content**: Cells show "Abc" indicator where value combinations exist
- **Use case**: Cross-tabulation and relationship mapping

#### Hierarchical Grouping
- **Multiple dimensions on same axis**: Creates hierarchical grouping structure
- **Leftmost dimension**: Becomes outer grouping level
- **Visual hierarchy**: Clear indication of grouping relationships

## Performance Considerations

### Large Facet Counts
- **Memory usage**: Efficient chart instance management
- **Rendering optimization**: Progressive loading for large facet grids
- **User experience**: Loading indicators and progressive disclosure

### Data Volume
- **Per-facet limits**: Reasonable data limits per individual chart
- **Aggregation strategies**: Smart pre-aggregation for large datasets
- **Sampling techniques**: Statistical sampling when appropriate

## Future Enhancements

### Planned Features
- **Interactive brushing**: Cross-chart selection and filtering
- **Dynamic faceting**: User-controlled facet dimension changes
- **Facet virtualization**: Efficient handling of very large facet counts
- **Custom facet layouts**: User-defined arrangement patterns
- **Facet legends**: Coordinated legend systems across charts
- **Animation transitions**: Smooth transitions between faceting states