# Chart Generation Architecture

This directory contains the **Vega-Lite** chart generation system. It is completely separate from the Vega implementation.

## Directory Structure

```
spec-generator/           # VEGA-LITE implementation
├── specGeneratorV2.ts   # Main Vega-Lite spec generator
├── chartTypes/          # Vega-Lite chart strategies
│   ├── barChart.ts
│   ├── lineChart.ts
│   ├── scatterChart.ts
│   └── tickStripChart.ts
├── types.ts             # Vega-Lite specific types
└── *.ts                 # Supporting utilities

vega-spec-generator/     # VEGA implementation (separate)
├── vegaSpecGenerator.ts # Main Vega spec generator  
├── chartTypes/          # Vega chart strategies
│   └── barChart.ts
└── types.ts             # Vega specific types
```

## Key Principles

1. **Zero Cross-Dependencies**: Never import from `vega-spec-generator/` in this directory
2. **Vega-Lite Focus**: This implementation focuses on faceting, responsive sizing, and rich interactions
3. **Schema Identification**: All specs include `"$schema": "https://vega.github.io/schema/vega-lite/v5.json"`

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

Focus areas for Vega-Lite development:
- ✅ Faceting support (built-in)
- ✅ Responsive sizing with `"width": "container"`
- ✅ Rich interactions and tooltips
- 🔄 Advanced aggregations
- 🔄 Multi-layered charts
- 🔄 Geographic visualizations 