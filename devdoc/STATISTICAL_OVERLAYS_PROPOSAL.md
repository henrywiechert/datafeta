# Statistical Overlays — Architecture & Implementation Proposal

## 1. What Observable Plot Already Gives Us

The installed version (0.6.17) ships with all three features as **first-class marks/transforms**:

| Feature | OP API | What it renders |
|---------|--------|-----------------|
| **Linear regression + confidence band** | `Plot.linearRegressionX(data, {x, y, ci, stroke})` / `linearRegressionY` | OLS regression line + shaded CI area (default 95%) |
| **Moving / window average** | `Plot.windowY({k, reduce}, {x, y, stroke})` — or `windowX` | Smoothed line via rolling window (`mean`, `median`, `sum`, `min`, `max`, `deviation`, custom) |
| **Bollinger bands** | `Plot.bollingerY(data, {x, y, n, k, fill, stroke})` / `bollingerX` | Center moving average line + ±k·σ shaded band |

Key API details:

```ts
// Regression — renders a line + fill band automatically
Plot.linearRegressionY(data, { x: "date", y: "price", ci: 0.95, stroke: "red" })

// Window average — a transform applied to line/area marks
Plot.lineY(data, Plot.windowY({ k: 20, reduce: "mean" }, { x: "date", y: "price", stroke: "blue" }))

// Bollinger — composite mark (area + line), uses window internally
Plot.bollingerY(data, { x: "date", y: "price", n: 20, k: 2, color: "steelblue", opacity: 0.15 })
```

All three accept the same data as the primary mark. They operate on the **same dataset** already passed to `Plot.plot()`, which means we never need a separate query — we push extra marks into the existing `marks[]` array.

---

## 2. Architecture: The "Overlay Add-on" Pattern

### Design Goal

Overlays must be **completely decoupled** from the existing chart-type handlers. A chart handler produces a `Plot.PlotOptions` object; overlays post-process that object by appending marks. This keeps the current code untouched.

### Where it hooks in

```
Chart handler (lineChart / scatterChart / etc.)
        │
        ▼
   Plot.PlotOptions  ← { marks: [line(...), dot(...)] }
        │
        ▼
 ┌──────────────────┐
 │  applyOverlays() │  ← NEW — pure function, overlay add-on layer
 └──────────────────┘
        │
        ▼
   Plot.PlotOptions  ← { marks: [line(...), dot(...), linearRegressionY(...), bollingerY(...)] }
        │
        ▼
   Plot.plot(options) → SVG
```

The insertion point is in [coreGridGenerator.ts](../frontend/src/observable-plot-generator/grid/coreGridGenerator.ts) (and the facet equivalent), right after `generatePairChartOptions()` returns and before the options are stored in the `PlotResult`.

### File / module structure

```
frontend/src/observable-plot-generator/
  overlays/                          ← NEW top-level folder
    index.ts                         ← applyOverlays() orchestrator
    types.ts                         ← OverlayConfig, OverlayType
    registry.ts                      ← OVERLAY_REGISTRY mapping
    linearRegression.ts              ← builds linearRegressionY/X mark
    movingAverage.ts                 ← builds windowY/X line mark
    bollingerBands.ts                ← builds bollingerY/X composite mark
```

Everything lives under a single `overlays/` folder. No existing chart-type files are modified beyond a single call site that pipes options through `applyOverlays()`.

---

## 3. Data Model

### 3.1 Overlay configuration type

```ts
// overlays/types.ts

export type OverlayType = 'linearRegression' | 'movingAverage' | 'bollingerBands';

/** Per-overlay knobs — union of all overlay-specific params */
export interface OverlayParams {
  // Linear regression
  ci?: number;              // Confidence interval 0–0.99 (default 0.95)

  // Moving average / Bollinger shared
  windowSize?: number;      // k / n — rolling window size (default 20)
  reduce?: string;          // 'mean' | 'median' | 'sum' | ... (default 'mean')
  anchor?: 'start' | 'middle' | 'end';

  // Bollinger-specific
  bandWidth?: number;       // k — standard deviations (default 2)

  // Visual
  color?: string;           // Override stroke/fill color
  opacity?: number;         // Band opacity (default 0.15)
}

export interface OverlayConfig {
  type: OverlayType;
  enabled: boolean;
  params: OverlayParams;
}
```

