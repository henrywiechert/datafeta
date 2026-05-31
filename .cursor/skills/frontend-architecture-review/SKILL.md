---
name: frontend-architecture-review
description: >-
  Reviews the internal architecture of the React/TypeScript frontend: component
  dependency graph and import cycles, module boundaries, sub-optimal component
  wiring (prop drilling, misplaced state, leaky abstractions), and the Observable
  Plot integration including the chart area layout, grid sizing, and scroll/resize
  challenges. Use when the user asks for an architecture review, dependency/cycle
  analysis, component-wiring assessment, or a deep dive on the chart/plot rendering
  pipeline and its sizing behavior. This is distinct from frontend-react-review,
  which focuses on render performance, idioms, a11y, and code-level smells.
---

# Frontend Architecture Review

Review the frontend's **structural architecture** as a senior staff engineer.
This skill is about *how the pieces fit together*, not line-level code quality.

If the target frontend is not React/TypeScript or does not use Observable Plot, stop and inform the user that this skill does not apply; suggest a more appropriate review approach.

Focus on:

- **Module & component dependency graph** — layering, import cycles, fan-in/fan-out hotspots.
- **Component wiring** — where state lives, prop drilling vs context, orchestrator boundaries, leaky abstractions.
- **Observable Plot integration** — the generation pipeline, the React wrapper boundary, and where Plot concerns leak into React (or vice versa).
- **Chart area layout & sizing** — the multi-layer scrolling grid, intrinsic vs flexible sizing, ResizeObserver/scroll-sync coupling, and the known sizing challenges.

## Scope

- Default target: `frontend/src/`. If `frontend/src/` does not exist, search for a directory containing `package.json` with React dependencies and use that as the target; confirm with the user before proceeding.
- **Read the architecture docs first** — they are maintained and largely match the code:
  - [frontend/observable-plot.md](../../../frontend/observable-plot.md) — generation pipeline, `PlotResult`, grid sizing, scroll sync, sizing policy.
  - [frontend/src/components/Visualization/ChartArea/ChartArea.md](../../../frontend/src/components/Visualization/ChartArea/ChartArea.md) — orchestrator, hook composition, data flow.
  - [frontend/src/components/Visualization/ChartGrid/ChartGrid.md](../../../frontend/src/components/Visualization/ChartGrid/ChartGrid.md) — three-layer scrolling architecture.
  - [frontend/faceting.md](../../../frontend/faceting.md), [frontend/fields.md](../../../frontend/fields.md), [frontend/ui-management.md](../../../frontend/ui-management.md).
  - [frontend/src/contexts/CONTEXTS.md](../../../frontend/src/contexts/CONTEXTS.md) — provider tree and state ownership.
- If any listed doc is missing or unreadable, note it in the report under doc/code drift and proceed using code evidence only; do not block the review.
- **Review evidence in code**, not docs alone — docs can drift. Cite paths and line ranges for every significant finding, and call out doc/code drift when you find it.
- Quote at most 5–10 lines per finding; for larger structures cite path:line-range only. Target a report under ~2000 words.
- Do **not** refactor or fix unless the user asks. This skill produces a review report.

## Workflow

Copy and track progress:

```
Architecture Review Progress:
- [ ] Step 1: Map the module/component graph and layers
- [ ] Step 2: Run dependency-cycle and fan-out analysis
- [ ] Step 3: Assess component wiring and state ownership
- [ ] Step 4: Trace the Observable Plot integration boundary
- [ ] Step 5: Analyze chart-area layout and sizing
- [ ] Step 6: Synthesize prioritized findings
- [ ] Step 7: Deliver report
```

### Step 1: Map the module/component graph and layers

Establish the intended layering before judging violations. For this repo the layers are:

```
Pages → Components → Hooks → Contexts/Stores → API services
```

And the visualization sub-pipeline is:

```
ChartArea (orchestrator)
  → useChartGeneration → observable-plot-generator/  (pure spec generation)
  → ChartGrid (rendering engine: MultiPlotGrid → PlotArea → ObservablePlot)
```

Identify:

1. **Layer ownership** — which folders belong to which layer; what each layer is *allowed* to import.
2. **Orchestrators** — `ChartArea.tsx`, `ChartGrid.tsx`, page shells. These legitimately wire many hooks; judge whether they only *wire* or also *implement* domain logic.
3. **The generator/renderer seam** — `observable-plot-generator/` should be framework-free (pure functions producing `PlotResult`); `components/Visualization/` should own all React/DOM concerns. Flag leaks in either direction.

### Step 2: Run dependency-cycle and fan-out analysis

When shell access is available, use `madge` via `npx` (no install needed):

```bash
cd frontend
# Import cycles (the headline check):
npx --yes madge --circular --extensions ts,tsx src

# Per-area cycles (scope to the visualization subsystem):
npx --yes madge --circular --extensions ts,tsx src/components/Visualization src/observable-plot-generator

# Fan-in hotspots: which modules are depended on by the most others
npx --yes madge --extensions ts,tsx --summary src | sort -t'(' -k2 -rn | head -30

# Optional: emit a graph image if graphviz is available
npx --yes madge --extensions ts,tsx --image /tmp/fe-graph.svg src/components/Visualization
```

