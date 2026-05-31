---
name: frontend-plot-generator-review
description: >-
  Review the Observable Plot generator subsystem (frontend/src/observable-plot-generator/)
  for CORRECTNESS and PURITY of chart spec generation: chart-type rule selection,
  shared domain computation (measure/numeric/faceted), overlay application,
  grid/facet assembly, and the layering contract (no React/DOM in the generator,
  no domain recomputation in the renderer). Use when changing rules/, domains/,
  chartTypes/, overlays/, faceting/, the registry, or when investigating wrong
  axis scales, mis-stacked bars, dropped overlays, wrong chart-type auto-detect,
  or facet domain bleed.
---

# Observable Plot Generator Review

A correctness- and purity-focused review of the chart spec generator. Bugs here are
visual but data-driven: a domain that clips real values, a stacked bar that uses the
wrong extent, an overlay applied to the wrong axis, or a chart type auto-selected
against its own `isAllowed` guard. The generator is also a **pure transformation
layer** — `ChartGenerationContext → PlotResult` — and that purity is a load-bearing
invariant (it lets the registry be imported by the query-planning and reducer layers
without cycles). This skill guards both the math and the boundary.

Focus areas, in priority order:

1. **Generator purity / layering** — no React, no DOM, no recompute that belongs upstream.
2. **Shared domain correctness** — measure stacking (mixed sign, per-facet), numeric/timeline extents, padding.
3. **Chart-type rule selection** — `chartRules` + `chartTypeRegistry` agreement, `isAllowed`/`clearWhenNotAllowed`.
4. **Overlay application** — applicability gating, axis/orientation, source-data suppression, immutability.
5. **Grid & facet assembly** — layout sizing, facet domain isolation, grid-generator routing.
6. **Doc/code drift** — ARCHITECTURE.md claims vs implementation.

## Scope

In scope (under `frontend/src/observable-plot-generator/`):
- `observablePlotGenerator.ts` (entry), `chartTypeRegistry.ts`, `rules/chartRules.ts`.
- `domains/measureDomains.ts`, `domains/numericDomains.ts`.
- `overlays/` (index orchestrator + builders), `faceting/`, `grid/`, `chartTypes/`, `analysis/fieldAnalysis.ts`.

Out of scope (defer to the named skill):
- Where the data came from (routing/cache/Arrow) → **frontend-query-pipeline-review**.
- Datetime part/bin semantics and the UTC contract → **frontend-datetime-review**.
- React rendering of the produced `PlotResult` (the grid components) → **frontend-architecture-review** / **frontend-react-review**.

The generator consumes already-decoded rows and already-derived datetime parts; this
skill assumes those are correct and reviews only the spec it builds from them.

## Workflow

Track progress with this checklist; mark each step as you complete it.

- [ ] 1. Map the generator entry → branch → emit flow
- [ ] 2. Verify generator purity (no React/DOM/window leaks)
- [ ] 3. Verify the renderer does not recompute shared domains
- [ ] 4. Audit measure domain stacking (mixed sign, per-facet, padding)
- [ ] 5. Audit numeric/timeline domain extents (no stack-overflow spread, date handling)
- [ ] 6. Audit chart-type selection (rules vs registry, isAllowed, version bumps)
- [ ] 7. Audit overlay application (gating, axis, suppression, immutability)
- [ ] 8. Audit grid/facet assembly (sizing, facet isolation, routing)
- [ ] 9. Check tests + verification gaps
- [ ] 10. Synthesize and deliver the report

Use [checklist.md](checklist.md) for concrete grep commands per step.

### Step 1 — Map the flow

Read [ARCHITECTURE.md](../../frontend/src/observable-plot-generator/ARCHITECTURE.md), then
trace the entry in [observablePlotGenerator.ts](../../frontend/src/observable-plot-generator/observablePlotGenerator.ts):
validate → `normalizeTimelineData` → `analyzeFields` → faceting decision → branch into
`GRID_PLOT_GENERATORS` (cdf/density/pie/heatmap/table) vs the cartesian/cell pipeline
(`generateCartesianPlots`) vs faceted (`generateFacetedGrid`). Note that the registry
decides *whether* a type is active; this map decides *how* it renders. Confirm the two
agree (every `isGridChart: true` type has a generator in `GRID_PLOT_GENERATORS` or a
dedicated branch).