### 3.2 Where it lives in state

Overlays are stored **per sheet**, alongside existing override state:

```ts
// types/sheet.ts  (addition)
export interface SheetState {
  // ... existing fields ...
  overlays?: OverlayConfig[];   // ← NEW
}
```

This keeps them global per sheet (all cells in a grid get the same overlays). Phase 2 could scope overlays per field/cell via `FieldOverrideState` if needed — but global-per-sheet is the natural starting point.

### 3.3 Applicability rules (which chart types support overlays)

Not every overlay makes sense on every chart type:

| Overlay | line | scatter | bar | tick | gantt | cdf |
|---------|------|---------|-----|------|-------|-----|
| Regression | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Moving avg | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Bollinger  | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |

The registry encodes this:

```ts
// overlays/registry.ts
export const OVERLAY_REGISTRY: Record<OverlayType, {
  applicableTo: Set<UserChartType>;
  build: (data: any[], xCol: string, yCol: string, params: OverlayParams, orientation: 'x' | 'y') => Plot.Markish;
}> = { ... };
```

Overlays that don't apply to the current chart type are silently skipped — no error, no UI disable needed (the UI simply won't show them).

---

## 4. The Orchestrator

```ts
// overlays/index.ts

import * as Plot from '@observablehq/plot';
import { OverlayConfig } from './types';
import { OVERLAY_REGISTRY } from './registry';
import { UserChartType } from '../../types';

/**
 * Pure function: takes existing PlotOptions + overlay configs,
 * returns new PlotOptions with overlay marks appended.
 * Never mutates the input.
 */
export function applyOverlays(
  options: Plot.PlotOptions,
  overlays: OverlayConfig[],
  meta: {
    data: any[];
    xColumn: string;
    yColumn: string;
    chartType: UserChartType;
    orientation: 'x' | 'y';  // which axis is the dependent (value) axis
  }
): Plot.PlotOptions {
  const activeOverlays = overlays.filter(o => o.enabled);
  if (activeOverlays.length === 0) return options;

  const extraMarks: Plot.Markish[] = [];

  for (const overlay of activeOverlays) {
    const entry = OVERLAY_REGISTRY[overlay.type];
    if (!entry) continue;
    if (!entry.applicableTo.has(meta.chartType)) continue;

    const mark = entry.build(
      meta.data,
      meta.xColumn,
      meta.yColumn,
      overlay.params,
      meta.orientation
    );
    extraMarks.push(mark);
  }

  if (extraMarks.length === 0) return options;

  return {
    ...options,
    marks: [...(options.marks || []), ...extraMarks],
  };
}
```

### Integration point (single change to existing code)

In `coreGridGenerator.ts`, after the handler returns options:

```ts
// After:  options = generatePairChartOptions(data, xField, yField, ...);
// Add:
if (overlayConfigs?.length) {
  options = applyOverlays(options, overlayConfigs, {
    data,
    xColumn: getFieldColumnName(xField),
    yColumn: getFieldColumnName(yField),
    chartType: resolvedUserChartType,
    orientation: isBarY || isLineVertical ? 'x' : 'y',
  });
}
```

The same pattern applies in `facetGenerator.ts` / `facetCoordinator.ts` for faceted charts.

---

## 5. Overlay Builders (Implementation Sketches)

### 5.1 Linear Regression

```ts
// overlays/linearRegression.ts
import * as Plot from '@observablehq/plot';
import { OverlayParams } from './types';

export function buildLinearRegression(
  data: any[], xCol: string, yCol: string,
  params: OverlayParams, orientation: 'x' | 'y'
): Plot.Markish {
  const ci = params.ci ?? 0.95;
  const color = params.color ?? '#e15759';
  const markFn = orientation === 'y' ? Plot.linearRegressionY : Plot.linearRegressionX;
  return markFn(data, {
    x: xCol,
    y: yCol,
    ci,
    stroke: color,
    fill: color,
    fillOpacity: params.opacity ?? 0.1,
  });
}
```

### 5.2 Moving Average