If `madge` is unavailable, fall back to grep-based import tracing (see [checklist.md](checklist.md)). If neither madge nor checklist.md is accessible, perform manual import tracing on the top-level files of each subsystem and explicitly note in the report that cycle detection is best-effort.

For every cycle reported:
- Locate the back-edge (the "upward" import that closes the loop).
- Classify: **type-only** (often benign, fixable with `import type`), **runtime** (risk of init-order bugs / fragile bundling), or **God-module** (a barrel/`index.ts` re-export creating accidental cycles).
- Recommend the minimal cut: extract a shared type module, invert a dependency, or split a barrel.

### Step 3: Assess component wiring and state ownership

For each major subtree, ask **where does state live and does it live at the right level?**

- **State placement** — is feature state hoisted higher than any consumer needs (forcing wide re-renders), or trapped lower than needed (forcing prop drilling / lifting hacks)?
- **Prop drilling vs context** — count hop depth for key props. Deep drilling of the *same* prop through pass-through components is a wiring smell; so is a context created only to dodge two hops.
- **Orchestrator bloat** — flag any non-orchestrator child receiving more than ~10 props, or any orchestrator (e.g. `ChartArea`, a page shell) passing >15 props of which most are forwarded unchanged. That often signals a missing intermediate boundary or a child that should read context directly.
- **Bidirectional coupling** — child calling parent dispatch *and* parent feeding child derived state from that dispatch. Map the loop; decide if it needs a coordinator or an inversion.
- **Leaky abstractions** — hooks that return raw DOM refs, Plot options, or SQL fragments to components that then re-interpret them. The abstraction should expose intent, not internals.
- **Barrel/index wiring** — `index.ts` re-exports that pull unrelated modules into the same dependency island.

See [checklist.md](checklist.md) for grep patterns.

### Step 4: Trace the Observable Plot integration boundary

The integration spans a *pure generator* and a *React wrapper*. Evaluate the seam:

- **Generator purity** (`observable-plot-generator/`): Does it import React, DOM, or component code? It should not. It consumes a `ChartGenerationContext` and returns a `PlotResult` (`plots[]`, `layout`, `sharedDomains`, `facetLabels`). Flag any React/DOM import here.
- **The wrapper boundary** (`ObservablePlot.tsx`): This is where `Plot.plot()` meets React. Inspect:
  - Effect dependencies that trigger a full re-plot (broad deps → every parent tick re-runs `Plot.plot`).
  - DOM ownership: Plot creates its own SVG; React must not also try to manage that subtree's children. Check cleanup of prior plot nodes, tooltip listeners (`addTooltipListeners`), and portals (`ReactDOM` tooltip portal, fullscreen portal target).
  - `ResizeObserver` per wrapper instance — multiplied across grid cells this is a known cost; confirm it is necessary per cell vs hoisted.
- **Spec vs render coupling**: `PlotResult.layout` (columnSizes/rowSizes, `'fr'` vs px) is computed in the generator but *consumed* by the grid. Verify the contract is explicit and not duplicated/recomputed on the render side.
- **Shared domains**: domains are computed once (`computeSharedMeasureDomains`, `computeSharedDomainsForFaceting`) and passed via `sharedDomainsOverride`. Confirm the renderer does not independently recompute scales (a correctness + consistency risk).
- **Rendering coordination**: `onRenderComplete`/`useRenderingCoordinator` track when all facet cells finish. Check for races (cells that never report, or report before paint).

### Step 5: Analyze chart-area layout and sizing

This is the subsystem with the most layout/sizing risk. Ground every finding in the three-layer model from [ChartGrid.md](../../../frontend/src/components/Visualization/ChartGrid/ChartGrid.md). Work through the sub-steps below one at a time.

#### Step 5a: Scroll architecture

- **The three-layer scroll architecture** (horizontal layer, vertical layer, plot grid with `translate`): Is scroll-sync (`useScrollSync`) the single source of truth, or do layers also scroll natively and fight each other? Look for `requestAnimationFrame` sync loops and whether they can desync under fast scroll.

#### Step 5b: Sizing strategy & measurement

- **Sizing strategy**: bar charts use **intrinsic px** (`barStep × categoryCount`); other charts use **`'fr'`** flexible cells with `minmax()`. Check:
  - Where intrinsic widths are computed and whether the generator and renderer agree on them.
  - `useChartGridLayout` outputs (`plotTemplateColumns`, `plotRowsSpec`, `dynamicXAxisPx`, `dynamicYAxisPx`, `leftFixedWidthPx`, `topHeaderHeight`) — are gutter/axis sizes measured or hard-coded? Hard-coded axis widths break with long tick labels.
  - `useRowHeightCalculation` + `useContainerDimensions` (ResizeObserver) — feedback loops: a layout change that resizes the container that retriggers layout. Look for `useStabilization` and judge whether it masks a real loop or just debounces.

