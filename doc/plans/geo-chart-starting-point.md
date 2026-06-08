# Geo chart — design starting point

Locked product and technical decisions for the **point map** chart type. Implementation follows this doc; choropleth and map-driven filtering are explicitly out of MVP.

---

## Locked decisions

| # | Topic | Decision |
|---|--------|----------|
| 1 | **MVP scope** | **Point map only** (lon/lat rows + encodings). Choropleth, routes, H3/geohash → later. |
| 2 | **Axis UX** | **Generic X/Y shelves**; user selects chart type **`map`**. No dedicated geo-only shelf UI in MVP. |
| 3 | **Lon/lat convention** | **Enforce X = longitude, Y = latitude.** Validation error if types/ranges fail; no auto-swap. |
| 4 | **Basemap** | **Vector outline basemap** (bundled world/country polygons). **No raster tiles**, no third-party tile API, no API keys in MVP. |
| 5 | **Facet extent** | **Fit projection domain per facet** to that facet’s points (shared projection *type*, independent *bounds* per cell). |
| 6 | **Non-map chart types** | If axes look like geo (lon/lat continuous pair) but chart type is **not** `map` (e.g. auto → scatter), **show a warning** — do not block rendering. |
| 7 | **Map interaction split** | **Phase 1:** pan/zoom for **navigation only** (explore the viewport; no filter/query side effects). **No bbox brush → filter** until Phase 2. |
| 8 | **Observable Plot** | Stay on **`@observablehq/plot` ^0.6.17**; no version bump for this feature. Verify at implementation time that `projection` + `Plot.geo` + positioned marks meet MVP needs. |
| 9 | **Map view state** | Pan/zoom offsets are **transient view state** (like `ganttZoomRange`): **not persisted**, **not undoable**, reset when data or home extent changes. Saved **`extentMode`** (`data` \| `world`) sets the **home** view only. |

---

## Mental model

- User puts **one continuous dimension on X (longitude)** and **one on Y (latitude)**.
- **`globalChartType: 'map'`** renders a **grid-level chart** (like `heatmap`): **country/coastline outlines** under **point marks** per row, with existing channels (color, size, shape, label, tooltip, facet background).
- **Faceting**: discrete dimensions on shelves become row/column facets via `planFacets` → `coordinateFacetedGrid`; each facet cell is its own map with **extent fit to that cell’s data** (or full world when `extentMode: 'world'`).
- **Shared encodings across facets**: color and size domains match heatmap/scatter faceting (global domain from full dataset, local filter per cell).
- **Home vs view**: `extentMode` + data bounds define the **home** projection domain. Optional pan/zoom moves to a **view** domain per cell without changing filters or saved config.

Lat/lng on axes define **where each row is drawn**. Choropleth (region polygons filled by measure) and user-supplied region keys are **phase 2+**; MVP outlines are **context only** (fixed geometry, not driven by data).

---

## Architecture fit

| Area | Approach |
|------|----------|
| Chart type | Add `'map'` to `UserChartType`; register in `CHART_TYPE_REGISTRY` with `isGridChart: true`, `grain: 'rawRows'`, `bumpsQueryVersion` as needed. |
| Generator | New `mapChart.ts` (or similar), dispatched from `observablePlotGenerator` like `heatmapChart.ts`. |
| Cell grid | **Bypass** N×M `cellCharts` when `map` is active; consume exactly one X + one Y continuous field. |
| `isAllowed` | Exactly one continuous dimension on X and one on Y; both numeric float/integer; no measure on both axes (measures on size shelf OK). Extra discrete dims → facets, not third spatial axis. |
| Query | `rawRows` grain; same hybrid local/backend path as scatter; scatter point budgets apply. |
| CRS | **WGS84** assumed; no reprojection in MVP. |
| Overlays | Disable regression / MA overlays for `map`. |
| Basemap | **`Plot.geo`** (or equivalent) with bundled **TopoJSON/GeoJSON**; same `projection` as data points. |
| Pan/zoom | **Client-side only** — adjust projection `domain` (or equivalent) and re-render; **no query refetch**, **no cache invalidation**. |

