# Code Flow Diagram for Bar Chart Implementations

## Main Entry Point: generatePlot()

```
generatePlot(context)
│
├─ Single Chart Flow (uses barChart.ts)
│  │
│  └─ genChartOptionsRule(analysis, context)
│     └─ generateChartOptions() in chartRules.ts
│        └─ barChart(context) ← FROM barChart.ts
│           └─ Returns complete Plot.PlotOptions
│
├─ Grid Chart Flow (uses cellCharts.ts)
│  │
│  └─ generateCartesianGrid(context, analysis, xCandidates, yCandidates)
│     └─ generateCartesianPlots()
│        └─ generatePairChartOptions(data, xField, yField, domains)
│           ├─ createBarX() ← FROM cellCharts.ts
│           └─ createBarY() ← FROM cellCharts.ts
│
└─ Multi-Measure Flow
   └─ multiMeasureBarChart(context)
      └─ Uses its own bar chart logic
```

## Decision Points

### When barChart.ts is used:
```javascript
// From chartRules.ts - conditions that trigger barChart()
if (analysis.hasXMeasure && !analysis.hasYMeasure && yDims.length === 0) {
  return barChart(context); // Single X measure, no Y fields
}

if (analysis.hasYMeasure && !analysis.hasXMeasure && xDims.length === 0) {
  return barChart(context); // Single Y measure, no X fields
}

if (yDiscreteDims.length > 0 || yDims.length > 0) {
  return barChart(context); // X measure with Y dimensions
}

if (xDiscreteDims.length > 0 || xDims.length > 0) {
  return barChart(context); // Y measure with X dimensions
}
```

### When cellCharts.ts is used:
```javascript
// From generatePlot() - conditions that trigger grid generation
const xCandidates = [...analysis.xMeasures, ...analysis.xDimensions];
const yCandidates = [...analysis.yMeasures, ...analysis.yDimensions];

if (xCandidates.length > 0 && yCandidates.length > 0) {
  return generateCartesianGrid(); // Multiple fields → grid → cellCharts
}
```

## Visual Representation

```
INPUT SCENARIO → FLOW PATH → IMPLEMENTATION USED

┌─────────────────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│ Single measure + dimension  │ ──→│ Single Chart     │ ──→│ barChart.ts     │
│ (e.g., Sales by Category)   │    │ Flow             │    │ barChart()      │
└─────────────────────────────┘    └──────────────────┘    └─────────────────┘

┌─────────────────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│ Multiple measures/dims      │ ──→│ Grid Chart       │ ──→│ cellCharts.ts   │
│ (e.g., Sales & Profit by    │    │ Flow             │    │ createBarX/Y()  │
│ Category & Region)          │    │                  │    │                 │
└─────────────────────────────┘    └──────────────────┘    └─────────────────┘

┌─────────────────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│ Multiple measures same axis │ ──→│ Multi-Measure    │ ──→│ multiMeasure-   │
│ (e.g., Sales, Profit, Cost  │    │ Flow             │    │ BarChart.ts     │
│ all on Y axis)              │    │                  │    │                 │
└─────────────────────────────┘    └──────────────────┘    └─────────────────┘
```

## Concrete Examples

### Example 1: Uses barChart.ts
```javascript
context = {
  xFields: [{ type: 'dimension', columnName: 'category' }],
  yFields: [{ type: 'measure', columnName: 'sales' }],
  // ... other context
}
// Result: Single bar chart showing sales by category
```

### Example 2: Uses cellCharts.ts  
```javascript
context = {
  xFields: [
    { type: 'measure', columnName: 'sales' },
    { type: 'measure', columnName: 'profit' }
  ],
  yFields: [
    { type: 'dimension', columnName: 'category' },
    { type: 'dimension', columnName: 'region' }
  ]
  // ... other context
}
// Result: 2x2 grid with each cell using createBarX/createBarY
```

This clearly shows that both implementations serve essential but different roles in the architecture.