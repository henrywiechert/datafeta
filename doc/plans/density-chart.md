# Plan: Density (KDE) Chart as a New UserChartType

## Problem

Users frequently build "dimension on X + COUNT(same field) on Y" views (optionally
on a binned virtual column) to inspect the distribution of a single continuous
field. The resulting histogram-style chart looks bumpy/flaky and is sensitive to
bin width. A smoothed kernel density estimate (KDE) — natively available via
`Plot.density(data, { x, stroke })` — would provide a cleaner, bandwidth-tunable
view of the same data.

## Approach

Add **Density** as a new top-level `UserChartType`, sibling to **CDF**, not as
a Distribution variant.

Rationale (from chat analysis):

- Tick-strip and Box-plot are **1D comparison** views (category axis + value axis,
  like bars).
- CDF and Density are **2D statistical curves** derived from a single field
  (X = value, Y = derived statistic). They share a UI intent ("show me the
  distribution shape") but not a data path:
  - CDF uses a specialized backend `query_mode: cdf` (quantile-based reduction).
  - Density wants **raw rows** so Observable Plot can run KDE faithfully.
- The existing `overlays/density.ts` already proves out `Plot.density()`
  rendering, per-group stroke handling, and parameter controls. The new chart
  type reuses that machinery rather than reinventing it.

UI grouping: place Density adjacent to CDF in `ChartTypeControl` to visually
signal "statistical curves," but keep them independently implemented.

## Scope

In scope:

- New `'density'` `UserChartType` peer to CDF.
- Frontend-only KDE via `Plot.density()` on raw rows of the selected continuous
  X field, with optional discrete color → per-group curves.
- Auto-detection rule (when to default to density vs. bar/line).
- Parameter controls (bandwidth, thresholds, filled, opacity) reusing the
  `OverlaysSection` patterns.
- Faceting via existing `fx/fy` infrastructure.
- Result-budget / sampling for large raw-row results (reuse scatter pattern).
- Binned virtual column handling: prefer the underlying raw source field;
  fall back to bin-centers with `weight: count` (documented as approximate).

Out of scope (deferred):

- Density as an **overlay** on bar/histogram charts (separate decision).
- Backend / server-side KDE.
- Combined "CDF + Density" composite panel.
- 2D density chart type (the existing scatter overlay already covers this).

## Affected modules

- `frontend/src/types/field.ts` — extend `UserChartType` union.
- `frontend/src/observable-plot-generator/chartTypes/densityChart.ts` — new handler.
- `frontend/src/observable-plot-generator/chartTypes/cellCharts.ts` — dispatch density.
- `frontend/src/observable-plot-generator/helpers/chartTypeResolver.ts` —
  `mapUserChartTypeToCellChartType`, `detectDefaultUserChartType`, `CellChartType`.
- `frontend/src/observable-plot-generator/chartTypes/chartTypePresentation.ts` —
  density resolves to `'chart'` (default; no change likely required).
- `frontend/src/observable-plot-generator/rules/chartRules.ts` — auto-detect path.
- `frontend/src/viewPlanner/buildViewSpec.ts` + `viewPlanner/types.ts` —
  ensure density resolves to `grain: 'rawRows'` (no aggregation).
- `frontend/src/queryBuilder/queryBuilder.ts` — density uses `buildRawQuery`
  path (no new query mode needed).
- `frontend/src/components/Visualization/Overrides/ChartTypeControl.tsx` —
  new toggle button + icon, placed next to CDF.
- `frontend/src/components/Visualization/Overrides/` — new
  `DensityParametersSection.tsx` (or extend OverridesPanel) for bandwidth /
  thresholds / filled / opacity.
- `frontend/src/contexts/VisualizationContext/` — persist per-sheet density
  parameters in `VisualizationStateSnapshot` (mirrors how overlay params are
  stored today; consider naming `densityParams`).
- `frontend/src/services/chartTypeClassifier.ts` — classify density (raw-row,
  point-budgeted) for the query orchestrator.
- `frontend/src/observable-plot-generator/faceting/` — verify density flows
  through facet planner; `Plot.density({ fx, fy })` is supported natively.
- Tests:
  - `chartTypes/densityChart.test.ts` (new).
  - `helpers/chartTypeResolver.test.ts` (extend).
  - `viewPlanner/__tests__/buildViewSpec.test.ts` (extend).

## Behavior decisions to confirm with user

These are flagged for `ask_user` during plan finalization, not assumed:

1. **Default parameters** — bandwidth 20 / thresholds 20 (Plot defaults) vs.
   the overlay defaults (bandwidth 30 / thresholds 10).
2. **Filled vs. lines-only default** — overlay defaults to lines-only; density
   chart as a primary view likely wants filled.
3. **Y-axis label / scale** — show density values vs. hide Y-axis labels
   (KDE Y units are not very meaningful to most users).
4. **Auto-detection trigger** — should density ever be auto-selected, or only
   user-selected? Conservative answer: only user-selected.
5. **Binned virtual column on X** — confirm fallback strategy
   (raw source preferred; bin-center + weight is the approximate fallback).
6. **Multiple X fields** — small-multiples grid (one density per X), matching
   how CDF handles multiple measures.

## Risks / open questions

- **Performance:** KDE over millions of raw rows in the browser is expensive.
  Mitigation: reuse the scatter-chart sampling / `maxPoints` budget pattern
  (`computeScatterBudget`); stratified sampling when discrete color is present.
- **Per-group thresholds:** Observable Plot derives thresholds from the
  highest-density series so curves are comparable. Document this behavior in
  the UI/tooltip.
- **Result reuse vs. CDF cache:** density's `rawRows` query may already be
  cached by the orchestrator for the same field — verify cache key compat.
- **Faceting interaction:** confirm `Plot.density({ fx, fy, stroke })` works
  through `facetCoordinator` without special-casing.
- **Tooltip:** Plot.density doesn't expose individual data points; the custom
  tooltip layer may need a no-op for density marks (similar to how the overlay
  sets `className: 'overlay-no-tooltip'`).

## Phased delivery

1. **PR 1 — Type + handler skeleton:** add `'density'` to `UserChartType`,
   create `densityChart.ts` handler (single X field, no color), wire through
   `cellCharts` and `chartTypeResolver`. Render via a dev-only toggle.
2. **PR 2 — Query path:** ensure `buildViewSpec` routes density to `rawRows`;
   add `chartTypeClassifier` entry; verify orchestrator picks raw-row path.
3. **PR 3 — UI toggle + parameter controls:** add Density button to
   `ChartTypeControl` next to CDF; add parameter controls (bandwidth,
   thresholds, filled, opacity) persisted in sheet state.
4. **PR 4 — Color/facet support:** per-group curves via `stroke: colorColumn`;
   verify facet planner; reuse stamping pattern from overlay if needed.
5. **PR 5 — Binned-X fallback + result budget:** detect binned virtual columns
   and resolve raw source where possible; apply scatter-style sampling.
6. **PR 6 — Tests + docs:** unit tests for chart resolver / handler / view spec;
   short note in `observable-plot.md`.

## Notes

- No backend changes required — density is computed entirely in the browser by
  Observable Plot.
- The existing 2D scatter density overlay stays untouched; it serves a
  different purpose (anti-overplotting on bivariate scatter) and is not in
  competition with this new chart type.
- Keep the door open for a future "density overlay on bar histogram" feature
  by structuring the parameter controls as reusable components, not chart-type-
  specific.