#### Step 5c: Resize/override behavior

- **User resize overrides** (`useCellSizeOverrides`, `GridResizeOverlay`, `VirtualResizeLine`): how overrides compose with computed sizes, and how "reset" restores the baseline. Flag if overrides are stored at a level that gets blown away on data change.

#### Step 5d: Axis alignment

- **Axis alignment**: X/Y axes are rendered as separate Plot instances (`XAxes`, `YAxes`) that must align pixel-perfectly with the plot cells. Any divergence between the axis Plot's scale and the cell Plot's scale is a class of bug — check they share domains and dimensions.

#### Step 5e: Known-challenge probes

- **Known sizing challenges to probe**:
  - Long category labels overflowing intrinsic bar widths or fixed gutters.
  - `'fr'` cells collapsing below readable size when many columns + narrow container (does `minmax()` actually hold?).
  - Transition flicker on grid swap — `useDeferredValue(grid)` shows the old grid; confirm it doesn't strand stale sizes.
  - Fullscreen transitions changing the portal target and container dimensions mid-render.
  - Scrollbar width assumptions (e.g. hard-coded `14px` right gutter) across platforms.

### Step 6: Synthesize findings

For each finding, record:

- **Severity**: Critical / High / Medium / Low
- **Location**: file path (+ line range when useful)
- **Observation**: the structural fact (cycle, wiring, leak, sizing rule)
- **Impact**: maintainability cost, bug class, or user-visible layout effect
- **Recommendation**: concrete next step (one sentence)

Balance praise: call out clean seams already in place (pure generator, single scroll-sync source, shared-domain contract, stabilization that prevents thrash).

### Step 7: Deliver report

Use the output template below. Prefer diagrams (a dependency or layer sketch) and tables over prose.

## Output template

```markdown
# Frontend Architecture Review — Senior Staff Engineer

## Executive summary
[2–4 sentences: structural maturity, top structural risks, top strengths]

## Architecture map
[Brief layer/subsystem diagram or bullets: what imports what, where the seams are]

## Dependency graph & cycles
### Cycles found
| Cycle | Type (type-only/runtime/barrel) | Back-edge | Recommended cut |
|-------|--------------------------------|-----------|-----------------|
### Fan-in / fan-out hotspots
- …

## Component wiring & state ownership
### Working well
- …
### Concerns
- … (prop drilling depth, misplaced state, orchestrator bloat, leaky hooks)

## Observable Plot integration
### Generator/renderer seam
- … (purity, contract, shared-domain ownership)
### Wrapper boundary (ObservablePlot.tsx)
- … (re-plot triggers, DOM ownership, per-cell ResizeObserver)

## Chart-area layout & sizing
### Scroll architecture
- …
### Sizing strategy & measurement
- … (intrinsic vs fr, gutter/axis measured vs hard-coded, resize loops)
### Resize/override behavior
- … (override composition, reset baseline, override storage level)
### Axis alignment
- … (X/Y axis Plot scale vs cell Plot scale, shared domains/dimensions)
### Known-challenge probes
- … (long labels, fr collapse, swap flicker, fullscreen, scrollbar width)

## Prioritized recommendations
| Priority | Action | Effort |
|----------|--------|--------|
| P0 | … | … |

## Summary
[What to fix first structurally and why]
```

## Severity guide

| Level | When to use |
|-------|-------------|
| **Critical** | Runtime import cycle causing init-order/bundling bugs; generator depends on React breaking the seam; scroll/scale desync corrupting rendered data |
| **High** | Systemic mis-wiring (state in the wrong layer forcing wide re-renders), God-module fan-in, hard-coded sizing that breaks common data |
| **Medium** | Type-only cycles, localized prop drilling, leaky hook abstraction, debounce masking a layout loop |
| **Low** | Barrel hygiene, naming, doc/code drift, nice-to-have boundary extractions |

## Review principles

1. **Structure over style** — this skill judges boundaries and graphs; defer line-level smells to `frontend-react-review`.
2. **Evidence over docs** — verify the maintained docs against code; report drift explicitly.
3. **Name the seam** — for every coupling finding, state which boundary is violated and the minimal cut to restore it.
4. **Respect intentional tradeoffs** — `useDeferredValue` stale grid, per-cell ResizeObserver, separate axis Plot instances may be deliberate; explain the cost, don't assume a bug.
5. **Cycles: classify before condemning** — type-only cycles often warrant only `import type`; reserve Critical for runtime/init-order risk.
6. **Sizing is a contract** — generator-computed `layout` and renderer-consumed grid templates must agree; duplicated sizing math is a bug magnet.

## Additional resources

- Investigation checklist & grep/madge patterns: [checklist.md](checklist.md)
- Companion skill (code-level quality, perf, a11y): `frontend-react-review`
</content>
</invoke>