**Why grid-level:** Two continuous dims today auto-resolve to **scatter** per cell. Map is projection + outline layer + per-facet bounds—not a scatter variant.

**Why vector outlines (not tiles):** Single stack inside Observable Plot—no MapLibre/tile URL, no signup, no CSP/proxy for tile keys, simpler deploy. Tradeoff: no street-level detail; land/coast context only unless we add richer geometry later.

---

## Coordinate contract (MVP)

- **X column** → longitude ∈ [-180, 180]
- **Y column** → latitude ∈ [-90, 90]
- Null/non-finite rows: drop at render (and optionally count for UI message)
- Invalid range: mark field invalid or show chart-level message (match existing empty-state patterns)
- DMS, geohash, H3, ClickHouse `Point`, WKT: **out of scope** unless pre-split into two numeric columns (virtual columns allowed)
- **No auto-detect** from column names for axis assignment—only explicit X/Y placement

---

## Vector outline basemap (MVP)

Requirements:

- **Bundled** simplified world map (countries and/or land mask)—e.g. Natural Earth–style topology, shipped as TopoJSON/GeoJSON in `frontend`.
- Rendered with Observable Plot **`projection`** + **`Plot.geo`** beneath **`Plot.dot`** (points on top).
- **Attribution** in UI or chart footer (dataset license, e.g. Natural Earth — match chosen asset).
- **No runtime fetch** of basemap per session in MVP (avoid CDN dependency and flash); optional lazy load later.
- Outline style: stroke only (no fill), neutral color (e.g. light gray), low opacity so points read clearly.

**Projection (MVP):** single global default (`equal-earth`); user-selectable projection → phase 2. Per-facet **domain fit** to data bounds (or `Sphere` in world mode); outline geometry clips to visible projection as Plot handles.

**Domain fit note:** use **`MultiPoint` bbox corners** for `projection.domain`, not a `Polygon` ring — on equal-earth, `geoPath().bounds(polygon)` spans the full frame and Plot never zooms in.

**Performance:** use **simplified** topology (110m scale); consider clipping to facet bbox only if profiling shows cost with many facets.

**Edge cases:** single point (padding on fit), antimeridian-spanning sets (fit policy TBD), empty facet → message cell.

---

## Faceting

- Reuse `coordinateFacetedGrid` + `FacetCellContext`
- **Per facet:** filter rows → compute lon/lat bounds → set projection `domain` for that cell; draw same outline dataset under facet’s projection
- **Pan/zoom:** each facet cell has **independent** transient view state (keyed by `plotId`)
- **Across facets:** shared color/size scales from full `queryResult.rows` (same as heatmap)
- Facet labels: existing `facetLabelUtils`
- **Facet zoom dialog** (`FacetZoomDialog`): same pan/zoom behavior as in-grid cells

---

## Geo scatter warning (decision 6)

When **all** of:

- `globalChartType` is null or a non-map type, and
- resolved pair is continuous × continuous on X/Y, and
- fields pass a light **geo heuristic** (e.g. column name contains `lon`/`lng`/`long`/`latitude`/`lat`),

show non-blocking banner: *“Longitude/latitude on both axes; Cartesian scatter may be misleading—try Map chart type.”*

Heuristic details can be minimal in MVP; warning must not fire on every continuous×continuous pair.

---

## Interactions

### Phase 1 (MVP)

| Feature | Phase 1 |
|---------|---------|
| Tooltip, legend, color/size/shape | Yes |
| Facet background | Yes |
| Extent mode toggle (`data` / `world`) | Yes — sets **home** view |
| Map pan/zoom | **Yes** — navigation only, transient per cell |
| Brush / zoom → filter | **No** |
| Cross-filter click | **No** (unless already free via tooltips) |
| Data labels | Same sampling rules as scatter; may defer if cluttered |

### Phase 2+ (does not conflict with Phase 1 nav)

