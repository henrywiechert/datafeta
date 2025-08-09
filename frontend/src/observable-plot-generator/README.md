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