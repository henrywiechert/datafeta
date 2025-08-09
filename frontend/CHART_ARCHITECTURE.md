# Chart Architecture - Observable Plot

This document outlines the chart implementation using Observable Plot.

## 🎯 Development Focus

**ACTIVE**: Observable Plot (programmatic API, high-level abstractions)

## 📁 Directory Structure

```
frontend/src/
├── observable-plot-generator/ # 🔵 OBSERVABLE PLOT (Active Development)
│   ├── observablePlotGenerator.ts # Main plot generator
│   ├── chartTypes/          # Plot mark implementations
│   ├── types.ts             # PlotResult, etc.
│   └── README.md            # Observable Plot specific docs
│
└── components/Visualization/
    ├── ChartGrid.tsx        # Universal renderer
    ├── ObservablePlot.tsx   # React wrapper for Observable Plot
    └── ChartGrid.module.css # Separated CSS (.observablePlotContainer)
```

## 🔄 Chart Generation Pipeline

### Generation
```typescript
// useChartGeneration.ts
// 🔵 OBSERVABLE PLOT PATH: generatePlot()
// Returns: { library: 'observable-plot', plot: HTMLElement }
```

### Rendering
```typescript
// ChartGrid.tsx
const isObservablePlot = spec?.library === 'observable-plot';

if (isObservablePlot) {
  // 🔵 Programmatic rendering via a React wrapper
  return <ObservablePlot plot={spec.plot} />;
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
```

## 🚧 Key Separation Rules

### DO ✅
- **Focus by directory**: Keep logic for each library within its designated generator directory.
- **Keep imports separate**: Never cross-reference between generator directories.
- **Use type detection**: `spec.library === 'observable-plot'`.
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
3. **CSS**: Applied class based on chart type (`.observablePlotContainer`).
4. **Interactions**: Observable Plot is handled within its own component.

## 🚀 Future Development

### Observable Plot Focus Areas
- ✅ Programmatic API for flexible chart construction
- ✅ High-level abstractions for common chart types
- 🔄 Custom interaction and tooltip handling
- 🔄 Advanced faceting and small multiples

This architecture ensures that advancing any single charting library won't break the existing implementations.
 