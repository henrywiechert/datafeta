# Chart Generation Architecture

This directory contains the chart generation system.

## Directory Structure

```
spec-generator/
├── specGeneratorV2.ts   # Main spec generator
├── chartTypes/          # Chart strategies
│   ├── barChart.ts
│   ├── lineChart.ts
│   ├── scatterChart.ts
│   └── tickStripChart.ts
├── types.ts             # Specific types
└── *.ts                 # Supporting utilities
```

## Key Principles

1. **Vega-Lite Focus**: This implementation focuses on faceting, responsive sizing, and rich interactions

## Chart Type Priority

1. **TickStripChart** - Continuous dimension only (no measures)  
2. **BarChart** - Discrete dimension + measure
3. **LineChart** - Continuous dimension + measure
4. **ScatterChart** - Continuous × continuous dimensions

## Usage

```typescript
import { generateVegaLiteSpec } from './specGeneratorV2';

const result = generateVegaLiteSpec({
  xFields: [...],
  yFields: [...],
  queryResult: data
});
```

## Future Development

Focus areas for development:
- ✅ Faceting support (built-in)
- ✅ Responsive sizing with `"width": "container"`
- ✅ Rich interactions and tooltips
- 🔄 Advanced aggregations
- 🔄 Multi-layered charts
- 🔄 Geographic visualizations 