### Step 2 — Generator purity

The generator must be a pure data→spec transform. Grep the whole subsystem for
`from 'react'`, `react-dom`, `document.`, `window.` (excluding prose comments). The only
allowed external is `@observablehq/plot`. A real leak (a render-time `window`/`document`
access, a React import) is **High** — it breaks the layering contract that lets the
registry be imported from the planning/reducer layers. Distinguish a genuine API use
from the literal word "window" inside a comment.

### Step 3 — Renderer must not recompute domains

Shared domains are computed once in the generator (`computeSharedDomainsFromContext` →
`computeSharedMeasureDomains` / `computeSharedNumericDomains`) and threaded through. The
React rendering layer (`src/components/Visualization`) must NOT call
`computeSharedMeasureDomains` / `computeSharedDomainsForFaceting` itself — doing so
risks a second, inconsistent extent. Grep the components dir; **zero** call sites is the
expected, correct state. Any hit is a finding.

### Step 4 — Measure domain stacking

In [measureDomains.ts](../../frontend/src/observable-plot-generator/domains/measureDomains.ts),
`computeSharedMeasureDomains` has three regimes — verify each:
- **color + category (stacked):** positive and negative stacks summed *separately* per `(facet, category)` key so mixed-sign data keeps the true extent. Confirm the facet key (`facetColumnNames.join('|')`) cannot collide across facets, and that `__global__` is used when no facets.
- **color, no category:** pos/neg totalled globally.
- **neither:** raw per-row min/max.
Then: empty/all-NaN → `[0,1]` fallback; `min==max==0` → `[0,1]`; `DOMAIN_PAD_RATIO`
headroom added to both sides preserving negatives. A finding: padding that shifts a
zero baseline, or a stacked extent computed from raw rows instead of stack totals.

### Step 5 — Numeric / timeline extents

In [numericDomains.ts](../../frontend/src/observable-plot-generator/domains/numericDomains.ts):
- Timeline branch explicitly avoids `Math.min(...hugeArray)` / `Math.max(...hugeArray)` (stack overflow on large data) — confirm any new extent code uses a reduce loop, not spread.
- `dateTimeMode === 'timeline'` (camelCase) detection; the `date_mode` snake_case fallback is a compatibility smell — confirm which one actually arrives.
- `__min` / `__max` summary-column shortcut: when present, extent is taken from precomputed summary columns; confirm the fallback to row scan is correct when absent.
- Measure key = result/alias column name; dimension key = original `columnName`. A
  mismatch silently yields an empty domain → autoscale.

### Step 6 — Chart-type selection

Two cooperating deciders:
- [chartTypeRegistry.ts](../../frontend/src/observable-plot-generator/chartTypeRegistry.ts) — metadata only (`isAllowed`, `grain`, `bumpsQueryVersion`, `isGridChart`, `clearWhenNotAllowed`). It must hold NO generator/React refs (it is imported by planning + reducer layers).
- [chartRules.ts](../../frontend/src/observable-plot-generator/rules/chartRules.ts) — per-pair auto-detection (bar/line/scatter/box/tick).
Verify: a type whose `isAllowed` returns false with `clearWhenNotAllowed` actually falls
back to auto-detect (pie); `bumpsQueryVersion` types (cdf/density/pie) are consistent
with the pipeline's re-query expectation; `grain` forced by a type matches what the
query layer requests. A registry/rule disagreement (type rendered when not allowed, or
allowed but no generator) is **High**.

### Step 7 — Overlay application

In [overlays/index.ts](../../frontend/src/observable-plot-generator/overlays/index.ts),
`applyOverlays` must:
- Filter to `enabled` overlays, return the **original object unchanged** when none apply (immutability — never mutate input `PlotOptions`).
- Gate each overlay by `APPLICABILITY` (from `OVERLAY_META.applicableTo`) against the chart type — an overlay applied to an unsupported type is a finding.
- Use the correct `orientation` (which axis is the dependent/value variable) and `colorColumn` for per-group regression.
- Honor `hideSourceData` by suppressing primary marks exactly once, not duplicating.
Builders (`linearRegression`, `movingAverage`, `density`) must be pure `Plot.Markish`
factories. A regression fit on the wrong axis, or an overlay that mutates `options.marks`
in place, is the classic bug.

### Step 8 — Grid & facet assembly

