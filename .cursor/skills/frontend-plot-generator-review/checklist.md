# Plot Generator Review — Investigation Checklist

Use while executing Steps 2–9 of [SKILL.md](SKILL.md). Skip irrelevant rows and note why.
Grep examples assume `cd frontend`. Prefer workspace search tools when available.
`OPG=src/observable-plot-generator` for brevity below.

## Map the flow

```bash
sed -n '1,200p' src/observable-plot-generator/observablePlotGenerator.ts
rg "GRID_PLOT_GENERATORS|generateCartesianPlots|generateFacetedGrid|GRID_PLOT_CHART_TYPE_ORDER" src/observable-plot-generator/observablePlotGenerator.ts -n
```

## Generator purity (expect ZERO real leaks)

- [ ] No `from 'react'` / `react-dom` imports anywhere in the subsystem
- [ ] No `document.` / `window.` runtime use (comment mentions don't count)
- [ ] Only external lib is `@observablehq/plot`

```bash
# The one historical false-positive is the word "window" in a tableGrid.ts prose comment
grep -rnE "from 'react'|from \"react\"|react-dom|document\.|window\." src/observable-plot-generator --include='*.ts' --include='*.tsx' | grep -vE "^\s*\*|//"
rg "^import" src/observable-plot-generator -g '*.ts' | rg -v "@observablehq/plot|\.\./|\./" 
```

## Renderer must NOT recompute shared domains (expect ZERO)

- [ ] `computeSharedMeasureDomains` not called in `src/components/Visualization`
- [ ] `computeSharedDomainsForFaceting` not called in components

```bash
rg "computeSharedMeasureDomains|computeSharedDomainsForFaceting|computeSharedNumericDomains" src/components/Visualization -n
# Confirm the single legit producer path
rg "computeSharedDomainsFromContext|computeSharedMeasureDomains|computeSharedNumericDomains" src/observable-plot-generator -n
```

## Measure domain stacking (measureDomains.ts)

- [ ] color+category: pos/neg summed separately per `(facet,category)` key
- [ ] facet key `facetColumnNames.join('|')` cannot collide; `__global__` when no facets
- [ ] color-only: pos/neg totalled globally
- [ ] neither: raw per-row min/max
- [ ] empty/all-NaN → `[0,1]`; `min==max==0` → `[0,1]`
- [ ] `DOMAIN_PAD_RATIO` headroom both sides, negatives preserved, zero baseline not shifted

```bash
rg "stackTotals|__global__|facetColumnNames|DOMAIN_PAD_RATIO|updateRange|pos|neg" src/observable-plot-generator/domains/measureDomains.ts -n
```

## Numeric / timeline extents (numericDomains.ts)

- [ ] Timeline branch uses reduce loop, NOT `Math.min(...arr)` / `Math.max(...arr)`
- [ ] `dateTimeMode === 'timeline'` detection; `date_mode` snake_case fallback is dead/justified
- [ ] `__min`/`__max` summary-column shortcut + correct fallback to row scan
- [ ] measure key = alias/result name; dimension key = `columnName`

```bash
rg "Math.min\(\.\.\.|Math.max\(\.\.\.|reduce|__min|__max|dateTimeMode|date_mode|isTimeline|parseDateValue" src/observable-plot-generator/domains/numericDomains.ts -n
```

## Chart-type selection (registry vs rules)

- [ ] Registry holds NO generator/React refs (metadata only)
- [ ] Every `isGridChart: true` type has a generator in `GRID_PLOT_GENERATORS` or a branch
- [ ] `clearWhenNotAllowed` types fall back to auto-detect when `isAllowed` false
- [ ] `bumpsQueryVersion` types (cdf/density/pie) consistent with pipeline re-query
- [ ] forced `grain` matches what the query layer requests

```bash
rg "CHART_TYPE_REGISTRY|isAllowed|isGridChart|bumpsQueryVersion|clearWhenNotAllowed|grain" src/observable-plot-generator/chartTypeRegistry.ts -n
rg "^import" src/observable-plot-generator/chartTypeRegistry.ts -n   # must not import React/generators
rg "GRID_PLOT_GENERATORS" src/observable-plot-generator/observablePlotGenerator.ts -n
# Cross-check who else imports the registry (planning + reducer layers)
rg "chartTypeRegistry|CHART_TYPE_REGISTRY|getChartTypeDescriptor" src -l
```

## Overlay application (overlays/index.ts)

- [ ] Returns input object unchanged when no enabled overlays (immutability)
- [ ] Each overlay gated by `APPLICABILITY` / `OVERLAY_META.applicableTo` vs chart type
- [ ] Correct `orientation` (dependent axis) + `colorColumn` for per-group regression
- [ ] `hideSourceData` suppresses primary marks once, not duplicated
- [ ] Builders are pure `Plot.Markish` factories (no mutation of `options.marks`)

```bash
rg "applyOverlays|APPLICABILITY|OVERLAY_META|hideSourceData|shouldHideSource|orientation|colorColumn|enabled" src/observable-plot-generator/overlays/index.ts -n
rg "applyOverlays" src/observable-plot-generator -n   # call sites: coreGridGenerator / facetGenerator
rg "push|\.marks\s*=|\.\.\.options" src/observable-plot-generator/overlays/index.ts -n
```

## Grid & facet assembly

- [ ] `wrapAs1x1Grid`/`wrapTickStripAs1x1Grid`: min ≤ intrinsic; category count × BAR_STEP_PX × bandThicknessScale
- [ ] Category counting handles dotted ClickHouse column names
- [ ] Per-facet domains isolated (no global extent leaking into a facet)
- [ ] Each `isGridChart` lands in exactly one generator (no double render)

```bash
rg "wrapAs1x1Grid|wrapTickStripAs1x1Grid|BAR_STEP_PX|MIN_BAR_STEP_PX|bandThicknessScale|intrinsic" src/observable-plot-generator/rules/chartRules.ts -n
rg "planFacets|generateFacetedGrid|facetDomains|computeSharedDomainsForFaceting" src/observable-plot-generator/faceting -n
```

## Tests & verification gaps

- [ ] Existing: `chartTypeRegistry.test.ts`, `buildGridFromPlotResult.test.ts`, `gridModel.test.ts`, per-chart tests
- [ ] GAP: mixed-sign stacked domain extent test
- [ ] GAP: per-facet domain isolation test
- [ ] GAP: overlay immutability (input PlotOptions not mutated) test
- [ ] GAP: registry↔generator coverage (every isGridChart has a generator)

```bash
ls src/observable-plot-generator/**/*.test.ts src/observable-plot-generator/*.test.ts 2>/dev/null
rg "describe|it\(|test\(" src/observable-plot-generator/domains 2>/dev/null -n
```