```ts
// overlays/movingAverage.ts
import * as Plot from '@observablehq/plot';
import { OverlayParams } from './types';

export function buildMovingAverage(
  data: any[], xCol: string, yCol: string,
  params: OverlayParams, orientation: 'x' | 'y'
): Plot.Markish {
  const k = params.windowSize ?? 20;
  const reduce = params.reduce ?? 'mean';
  const anchor = params.anchor ?? 'middle';
  const color = params.color ?? '#4e79a7';
  const windowOpts = { k, reduce, anchor };

  if (orientation === 'y') {
    return Plot.lineY(data, Plot.windowY(windowOpts, {
      x: xCol, y: yCol, stroke: color, strokeWidth: 2,
    }));
  }
  return Plot.lineX(data, Plot.windowX(windowOpts, {
    x: xCol, y: yCol, stroke: color, strokeWidth: 2,
  }));
}
```

### 5.3 Bollinger Bands

```ts
// overlays/bollingerBands.ts
import * as Plot from '@observablehq/plot';
import { OverlayParams } from './types';

export function buildBollingerBands(
  data: any[], xCol: string, yCol: string,
  params: OverlayParams, orientation: 'x' | 'y'
): Plot.Markish {
  const n = params.windowSize ?? 20;
  const k = params.bandWidth ?? 2;
  const color = params.color ?? '#59a14f';
  const opacity = params.opacity ?? 0.15;

  const markFn = orientation === 'y' ? Plot.bollingerY : Plot.bollingerX;
  return markFn(data, {
    x: xCol, y: yCol,
    n, k,
    color,
    opacity,
    stroke: color,
    strokeWidth: 1.5,
  });
}
```

---

## 6. UI Design

### 6.1 Placement

Add a new **"Overlays"** section in the existing `FieldOverridesPanel`. It sits below the current controls (chart type, color, size, labels, tooltip) as a new `PropertySection`:

```
┌─ Overrides Panel ──────────────────────┐
│  Chart Type    [Auto ▾]               │
│  Color         ┄┄┄ drag field ┄┄┄     │
│  Size          ┄┄┄ drag field ┄┄┄     │
│  Labels        ...                     │
│  Tooltip       ...                     │
│                                        │
│  ── Overlays ──────────────────── ▾ ── │  ← NEW collapsible section
│  ☐ Linear Regression                  │
│     CI: [0.95]  Color: [■]            │
│  ☐ Moving Average                     │
│     Window: [20]  Reduce: [Mean ▾]    │
│  ☐ Bollinger Bands                    │
│     Window: [20]  Band: [2σ]          │
└────────────────────────────────────────┘
```

### 6.2 Visibility rules

The "Overlays" section is **only shown** when the active chart type supports at least one overlay (line, scatter). When the user is on a bar chart, the section is hidden entirely — no need to explain why it's disabled.

### 6.3 Component structure

```
components/Visualization/Overrides/
  overlays/                              ← NEW sub-folder
    OverlaysSection.tsx                  ← Container with PropertySection wrapper
    OverlayToggle.tsx                    ← Single overlay row (checkbox + inline params)
    RegressionControls.tsx               ← CI slider + color picker
    MovingAverageControls.tsx            ← Window size + reduce dropdown
    BollingerControls.tsx                ← Window size + band width
```

### 6.4 Interaction model

- **Checkbox** toggles `enabled` on the overlay config
- **Parameter controls** are inline-revealed when enabled (accordion-style)
- Changes dispatch to `VisualizationContext` via a new action: `SET_OVERLAYS`
- Undo/redo supported via existing `recordAction` pattern
- Overlays are **persisted in the sheet state** (saved/restored with the workbook)

### 6.5 Responsive inline controls (rough spec)

| Overlay | Controls when enabled |
|---------|----------------------|
| **Regression** | CI slider (0.80–0.99, step 0.01) · Color swatch |
| **Moving Avg** | Window size input (2–200) · Reduce dropdown (mean/median/sum/min/max) · Anchor (start/middle/end) |
| **Bollinger** | Window size input (2–200) · Band width (1σ–3σ, step 0.5) · Color swatch · Band opacity slider |

---

## 7. State Management

### 7.1 Context actions

```ts
// contexts/VisualizationContext/types.ts  (additions)
| { type: 'SET_OVERLAYS'; payload: OverlayConfig[] }
| { type: 'TOGGLE_OVERLAY'; payload: { type: OverlayType; enabled: boolean } }
| { type: 'UPDATE_OVERLAY_PARAMS'; payload: { type: OverlayType; params: Partial<OverlayParams> } }
```

