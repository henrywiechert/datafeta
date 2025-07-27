# Chart Architecture - Vega vs Vega-Lite Separation

This document outlines the clean separation between Vega and Vega-Lite chart implementations to prevent cross-contamination during development.

## 🎯 Development Focus

**ACTIVE**: Vega-Lite (faceting, responsive charts, rich interactions)  
**PAUSED**: Vega (custom low-level control, fixed bar thickness)

## 📁 Directory Structure

```
frontend/src/
├── spec-generator/           # 🟢 VEGA-LITE (Active Development)
│   ├── specGeneratorV2.ts   # Main Vega-Lite spec generator
│   ├── chartTypes/          # Bar, Line, Scatter, TickStrip
│   ├── types.ts             # VegaLiteSpec, ChartContext, etc.
│   └── README.md            # Vega-Lite specific docs
│
├── vega-spec-generator/     # 🟡 VEGA (Paused)
│   ├── vegaSpecGenerator.ts # Main Vega spec generator
│   ├── chartTypes/          # BarChart (40px fixed thickness)
│   ├── types.ts             # VegaSpec, ChartContext, etc.
│   └── README.md            # Vega specific docs
│
└── components/Visualization/
    ├── ChartGrid.tsx        # Universal renderer (handles both)
    └── ChartGrid.module.css # Separated CSS (.vegaContainer vs .vegaLiteContainer)
```

## 🔄 Chart Generation Pipeline

### Selection
```typescript
// VisualizationContext.tsx
const [chartingLibrary, setChartingLibrary] = useState<'vega-lite' | 'vega'>('vega-lite');
```

### Generation
```typescript
// useChartGeneration.ts
if (chartingLibrary === 'vega') {
  // 🟡 VEGA PATH: vegaSpecGenerator.generateSpec()
  // Returns: VegaSpec with "$schema": "vega/v5.json"
} else {
  // 🟢 VEGA-LITE PATH: generateVegaLiteSpec()  
  // Returns: VegaLiteSpec with "$schema": "vega-lite/v5.json"
}
```

### Rendering
```typescript
// ChartGrid.tsx
const isVegaLite = spec?.$schema?.includes('vega-lite');

if (isVegaLite) {
  // 🟢 Responsive sizing, built-in faceting
  return <Vega spec={spec} data={{table: data}} />
} else {
  // 🟡 Fixed dimensions, custom signal updates
  return <Vega spec={spec} width={w} height={h} onNewView={handleView} />
}
```

## 🎨 CSS Separation

```css
/* Vega-Lite: Responsive sizing */
.vegaLiteContainer {
  align-items: stretch; /* Fill container */
}
.vegaLiteContainer svg {
  max-width: 100%;
  max-height: 100%;
}

/* Vega: Natural sizing with scrolling */
.vegaContainer {
  align-items: flex-start; /* Allow expansion */
}
.vegaContainer svg {
  display: block; /* Natural dimensions */
}
```

## 🚧 Key Separation Rules

### DO ✅
- **Vega-Lite**: Focus on faceting, responsive design, user interactions
- **Keep imports separate**: Never cross-reference between directories
- **Use schema detection**: `spec.$schema.includes('vega-lite')`
- **Type safety**: Cast when necessary but preserve type boundaries

### DON'T ❌
- **Mix implementations**: Don't import Vega logic in Vega-Lite files
- **Share chart strategies**: Each has its own `chartTypes/` directory
- **Cross-reference types**: Keep `types.ts` files separate
- **Override the other**: Changes in one shouldn't break the other

## 🔍 Detection Points

The system detects chart type at these key points:

1. **Generation**: `chartingLibrary` state variable
2. **Rendering**: `spec.$schema.includes('vega-lite')`
3. **CSS**: Applied class based on chart type
4. **Interactions**: Vega uses `onNewView`, Vega-Lite doesn't

## 🚀 Future Development

### Vega-Lite Focus Areas
- ✅ Faceting (`column`, `row` encoding)
- ✅ Responsive sizing (`"width": "container"`)
- 🔄 Multi-layered visualizations
- 🔄 Geographic charts
- 🔄 Advanced interactions and selections

### Vega (If Resumed)
- ✅ Fixed 40px bar thickness
- ✅ Hybrid responsive sizing
- 🔄 Complex custom interactions
- 🔄 Performance-critical visualizations
- 🔄 Custom chart types not in Vega-Lite

## 🧪 Testing Separation

To verify clean separation:

1. **Import test**: No imports from `vega-spec-generator/` in `spec-generator/`
2. **Schema test**: All Vega specs have `vega/v5.json`, Vega-Lite has `vega-lite/v5.json`
3. **CSS test**: Charts apply correct container classes
4. **Rendering test**: Both chart types render without interference

This architecture ensures that advancing Vega-Lite development won't break the existing Vega implementation, and vice versa. 