- 1×1 wrapping (`wrapAs1x1Grid`, `wrapTickStripAs1x1Grid`) sizing: intrinsic vs min sizes derived from category count × `BAR_STEP_PX`/`MIN_BAR_STEP_PX` × `bandThicknessScale`. Confirm min ≤ intrinsic and category counting handles dotted ClickHouse column names.
- Faceting: per-facet domains are isolated (Step 4 facet key) so one facet's extremes don't inflate another's axis. Confirm `planFacets`/`generateFacetedGrid` thread the per-facet domain, not the global one.
- Grid routing: each `isGridChart` type lands in exactly one generator; no double-render.

### Step 9 — Tests & gaps

Existing tests include: `chartTypeRegistry.test.ts`, `buildGridFromPlotResult.test.ts`,
`gridModel.test.ts`, and per-chart tests (`barChart.test.ts`, `lineChart.test.ts`,
`pieChart.test.ts`, `heatmapChart.test.ts`, `densityChart.test.ts`, `cdfChart.test.ts`,
`tableGrid.test.ts`, `tickStrip.test.ts`, `chartTypePresentation.test.ts`). Note gaps:
is there a test for mixed-sign stacked domain extent? per-facet domain isolation? overlay
immutability (input not mutated)? the registry↔generator coverage (every `isGridChart`
has a generator)?

### Step 10 — Synthesize & deliver

Produce the report below. Ground every claim in file+line. Keep purity findings separate
from math findings, and confirm the "expected-zero" checks (Steps 2–3) actually returned
zero in this run rather than asserting from memory.

## Output template

```markdown
# Observable Plot Generator Review

## Summary
<2–4 sentences: purity status, domain-correctness posture, biggest risk.>

## Invariant checks (must be zero)
| Check | Expected | Found | Evidence |
| --- | --- | --- | --- |
| React/DOM/window leaks in generator | 0 | … | file:line or "none" |
| Renderer recomputes shared domains | 0 | … | … |
| isGridChart types without a generator | 0 | … | … |

## Findings
### [Critical|High|Medium|Low] <title>
- **Where:** file:line
- **What:** <incorrect behavior>
- **Why it matters:** <visual/data impact>
- **Fix:** <concrete change>

## Domain audit
<stacking regimes, padding, timeline extent — each confirmed correct or flagged.>

## Verification gaps
<missing stacking/facet-isolation/overlay-immutability tests.>
```

## Severity guide

- **Critical** — a shared domain that clips real data values (wrong extent reaches the axis), or a stacked domain computed from raw rows so mixed-sign bars render wrong.
- **High** — generator purity leak (React/DOM/window) breaking the layering contract; renderer recomputing domains; registry/rule disagreement rendering a disallowed chart type; overlay on the wrong axis.
- **Medium** — overlay mutates input `PlotOptions`; facet domain bleed; min>intrinsic sizing; `Math.min(...spread)` on large arrays.
- **Low** — doc/code drift in ARCHITECTURE.md; naming; dead `date_mode` snake_case fallback.

## Review principles

- **Pure in, pure out.** The generator is `context → PlotResult`; any React/DOM/window touch or input mutation is a contract break, not a style nit.
- **Compute the domain once.** Two extents for the same measure means one is wrong; the renderer recomputing is the smell to hunt.
- **Stacks are not rows.** A stacked extent must come from per-(facet,category) stack totals with pos/neg separated — never from raw row min/max.
- **The registry decides whether; the generator decides how — and they must agree.** Every active/allowed type needs exactly one generator; every disallowed-but-selected type must fall back.
- **Spread is a footgun on big data.** Extent via `Math.min(...arr)` overflows; reduce loops are mandatory.
- **Confirm the zeros live.** Purity and recompute checks must be re-run this session, not recalled.

## Additional resources

- [ARCHITECTURE.md](../../frontend/src/observable-plot-generator/ARCHITECTURE.md) — data flow + module map (verify against code).
- [README.md](../../frontend/src/observable-plot-generator/README.md), [CHART_TYPES.md](../../frontend/src/observable-plot-generator/chartTypes/CHART_TYPES.md).
- [checklist.md](checklist.md) — concrete grep commands per step.
- Pairs with **frontend-architecture-review** (boundaries), **frontend-datetime-review** (timeline domain inputs), **frontend-query-pipeline-review** (the rows it consumes).
