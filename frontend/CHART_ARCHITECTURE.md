# Chart Architecture - Vega, Vega-Lite, and Observable Plot

This document outlines the clean separation between Vega, Vega-Lite, and Observable Plot chart implementations to prevent cross-contamination during development.

## 🎯 Development Focus

**ACTIVE**: Vega-Lite (faceting, responsive charts, rich interactions)
**ACTIVE**: Observable Plot (programmatic API, high-level abstractions)
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
├── observable-plot-generator/ # 🔵 OBSERVABLE PLOT (Active Development)
│   ├── observablePlotGenerator.ts # Main plot generator
│   ├── chartTypes/          # Plot mark implementations
│   ├── types.ts             # PlotResult, etc.
│   └── README.md            # Observable Plot specific docs
│
├── vega-spec-generator/     # 🟡 VEGA (Paused)
│   ├── vegaSpecGenerator.ts # Main Vega spec generator
│   ├── chartTypes/          # BarChart (40px fixed thickness)
│   ├── types.ts             # VegaSpec, ChartContext, etc.
│   └── README.md            # Vega specific docs
│
└── components/Visualization/
    ├── ChartGrid.tsx        # Universal renderer (handles all three)
    ├── ObservablePlot.tsx   # React wrapper for Observable Plot
    └── ChartGrid.module.css # Separated CSS (.vegaContainer, .vegaLiteContainer, .observablePlotContainer)
```

## 🔄 Chart Generation Pipeline

### Selection
```typescript
// VisualizationContext.tsx
const [chartingLibrary, setChartingLibrary] = useState<'vega-lite' | 'vega' | 'observable-plot'>('vega-lite');
```

### Generation
```typescript
// useChartGeneration.ts
if (chartingLibrary === 'observable-plot') {
  // 🔵 OBSERVABLE PLOT PATH: generatePlot()
  // Returns: { library: 'observable-plot', plot: HTMLElement }
} else if (chartingLibrary === 'vega') {
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
const isObservablePlot = spec?.library === 'observable-plot';
const isVegaLite = spec?.$schema?.includes('vega-lite');

if (isObservablePlot) {
  // 🔵 Programmatic rendering via a React wrapper
  return <ObservablePlot plot={spec.plot} />;
} else if (isVegaLite) {
  // 🟢 Responsive sizing, built-in faceting
  return <Vega spec={spec} data={{table: data}} />
} else {
  // 🟡 Fixed dimensions, custom signal updates
  return <Vega spec={spec} width={w} height={h} onNewView={handleView} />
}
```

## 🎨 CSS Separation

```css
/* Observable Plot: Responsive sizing */
.observablePlotContainer {
  align-items: stretch;
}
.observablePlotContainer > div {
  width: 100%;
  height: 100%;
}

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
- **Focus by directory**: Keep logic for each library within its designated generator directory.
- **Keep imports separate**: Never cross-reference between generator directories.
- **Use type detection**: `spec.library === 'observable-plot'` or `spec.$schema.includes('vega-lite')`.
- **Type safety**: Use type guards and casting to handle the different return types from generators.

### DON'T ❌
- **Mix implementations**: Don't import Vega logic in Vega-Lite files, or vice-versa.
- **Share chart strategies**: Each has its own `chartTypes/` directory.
- **Cross-reference types**: Keep `types.ts` files separate for each generator.
- **Override the others**: Changes in one implementation shouldn't break the others.

## 🔍 Detection Points

The system detects chart type at these key points:

1. **Generation**: `chartingLibrary` state variable in the context.
2. **Rendering**: `spec.library` or `spec.$schema` properties in `ChartGrid.tsx`.
3. **CSS**: Applied class based on chart type (`.observablePlotContainer`, `.vegaLiteContainer`, `.vegaContainer`).
4. **Interactions**: Vega uses `onNewView`, Vega-Lite doesn't, and Observable Plot is handled within its own component.

## 🚀 Future Development

### Observable Plot Focus Areas
- ✅ Programmatic API for flexible chart construction
- ✅ High-level abstractions for common chart types
- 🔄 Custom interaction and tooltip handling
- 🔄 Advanced faceting and small multiples

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

1. **Import test**: No imports between `spec-generator/`, `vega-spec-generator/`, and `observable-plot-generator/`.
2. **Type test**: Ensure specs/results from each generator are unique and handled correctly.
3. **CSS test**: Charts apply correct container classes.
4. **Rendering test**: All three chart types render without interference.

This architecture ensures that advancing any single charting library won't break the existing implementations. 