| Feature | Phase | Notes |
|---------|-------|-------|
| Map brush → bbox **filter** | 2 | Separate interaction mode from nav pan/zoom; writes a `Filter`, not view state |
| Projection picker | 2 | Changes projection *type*; nav zoom still applies on top |
| Choropleth / raster tiles | 2 | Same projection stack; more marks/layers |
| Zoom-aware re-fetch / clustering | 3 | May *listen* to view bounds; optional backend detail — not required for Phase 1 nav |

**Critical product line:** navigation zoom changes **what you see**; filter brush (Phase 2) changes **which rows are in the dataset**. Phase 1 must never dispatch filter actions from pan/zoom.

---

## Map navigation — Phase 1 spec

### Gestures

| Input | Action |
|-------|--------|
| **Drag** (primary button) | Pan |
| **Wheel** (pointer over map cell) | Zoom in/out toward cursor |
| **Double-click** | Reset cell to home extent |
| **Esc** (map cell focused / hovered) | Reset cell to home extent |
| **Shift + wheel** on page | Allow normal page scroll (wheel alone over map is captured) |

No modifier required for pan. No bbox drag selection in Phase 1.

### Home extent

Derived from saved `chartTypeParams.map.extentMode`:

- **`data`:** padded lon/lat bounds of that cell’s rows (`computeGeoBounds` + `boundsToProjectionDomain`)
- **`world`:** `{ type: 'Sphere' }` + world aspect ratio

Changing `extentMode`, query result, or axis fields **clears all map view overrides** (back to home).

### Limits

- Clamp zoom so view cannot shrink below ~2× minimum home span (avoid degenerate domains)
- Clamp pan so some portion of home bounds remains visible (avoid panning to empty ocean-only frames) — exact policy TBD in spike; start with clamping view bbox inside expanded home bbox

### UX hints

- Map chart type tooltip already mentions extent menu; add short hint: *“Drag to pan, wheel to zoom, double-click to reset.”*
- Optional: small reset icon overlay on hover (defer if gesture hints suffice)

---

## State model

### Persisted (`chartTypeParams.map`)

```ts
map: {
  extentMode: 'data' | 'world';   // home view — implemented
  // phase 2: projection?: string;
  outlineOpacity?: number;
  fitPadding?: number;
}
```

### Transient (not in `chartTypeParams`, not in sheet export, not undoable)

Mirror the **`ganttZoomRange`** pattern documented in `VisualizationContext/types.ts`:

```ts
/** Geographic view bounds override for one map cell; null = use home extent. */
type MapViewBounds = [lonMin, latMin, lonMax, latMax];

/** Keyed by plot cell id (same ids used in gridModel / FacetZoomDialog). */
mapViewByPlotId: Record<string, MapViewBounds | null>;
```

Actions (tentative):

- `SET_MAP_VIEW_BOUNDS` — `{ plotId, bounds }`
- `RESET_MAP_VIEW` — `{ plotId }`
- `RESET_ALL_MAP_VIEWS` — clear entire record (on query/extent/axes change)

**Do not** add `mapViewByPlotId` to `persistedKeys`, `computeChartConfigHash`, or undo snapshots.

---

## `chartTypeParams` vs view state (summary)

| Setting | Stored where | Affects query? |
|---------|--------------|----------------|
| `extentMode` | `chartTypeParams.map` (saved) | No |
| Pan/zoom view bounds | `mapViewByPlotId` (transient) | No |
| Phase 2 bbox brush filter | `Filter` / filter tier | Yes |

---

## Phasing

### Phase 1 — MVP

**Shipped:**

- Point map, WGS84, X=lon Y=lat, bundled vector outlines (`world-atlas` + `Plot.geo`)
- Per-facet fit; `extentMode` toggle (`data` / `world`)
- Channels + faceting + query `rawRows` + scatter budgets
- Registry + `isAllowed` + geo scatter warning
- Brush disabled for `map` chart type

**Remaining (Phase 1):**