### 7.2 Reducer

```ts
case 'SET_OVERLAYS':
  return { ...state, overlays: action.payload };

case 'TOGGLE_OVERLAY':
  return {
    ...state,
    overlays: (state.overlays || []).map(o =>
      o.type === action.payload.type ? { ...o, enabled: action.payload.enabled } : o
    ),
  };

case 'UPDATE_OVERLAY_PARAMS':
  return {
    ...state,
    overlays: (state.overlays || []).map(o =>
      o.type === action.payload.type ? { ...o, params: { ...o.params, ...action.payload.params } } : o
    ),
  };
```

### 7.3 Default state

```ts
const DEFAULT_OVERLAYS: OverlayConfig[] = [
  { type: 'linearRegression', enabled: false, params: { ci: 0.95 } },
  { type: 'movingAverage', enabled: false, params: { windowSize: 20, reduce: 'mean', anchor: 'middle' } },
  { type: 'bollingerBands', enabled: false, params: { windowSize: 20, bandWidth: 2, opacity: 0.15 } },
];
```

All overlays start disabled. The full set is always in state so the UI can render all toggles.

---

## 8. Integration with Existing Systems

### 8.1 Color interaction

Overlay colors default to a fixed palette (distinct from the data series colors). They intentionally do **not** participate in the color encoding (`colorField`/`colorScheme`) to avoid confusion. Each overlay has its own color picker.

### 8.2 Faceted charts

Overlays apply **per-facet cell** — each cell gets its own regression line / moving average computed independently from its own data subset. This is automatic because OP marks operate on the data passed to them, and in faceted charts each cell already has its own filtered data.

### 8.3 Multi-measure (MeasureValues)

When multiple measures are plotted (via `measureValuesMultiMark.ts`), overlays are applied once per measure's sub-plot. The `applyOverlays` call happens inside the per-measure loop, so each measure gets its own regression / moving average.

### 8.4 Zoom/brush interaction

Overlays recompute automatically when zoom filters data (since they operate on the filtered dataset). No special handling needed.

### 8.5 Tooltip interaction

Overlay marks don't need custom tooltips. The OP regression/Bollinger marks render as `<path>` elements that don't interfere with the existing `CustomTooltip` hover logic (which targets data dots/bars).

---

## 9. Isolation Summary

| Concern | Existing code touched | New code |
|---------|----------------------|----------|
| Chart type handlers | **None** | — |
| Mark composition | — | `overlays/*.ts` (3 builders) |
| Orchestration | 1–2 lines in `coreGridGenerator.ts` + facet equivalent | `overlays/index.ts` |
| Types | Add `overlays?` to `SheetState` | `overlays/types.ts` |
| State management | Add 3 reducer cases | — |
| UI | Add `<OverlaysSection>` in `FieldOverridesPanel` | `overlays/*.tsx` (5 components) |
| Persistence | Automatic (part of sheet state) | — |

The entire feature is deletable by removing the `overlays/` folders and the 1–2 line call sites. No chart handler logic is modified.

---

## 10. Future Extensions

Once the add-on pattern is proven, it naturally extends to:

- **Trend lines** (polynomial regression — requires custom mark but same pattern)
- **Reference lines / bands** (horizontal/vertical thresholds — `Plot.ruleY()`)
- **Percentile bands** (using `window` with `p10` / `p90` reduce)
- **LOESS / lowess smoothing** (would need a custom mark or d3-based pre-computation)
- **Per-field scoped overlays** — move `overlays` from sheet-level to `FieldOverrideState` so each measure can have its own regression settings
- **Overlay legend entries** — extend the existing `Legend` component to show overlay labels

---

## 11. Implementation Sequence (Suggested)

1. **Types + state** — `OverlayConfig`, reducer, default state, persistence
2. **Builders** — `linearRegression.ts`, `movingAverage.ts`, `bollingerBands.ts`
3. **Orchestrator** — `applyOverlays()` + integration in `coreGridGenerator.ts`
4. **UI controls** — `OverlaysSection.tsx` + individual control components
5. **Facet/multi-measure** — verify automatic per-cell behavior, add test cases
6. **Polish** — color defaults, accessibility, undo/redo verification
