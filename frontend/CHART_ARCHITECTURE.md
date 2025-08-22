# Chart Architecture - Observable Plot

This document outlines the chart implementation using Observable Plot.

## 🎯 Development Focus

**ACTIVE**: Observable Plot (programmatic API, high-level abstractions)

## 📁 Directory Structure

```
frontend/src/
├── observable-plot-generator/ # 🔵 OBSERVABLE PLOT (Active Development)
│   ├── observablePlotGenerator.ts    # Main plot generator
│   ├── chartTypes/                   # Plot mark implementations
│   ├── analysis/ domains/ grid/ ...  # Helpers and planners
│   ├── types.ts                      # PlotResult, ChartGenerationContext
│   └── README.md                     # Observable Plot specific docs
│
└── components/Visualization/
    ├── ChartGrid/ChartGrid.tsx       # Renderer for single/multi plots + axes/labels
    ├── ObservablePlot.tsx            # React wrapper for Observable Plot
    └── ChartGrid/ChartGrid.module.css
```

## 🔄 Chart Generation Pipeline

### Generation
```typescript
// useChartGeneration.ts
// 🔵 OBSERVABLE PLOT PATH: generatePlot()
// Returns: PlotResult (single via options, or multi via plots+layout)
```

### Rendering
```typescript
// ChartGrid.tsx
// Detects Observable Plot by presence of PlotResult fields
if (spec?.plots?.length) {
  // multi-plot grid path
} else if (spec?.options) {
  // single plot path
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
- **Use type detection**: Render via `ChartGrid` using the `PlotResult` shape.
- **Type safety**: Use type guards and explicit `PlotResult` fields.

### DON'T ❌
- **Mix implementations**: Don't import Vega logic in Observable Plot files.
- **Share chart strategies**: Keep `chartTypes/` scoped to the generator.
- **Cross-reference types**: Keep `types.ts` local to the generator.
- **Override the others**: Changes in one implementation shouldn't break the others.

## 🔍 Detection Points
The system detects chart type at these key points:
1. **Generation**: `generatePlot` in `observable-plot-generator` returns `PlotResult`.
2. **Rendering**: `ChartGrid.tsx` uses `spec.plots`/`spec.options` to select the path.
3. **CSS**: `.observablePlotContainer` class for Observable Plot sizing.
4. **Interactions**: Observable Plot DOM is encapsulated by `ObservablePlot.tsx`.

## 🚀 Focus Areas
- ✅ Programmatic API for flexible chart construction
- ✅ High-level abstractions for common chart types and grids
- 🔄 Custom interaction and tooltip handling
- 🔄 Advanced faceting and small multiples

This architecture ensures that advancing Observable Plot won’t break other parts of the UI and keeps the render path clean and responsive for both single and multi-plot layouts.
