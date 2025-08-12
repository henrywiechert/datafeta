# Observable Plot Generator

This directory contains a **simple, direct implementation** for generating charts using [Observable Plot](https://observablehq.com/plot/).

## Architecture

**Simple Direct Generation** - No complex pipelines or layers.

```
observablePlotGenerator.ts (main entry point)
├── analyzeFields() - Simple field analysis
├── generateChartOptions() - Direct chart type selection
└── chartTypes/
    └── barChart.ts - Individual chart implementations
```

## How It Works

1. **Analyze Fields** - Count measures vs dimensions, x vs y
2. **Select Chart Type** - Bar chart, line chart, etc. based on field types  
3. **Generate Plot** - Single `Plot.plot()` call with appropriate marks
4. **Return Result** - Simple PlotResult object

## Supported Charts

- ✅ **Bar Charts** - Vertical and horizontal bar charts
- 🚧 **Line Charts** - Coming soon
- 🚧 **Scatter Plots** - Coming soon

## Future Enhancements

- **Multi-Measure Support** - Multiple measures in same chart
- **Simple Faceting** - Basic fx/fy faceting for discrete dimensions
- **More Chart Types** - Line, scatter, area, etc.

## Benefits

- 🚀 **Simple** - ~100 lines instead of 1000+
- 🐛 **Easy to Debug** - Linear logic flow
- 🔧 **Easy to Extend** - Add chart types with simple functions
- 📖 **Maintainable** - Anyone can understand and modify


Rules:
- discrete measures or dimensions creates a table (AG Grid) - this currently works, no need to change for now.
- single continous measure on one axis -> bar chart with single bar in respective direction (X->horiz/Y->vert)
- 2 or more continous measures on same axis -> 2 or more bar charts with a single measure aligned horizontally for X-axis and stacked vertically when on Y-axis. Primary bar direction still follows the same rule as in previous point.
- single continous dimension -> tick-strip plot (vega terminology, don't know observable plot equivalent) in same direction as bar chart would be for a cont. measure
- multiple continous dimensions -> same strategy as for bar charts
- cont. measure on both axes -> scatter plot (single point only)
- cont. measure on one axis, cont. dimension on other axis -> line chart
- cont. dimension on both axes -> scatter plot
- above rules shall also apply, when multiple charts are generated due to multiple cont. measures and cont. dimensions on both axes. Every cont. measure or dimension on one axis is paired in a chart with any measure/dimension on the other axis. That means when we have 2 cont. dimensions on X-axis, and 2 others on Y-axis, we get 4 charts aligned as 2x2 grid.