- **Navigation pan/zoom** (this doc § Map navigation — Phase 1 spec)
- Manual QA on antimeridian facets (if needed)

### Phase 2

- Choropleth (region key + measure + join to same or richer geometry)
- **Map brush → bbox filter** (distinct from nav pan/zoom; toolbar toggle or modifier gesture)
- Projection picker
- Optional **raster tile** basemap (provider + API key)
- Stronger geo column detection / ClickHouse geo types

### Phase 3

- Clustering, density on map, routes, non-WGS84
- Optional zoom-aware backend detail (re-aggregate or fetch when view bounds cross threshold)

---

## Implementation plan — navigation pan/zoom

Ordered steps for a focused PR. Each step should be testable in isolation.

### Step 1 — Types & transient state

**Files:** `VisualizationContext/types.ts`, `initialState.ts`, new reducer case in `axisReducer.ts` or small `mapViewReducer.ts`, `persistedKeys.ts` (confirm exclusion)

1. Add `MapViewBounds` type and `mapViewByPlotId: Record<string, MapViewBounds | null>` to `VisualizationState` (default `{}`).
2. Add actions: `SET_MAP_VIEW_BOUNDS`, `RESET_MAP_VIEW`, `RESET_ALL_MAP_VIEWS`.
3. Document alongside `ganttZoomRange`: transient, not persisted, not undoable.

**Verify:** reducer tests; loading old sheets ignores missing field.

### Step 2 — Home bounds metadata from generator

**Files:** `mapChart.ts`, `mapUtils.ts`

1. In `buildMapOptions`, compute **home bounds** before applying any view override:
   - `data` mode: padded geo bounds of cell rows
   - `world` mode: `[-180, -90, 180, 90]` (logical home for clamping; domain still uses `Sphere`)
2. Export on plot options (private metadata, like `__mapAspectRatio`):
   - `__mapInteractive: true`
   - `__mapHomeBounds: MapViewBounds`
   - `__mapPlotId: string` (stable cell id from grid)
3. Accept optional `viewBounds?: MapViewBounds | null` in `MapOptionsInput`; when set, use `boundsToProjectionDomain(viewBounds)` instead of home domain (world mode: still allow zoom-in from Sphere home).

**Verify:** `mapChart.test.ts` — view override narrows domain MultiPoint corners.

### Step 3 — Wire view state into chart generation

**Files:** `ChartArea.tsx`, `useChartGeneration.ts`, `mapChart.ts` / `generateMapGrid`, facet coordinator if plot ids need threading

1. Read `mapViewByPlotId` from visualization state.
2. Pass into `ChartGenerationContext` as `mapViewByPlotId` (or resolve per cell inside `createMapCellGenerator` using plot id from facet position — prefer explicit plot id on context/cell).
3. **Reset** `mapViewByPlotId` via `RESET_ALL_MAP_VIEWS` when:
   - `queryVersion` changes
   - `chartTypeParams.map.extentMode` changes
   - lon/lat axis fields change
   - sheet switch (existing load path)

**Verify:** toggling extent mode returns to home; pan state does not survive reload.

### Step 4 — Geographic view math

**Files:** `mapUtils.ts`, `mapUtils.test.ts`

Add pure helpers (names tentative):

```ts
// Zoom view bounds toward a pixel anchor; k > 1 zooms in.
zoomMapViewBounds(home, view, k, anchorLonLat): MapViewBounds

// Pan view bounds by geographic delta.
panMapViewBounds(view, dLon, dLat, home): MapViewBounds

// Clamp view inside expanded home (pan limits) and min span (zoom limits).
clampMapViewBounds(view, home): MapViewBounds
```

Implementation approach: treat view as lon/lat bbox (consistent with existing `boundsToProjectionDomain`). Convert wheel anchor from pixel → lon/lat using inverse of Plot’s fitted projection (read scale/translate from rendered SVG or recompute `d3.geoEqualEarth` with same frame size as Plot).

