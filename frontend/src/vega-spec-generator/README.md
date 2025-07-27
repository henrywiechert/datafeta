# Vega Chart Generation (Legacy/Experimental)

This directory contains the **Vega** (low-level) chart generation system. Development is currently **paused** in favor of Vega-Lite.

## Directory Structure

```
vega-spec-generator/     # VEGA implementation
├── vegaSpecGenerator.ts # Main Vega spec generator
├── chartTypes/          # Vega chart strategies
│   └── barChart.ts      # Fixed-thickness bar charts
└── types.ts             # Vega specific types
```

## Key Principles

1. **Zero Cross-Dependencies**: Never import from `spec-generator/` (Vega-Lite) in this directory
2. **Low-Level Control**: Direct manipulation of scales, marks, and signals
3. **Schema Identification**: All specs include `"$schema": "https://vega.github.io/schema/vega/v5.json"`
4. **Fixed Dimensions**: Charts use calculated fixed dimensions rather than responsive sizing

## Current Features

- ✅ **BarChart**: Fixed 40px bar thickness with hybrid sizing (responsive primary axis, fixed categorical axis)
- ✅ **Direct Vega Signals**: Dynamic width/height updates via `view.signal()`
- ✅ **Custom Positioning**: Precise pixel-based bar positioning

## Development Status

🚧 **PAUSED**: Development focus has shifted to Vega-Lite for better faceting support.

### Why Paused?
- Vega-Lite has built-in faceting (`column`, `row` encoding)
- Complex faceting in raw Vega requires significant custom logic
- Vega-Lite provides better developer experience for most use cases

### When to Use Vega
- Need precise pixel-level control
- Custom interactions not available in Vega-Lite
- Performance-critical visualizations
- Experimental chart types not supported by Vega-Lite

## Usage

```typescript
import { vegaSpecGenerator } from './vegaSpecGenerator';

const spec = vegaSpecGenerator.generateSpec({
  xFields: [...],
  yFields: [...],
  queryResult: data
});
```

## Architecture Notes

The Vega implementation uses:
- **Fixed bar thickness**: Always 40px regardless of chart size
- **Hybrid responsive sizing**: Primary axis responsive, categorical axis fixed
- **Direct signal manipulation**: Updates charts without re-mounting
- **Custom CSS classes**: `.vegaContainer` for natural sizing with scrolling 