# Plan: Consolidate Color Encoding into a `ColorChannel` Object

## Problem

Color encoding is currently threaded through the chart generator as a set of
**independent scalar parameters** (`colorField`, `colorScheme`, `colorBias`,
`colorReversed`, `manualColor`) rather than as the single cohesive object the
codebase *already defines* — `ColorChannel` in
[frontend/src/types/channels.ts](../../frontend/src/types/channels.ts#L14).

The `ColorChannel` interface exists and is assembled once by
[useChannels()](../../frontend/src/contexts/VisualizationContext/useChannels.ts#L19),
but it is **unpacked back into loose scalars** before it ever reaches the
generator boundary. As a result, every layer below `useChannels` re-declares the
same four-to-five color fields, and `deriveColorScaleInfo(...)` takes them as
positional arguments.

### Evidence: the "shotgun surgery" smell

Adding a single boolean (`colorReversed`) in the prior commit touched **47
files**. The ~25 files under `observable-plot-generator/` were almost entirely
*mechanical passthrough*: widen a params interface, forward one more argument.
The only file with real logic was
[colorSchemeUtils.ts](../../frontend/src/observable-plot-generator/utils/colorSchemeUtils.ts).

The next color attribute (e.g. `opacity`, `nullColor`, a custom stop list) will
cost the same ~25-file tax. This is textbook *shotgun surgery* + *long parameter
list*, and the correct abstraction is already written but unused at the boundary.

## Goal

Pass color encoding as **one `ColorChannel` object** from `useChannels` all the
way down to `deriveColorScaleInfo`, so that adding a new color attribute touches:

- `ColorChannel` (the type) — 1 file
- `useChannels` assembly — 1 file
- the consumer that uses the new attribute (e.g. `colorSchemeUtils`) — 1 file
- state/reducer/persistence/UI — unchanged count (these are genuinely needed)

…instead of every chart-type file.

**Non-goal:** This plan does **not** change `VisualizationState` (the flat
reducer state), the reducer action shape, persisted keys, or the UI controls.
Those layers legitimately need per-attribute entries. The refactor is confined
to the **propagation path from `useChannels` down through the generator**.

## Current architecture (as-is)

```
VisualizationState (flat: colorField, colorScheme, colorBias, colorReversed, manualColor)
        │
        ▼  useChannels()  ── assembles ──►  ColorChannel { field, scheme, bias, reversed, manual }
        │
        ▼  useChartGeneration  ── UNPACKS back to scalars ──►
        │
        ▼  ChartGenerationContext { colorField, colorScheme, colorBias, colorReversed, manualColor, ... }
        │
        ├─► CartesianPlotsConfig.encoding.color { field?, scheme?, bias?, reversed?, manual? }   (inline shape, duplicated)
        │
        ├─► coreGridGenerator ──► cellCharts ──► cellChartHelpers ──► per-chart params
        │
        └─► chart-type params (LineBuildParams, ScatterParams, BoxPlotParams, …)
                │
                ▼
            deriveColorScaleInfo(data, field, scheme, bias, reversed)   ← positional args
            deriveSplitSeriesGradientColorScale(data, field, scheme, bias, reversed)
```

### Inventory of layers that carry the loose color scalars

Each of these is a place a *new* color attribute must currently be added:

| Layer | File | Notes |
|---|---|---|
| Channel type (target) | [types/channels.ts](../../frontend/src/types/channels.ts#L14) | `ColorChannel` already exists |
| Channel assembly | [useChannels.ts](../../frontend/src/contexts/VisualizationContext/useChannels.ts#L19) | already builds `ColorChannel` |
| Unpack to scalars | [hooks/useChartGeneration.ts](../../frontend/src/components/Visualization/ChartArea/hooks/useChartGeneration.ts#L95) | lines ~95-97, ~248-250, ~369-371 |
| Generator context | [observable-plot-generator/types.ts](../../frontend/src/observable-plot-generator/types.ts#L86) | `ChartGenerationContext` + `CartesianPlotsConfig.encoding.color` |
| Config builder | [utils/configBuilder.ts](../../frontend/src/observable-plot-generator/utils/configBuilder.ts#L60) | lines ~60-61, ~187-188 |
| Core grid | [grid/coreGridGenerator.ts](../../frontend/src/observable-plot-generator/grid/coreGridGenerator.ts#L79) | |
| Cell dispatch | [chartTypes/cellCharts.ts](../../frontend/src/observable-plot-generator/chartTypes/cellCharts.ts#L72), [cellChartHelpers.ts](../../frontend/src/observable-plot-generator/chartTypes/cellChartHelpers.ts#L81), [cellChartTypes.ts](../../frontend/src/observable-plot-generator/chartTypes/cellChartTypes.ts#L31) | |
| Faceting | [faceting/facetDomains.ts](../../frontend/src/observable-plot-generator/faceting/facetDomains.ts#L57), [facetDomainContext.ts](../../frontend/src/observable-plot-generator/faceting/facetDomainContext.ts), [facetGenerator.ts](../../frontend/src/observable-plot-generator/faceting/facetGenerator.ts) | |
| Per-chart generators | barUnified, boxPlot, cdfChart, densityChart, ganttChart, heatmapChart, lineChart, pieChart, scatterChart, tableGrid, tickStrip | ~11 files, each with a params interface |
| Color scale logic | [utils/colorSchemeUtils.ts](../../frontend/src/observable-plot-generator/utils/colorSchemeUtils.ts#L97) | `deriveColorScaleInfo`, `deriveSplitSeriesGradientColorScale` — positional args |
| Legend (sibling consumer) | [Legend/LegendPanel.tsx](../../frontend/src/components/Visualization/Legend/LegendPanel.tsx#L68) | also calls `deriveColorScaleInfo` |
| Per-field overrides | [types/field.ts](../../frontend/src/types/field.ts#L100) (`FieldOverrideState`), [Overrides/FieldOverridesPanel.tsx](../../frontend/src/components/Visualization/Overrides/FieldOverridesPanel.tsx) | override merge produces "effective" color values |
| Config hash / cache | [utils/sheetConfigHash.ts](../../frontend/src/utils/sheetConfigHash.ts#L148), [utils/queryAffectingConfig.ts](../../frontend/src/utils/queryAffectingConfig.ts#L17) | needs per-attribute entries — leave as-is |

## Target architecture (to-be)

Introduce a single `color: ColorChannel` (or a generator-local
`ResolvedColorEncoding`) that travels intact down the pipeline. `deriveColorScaleInfo`
accepts the object instead of positional scalars.

```
ColorChannel (or ResolvedColorEncoding)  { field, scheme, bias, reversed, manual }
        │  (passed by reference, never unpacked)
        ▼
ChartGenerationContext { color: ResolvedColorEncoding, ... }
        ▼
chart-type params { color: ResolvedColorEncoding, ... }
        ▼
deriveColorScaleInfo(data, color)            // 1 object arg
deriveSplitSeriesGradientColorScale(data, color)
```

Adding a new attribute = add a field to `ColorChannel` + read it inside
`colorSchemeUtils`. Zero churn in the ~11 chart-type files and faceting.

### Why a separate `ResolvedColorEncoding` may be warranted

`ColorChannel.field` is `Field | null`; in the generator the field is sometimes
known-present, sometimes overridden per-field. Two options:

1. **Reuse `ColorChannel` directly** — simplest, fewest types. The generator
   tolerates `field: null` (it already guards `colorField ?` everywhere).
2. **New `ResolvedColorEncoding` type** in `observable-plot-generator/types.ts` —
   represents the *post-override, effective* color encoding for a given chart
   cell, decoupling the generator from the context/state vocabulary.

**Recommendation:** start with option 1 (reuse `ColorChannel`) to minimize new
surface area; promote to option 2 only if the per-field override merge logic
(below) makes a distinct "resolved" type clearly cleaner.

### The per-field override wrinkle (do not skip)

Color is not purely global. `FieldOverrideState`
([field.ts](../../frontend/src/types/field.ts#L100)) can override `colorScheme`,
`colorBias`, `colorReversed`, `manualColor` per field, and
[FieldOverridesPanel.tsx](../../frontend/src/components/Visualization/Overrides/FieldOverridesPanel.tsx)
computes "effective" values as `override.X ?? global.X ?? default`.

The refactor should centralize this merge into a single helper, e.g.:

```ts
function resolveColorEncoding(
  global: ColorChannel,
  override?: FieldOverrideState,
): ColorChannel { /* override.X ?? global.X ?? default */ }
```

This removes the scattered `effectiveColorBias` / `effectiveColorReversed`
computations and is the *real* payoff of the refactor — the override merge
becomes the only place attributes are enumerated.

## Implementation plan (phased, each phase compiles + tests green)

The key to keeping this low-risk is **bottom-up**: change the leaf
(`deriveColorScaleInfo`) last-but-isolated, or introduce an overload so call
sites migrate incrementally.

### Phase 0 — Safety net
- Confirm existing tests cover color: `colorSchemeUtils.test.ts`,
  `lineColorEncoding`, `lineChart`. Add tests for the override-merge helper.
- Run `npm test` (frontend) to capture a green baseline.

### Phase 1 — Centralize the override merge
- Add `resolveColorEncoding(global, override?)` near `useFieldOverrides` /
  `FieldOverridesPanel`, returning a `ColorChannel`.
- Replace the scattered `effectiveColorScheme/Bias/Reversed/manualColor`
  computations with calls to it. **Behavior-preserving.**

### Phase 2 — Object-accepting `deriveColorScaleInfo`
- Add an overload / new signature:
  `deriveColorScaleInfo(data, color: ColorChannel)` and
  `deriveSplitSeriesGradientColorScale(data, color)`.
- Internally keep the existing scalar implementation; the object form just
  destructures. Keep the old positional signature temporarily (deprecated) so
  call sites migrate one at a time. Update `colorSchemeUtils.test.ts`.

### Phase 3 — Thread `color: ColorChannel` through the generator boundary
- Add `color: ColorChannel` to `ChartGenerationContext` (keep the old scalar
  fields temporarily, populated from `color`, to avoid a big-bang edit).
- Update `useChartGeneration` to stop unpacking: pass `channels.color` straight
  into the context.
- Replace `CartesianPlotsConfig.encoding.color` inline shape with `ColorChannel`.

### Phase 4 — Migrate per-chart call sites
- For each of barUnified, boxPlot, cdfChart, densityChart, ganttChart,
  heatmapChart, lineChart, pieChart, scatterChart, tableGrid, tickStrip,
  faceting: replace the `colorField/Scheme/Bias/Reversed` params with a single
  `color` and switch `deriveColorScaleInfo(...)` to the object form.
- Update `cellCharts` / `cellChartHelpers` / `cellChartTypes` and `configBuilder`
  to forward the object.

### Phase 5 — Migrate the Legend consumer
- Update [LegendPanel.tsx](../../frontend/src/components/Visualization/Legend/LegendPanel.tsx#L68)
  to use the object form (it currently mirrors the generator call).

### Phase 6 — Remove the deprecated scalar paths
- Delete the temporary scalar fields from `ChartGenerationContext`, the
  positional overload of `deriveColorScaleInfo`, and the inline `encoding.color`
  shape. Final cleanup; everything now flows as `ColorChannel`.

### Phase 7 — Validation
- `npm test` green.
- `npm run build` (CRA, TS strict) clean.
- Manual smoke: continuous color (bias + reverse), categorical color, manual
  color, per-field color override, line series gradient, heatmap, legend
  rendering, and sheet persistence round-trip (config hash unchanged for
  identical configs).

## Known gaps to close during the refactor

These pre-existing holes were found while auditing whether every layer that
*accepts* a color attribute actually *forwards* it. They are the direct
consequence of the loose-scalar plumbing and should be fixed as part of (or
immediately after) the migration — passing a single `ColorChannel` makes them
disappear rather than requiring per-attribute patches.

### G1 — MeasureValues multi-mark ignores per-cell color overrides

[generateMeasureValuesMultiMarkPlot](../../frontend/src/observable-plot-generator/chartTypes/measureValuesMultiMark.ts#L295)
accepts only a precomputed `sharedColorScale` (plus `manualColor`). It never
receives `colorScheme`, `colorBias`, or `colorReversed`.

- **Global** color settings work because they are baked into `sharedColorScale`
  at [coreGridGenerator.ts:79](../../frontend/src/observable-plot-generator/grid/coreGridGenerator.ts#L79).
- **Per-cell / per-field overrides are silently dropped.**
  [coreGridGenerator.ts](../../frontend/src/observable-plot-generator/grid/coreGridGenerator.ts#L136)
  computes `cellColorReversed` / `cellColorBias` / `cellColorScheme` from
  `cellOverride.*` and forwards them to the standard
  `generatePairChartOptions` branch — but the `needsMultiMark` branch
  (~lines 232–245) passes only `sharedColorScale` and the **global**
  `manualColor`. So on a MeasureValues multi-mark chart, a per-field reverse /
  bias / scheme toggle has no effect.
- **Severity:** low/edge (requires MeasureValues + per-measure overrides + a
  per-field color tweak), but it affects `reversed`, `bias`, and `scheme`
  uniformly — same root cause.
- **Fix during refactor:** pass the resolved `ColorChannel` (the per-cell
  `resolveColorEncoding(global, cellOverride)` result) into
  `generateMeasureValuesMultiMarkPlot` and derive the scale inside it, instead
  of relying solely on the global `sharedColorScale`.

### G2 — `scatterForDimOnly` drops `colorScheme`

[scatterForDimOnly](../../frontend/src/observable-plot-generator/chartTypes/cellChartHelpers.ts#L81)
calls `scatterChart(... ctx.colorField, undefined, ctx.colorBias, ctx.colorReversed, ...)`
— passing `undefined` in the `colorScheme` slot. The dimension-only scatter
therefore ignores the chosen scheme (while still honoring `bias` and
`reversed`). Pre-existing and unrelated to the reverse work, but the object
refactor removes the positional-slot footgun entirely: passing `ctx.color`
forwards every attribute or none, consistently.

> Audit note: aside from G1/G2, every other site that declares a color
> attribute forwards it correctly to `deriveColorScaleInfo` /
> `deriveSplitSeriesGradientColorScale` (verified across all chart-type,
> faceting, `chartRules`, `configBuilder`, and `LegendPanel` call sites). There
> are no fully-dead color parameters.

## Explicitly out of scope

- `VisualizationState`, the reducer, action types, `persistedKeys`,
  `initialState` — keep flat (UI and undo/redo depend on granular actions).
- `sheetConfigHash` / `queryAffectingConfig` — keep per-attribute (the hash must
  enumerate fields to remain stable and explicit). The object refactor does not
  change which attributes affect the hash.
- Adding the next color attribute (e.g. `opacity`). This plan only makes that
  *cheap*; it does not introduce it.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Big-bang breakage across ~25 files | Phased with temporary dual paths (Phases 3–6); each phase compiles + tests green |
| Per-field override semantics drift | Centralize in `resolveColorEncoding` first (Phase 1), behavior-preserving, with tests |
| Config-hash instability → cache misses / stale charts | Leave hashing untouched; verify identical configs hash identically in Phase 7 |
| Legend diverging from generator | Migrate Legend in the same pass (Phase 5) since it shares `deriveColorScaleInfo` |
| `field: null` vs known-present | Generator already guards `colorField ?`; reuse `ColorChannel` (option 1) |
| Multi-mark / dim-only color gaps (G1, G2) reappearing | Resolve via the `ColorChannel` passthrough; add a test for per-field override on a MeasureValues multi-mark chart |

## Estimated payoff

- **Before:** new color attribute ≈ 47 files (≈25 of them pure plumbing).
- **After:** new color attribute ≈ 5–6 files (type, assembly, override-merge,
  consumer logic, UI control, persistence) with **zero** chart-type churn.
