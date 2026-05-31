# Frontend Architecture Review — Investigation Checklist

Use while executing Steps 2–5 of [SKILL.md](SKILL.md). Skip irrelevant rows and note why.

## Dependency graph & cycles

### Primary: madge (via npx, no install)

```bash
cd frontend
npx --yes madge --circular --extensions ts,tsx src
npx --yes madge --circular --extensions ts,tsx src/components/Visualization src/observable-plot-generator
npx --yes madge --extensions ts,tsx --summary src | sort -t'(' -k2 -rn | head -30   # fan-in hotspots
npx --yes madge --extensions ts,tsx --orphans src                                    # dead modules
```

### Fallback: grep-based tracing (if madge unavailable)

```bash
# What does a suspected hub import, and who imports it?
rg "^import .* from '.*ChartArea" frontend/src --glob '*.{ts,tsx}'
rg "from '.*/observable-plot-generator" frontend/src --glob '*.{ts,tsx}' -l
# Barrel files that can create accidental cycles:
fd 'index.ts' frontend/src | head -40
rg "export \* from" frontend/src --glob 'index.ts'
```

### For each cycle

- [ ] Identify the back-edge (the upward/closing import)
- [ ] Classify: type-only / runtime / barrel-induced
- [ ] type-only → suggest `import type` or a shared `types.ts`
- [ ] runtime → flag init-order/bundling risk, propose dependency inversion
- [ ] barrel → suggest splitting the `index.ts` re-export

## Component wiring & state ownership

- [ ] Map where each major piece of state lives (which context/store/component)
- [ ] State hoisted higher than any consumer needs → wide re-render tax
- [ ] State trapped too low → prop drilling or lifting hacks
- [ ] Same prop drilled ≥3 hops through pass-through components
- [ ] Context created only to skip 1–2 hops (over-abstraction)
- [ ] Orchestrator passing 15+ props to one child → missing boundary
- [ ] Bidirectional parent↔child coupling (child dispatch + parent feeds derived state back)
- [ ] Hooks leaking raw refs / Plot options / SQL to components

```bash
rg "useContext\(|createContext" frontend/src --glob '*.{ts,tsx}' -c
wc -l frontend/src/components/Visualization/ChartArea/ChartArea.tsx \
      frontend/src/components/Visualization/ChartGrid/ChartGrid.tsx 2>/dev/null
# Count props on heavy children (eyeball the destructured props block):
rg "<ChartRenderer|<ChartGrid|<MultiPlotGrid|<PlotArea" frontend/src --glob '*.tsx'
```

## Observable Plot integration boundary

- [ ] `observable-plot-generator/` imports React / DOM / components? (should NOT)
- [ ] `ObservablePlot.tsx` effect deps — broad deps causing full re-plot every tick
- [ ] Prior plot SVG nodes cleaned up before re-plot
- [ ] Tooltip listeners (`addTooltipListeners`) and portals cleaned up
- [ ] Per-cell `ResizeObserver` — necessary per cell or hoistable?
- [ ] `PlotResult.layout` consumed (not recomputed) by the renderer
- [ ] Shared domains computed once and passed via `sharedDomainsOverride`; renderer doesn't recompute scales
- [ ] `onRenderComplete` / `useRenderingCoordinator` — every cell reports exactly once

```bash
rg "import .*(react|React|@observablehq/plot)" frontend/src/observable-plot-generator -n
rg "Plot\.plot\(" frontend/src --glob '*.{ts,tsx}'
rg "ResizeObserver|ReactDOM\.createPortal|createPortal" frontend/src/components/Visualization
rg "sharedDomainsOverride|computeSharedMeasureDomains|computeSharedDomainsForFaceting" frontend/src
```

## Chart-area layout & sizing

- [ ] `useScrollSync` is the single source of scroll truth (layers don't fight)
- [ ] `requestAnimationFrame` sync loop can't desync under fast scroll
- [ ] Bar intrinsic width (`barStep × categoryCount`) agreed between generator and renderer
- [ ] `useChartGridLayout` gutter/axis sizes (`dynamicXAxisPx`, `dynamicYAxisPx`, `leftFixedWidthPx`, `topHeaderHeight`) measured, not hard-coded
- [ ] `useRowHeightCalculation` + `useContainerDimensions` feedback loop guarded by `useStabilization`
- [ ] `useCellSizeOverrides` stored where data change won't wipe them; reset restores baseline
- [ ] X/Y axis Plot instances share domain + dimensions with their cells (alignment)
- [ ] `'fr'` cells hold readable minimum via `minmax()` in narrow containers
- [ ] `useDeferredValue(grid)` doesn't strand stale sizes on swap
- [ ] Fullscreen transition (portal target + container dims) handled
- [ ] Hard-coded scrollbar gutter (e.g. `14px`) — cross-platform safe?

```bash
rg "useScrollSync|requestAnimationFrame|translateY|translateX" frontend/src/components/Visualization/ChartGrid
rg "minmax|columnSizes|rowSizes|'fr'|barStep" frontend/src --glob '*.{ts,tsx}'
rg "useChartGridLayout|useRowHeightCalculation|useContainerDimensions|useStabilization|useCellSizeOverrides" frontend/src/components/Visualization/ChartGrid -l
rg "14px|scrollbarWidth|fullscreen" frontend/src/components/Visualization -i
```

## Doc/code drift to confirm

- [ ] `observable-plot.md` directory tree matches actual `observable-plot-generator/`
- [ ] `ChartArea.md` hook table matches actual hooks in `ChartArea/hooks/`
- [ ] `ChartGrid.md` three-layer description matches `MultiPlotGrid.tsx`
- [ ] `CONTEXTS.md` provider tree matches `contexts/` and the app entry

## Verification gaps to mention in report

- [ ] No automated cycle check in CI (`madge --circular`) — recommend adding
- [ ] No visual/layout regression tests for the grid sizing paths
</content>