**Alternative (simpler v1):** store `{ k, tx, ty }` scale/translate relative to home projection fit; apply via custom `projection: ({ width, height }) => …` function. Prefer **bbox** if Phase 2 brush filter should reuse the same coordinate mental model.

**Verify:** unit tests for zoom in/out, pan clamp, reset to home.

### Step 5 — Attach d3-zoom in renderer

**Files:** `ObservablePlot.tsx`, new `frontend/src/components/Visualization/map/useMapPanZoom.ts`

Plot **0.6.17** has no built-in geographic zoom. Use **d3-zoom** on the plot SVG (add direct dependency `d3-zoom` + `d3-selection`).

1. After `Plot.plot()` when `options.__mapInteractive`:
   - Select plot `<svg>` (or frame rect)
   - Attach zoom behavior: `filter` wheel events when pointer over cell; `preventDefault` on wheel
   - On `zoom` event: compute new view bounds → call `onMapViewChange(plotId, bounds)` (debounced ~100–150 ms, same order of magnitude as Gantt)
   - On `dblclick`: `onMapViewReset(plotId)`
2. Cleanup zoom listener on unmount / options change (same pattern as tooltip cleanup in `ObservablePlot`).

**Do not** full `Plot.plot()` on every wheel tick if debounce suffices — regenerate only when bounds change settles to avoid facet grid jank.

**Verify:** manual — drag pans, wheel zooms, tooltips still work after re-render.

### Step 6 — ChartGrid / ChartArea wiring

**Files:** `ChartArea.tsx`, `PlotArea.tsx`, `FacetZoomDialog.tsx`, optional `ChartGrid` `map` prop group (mirror `gantt`)

1. Pass callbacks from `ChartArea` → grid → `ObservablePlot`:
   - `onMapViewChange(plotId, bounds)`
   - `onMapViewReset(plotId)`
2. Dispatch `SET_MAP_VIEW_BOUNDS` / `RESET_MAP_VIEW`.
3. Enable **Esc** reset via keyboard handler when map cell hovered (extend `useScrollSync` or local handler — avoid conflating with Gantt WASD).
4. Wire **FacetZoomDialog** with same callbacks for the zoomed plot id.

**Verify:** 2×2 faceted map — each cell pans independently; dialog map pans; Esc resets active cell only.

### Step 7 — Tests & manual QA

**Automated:**

- `mapUtils.test.ts` — view math, clamp, reset
- `mapChart.test.ts` — view override domain
- Reducer tests for map view actions
- Optional: `useMapPanZoom` integration test with jsdom + mocked SVG

**Manual checklist:**

- GB-only data: home = region; wheel zooms toward cursor; double-click restores home
- `world` mode: home = full globe; can zoom into region; reset restores globe
- Facet grid: no cross-cell bleed; performance acceptable for 4×4
- Wheel over map does not scroll page; Shift+wheel still scrolls
- Extent toggle clears pan/zoom
- Filter change / re-query clears pan/zoom
- Saved sheet reload does not restore pan/zoom

---

## Testing (MVP overall)

- Golden: `isAllowed`, view grain, query fields for map type
- Render: cities fixture, empty facet, single point, 2×2 facets
- Warning: lon/lat + scatter does not block; map type clears warning
- Extent: `data` vs `world` domain and aspect ratio
- Nav (when implemented): view bounds override, reset, transient state exclusion from persistence hash
- Manual: outlines visible at world/regional zoom, facet fit with disparate regions, bundle size acceptable

---

## Resolved spikes

| Spike | Status |
|-------|--------|
| Plot 0.6.17 — `projection` + `Plot.geo` + `Plot.dot` | **Done** |
| Topology asset — `world-atlas` countries-110m | **Done** |
| Pan/zoom without filter | **Planned** — § Implementation plan (bbox view state + d3-zoom) |
| Antimeridian facet fit | **Open** — manual QA |

---

## Reference

Prior discussion captured exploratory options (including raster tiles); **decision #4 is vector outlines**. Navigation pan/zoom is **in Phase 1**; filter brush remains **Phase 2**. This file is the source of truth.
