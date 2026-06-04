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
| 7 | **Map zoom / brush** | **No filter-from-map in MVP** (no bbox brush → filter pipeline). Pan/zoom for navigation only is in scope if cheap; otherwise static extent per facet. |
| 8 | **Observable Plot** | Stay on **`@observablehq/plot` ^0.6.17**; no version bump for this feature. Verify at implementation time that `projection` + `Plot.geo` + positioned marks meet MVP needs. |

---

## Mental model

- User puts **one continuous dimension on X (longitude)** and **one on Y (latitude)**.
- **`globalChartType: 'map'`** renders a **grid-level chart** (like `heatmap`): **country/coastline outlines** under **point marks** per row, with existing channels (color, size, shape, label, tooltip, facet background).
- **Faceting**: discrete dimensions on shelves become row/column facets via `planFacets` → `coordinateFacetedGrid`; each facet cell is its own map with **extent fit to that cell’s data**.
- **Shared encodings across facets**: color and size domains match heatmap/scatter faceting (global domain from full dataset, local filter per cell).

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

- **Bundled** simplified world map (countries and/or land mask)—e.g. Natural Earth–style topology, shipped as TopoJSON/GeoJSON in `frontend` (exact asset TBD in spike).
- Rendered with Observable Plot **`projection`** + **`Plot.geo`** beneath **`Plot.dot`** (points on top).
- **Attribution** in UI or chart footer (dataset license, e.g. Natural Earth / OpenStreetMap-derived—match chosen asset).
- **No runtime fetch** of basemap per session in MVP (avoid CDN dependency and flash); optional lazy load later.
- Outline style: stroke only (no fill), neutral color (e.g. light gray), low opacity so points read clearly.

**Projection (MVP):** single global default (e.g. `equal-earth` or `mercator`); user-selectable projection → phase 2. Per-facet **domain fit** to data bounds; outline geometry clips to visible projection as Plot handles.

**Performance:** use **simplified** topology (110m or 50m scale, not 10m); consider clipping to facet bbox only if profiling shows cost with many facets.

**Edge cases:** single point (padding on fit), antimeridian-spanning sets (fit policy TBD in spike), empty facet → `messageOptions` empty cell.

---

## Faceting

- Reuse `coordinateFacetedGrid` + `FacetCellContext`
- **Per facet:** filter rows → compute lon/lat bounds → set projection `domain` (or equivalent fit) for that cell; draw same outline dataset under facet’s projection
- **Across facets:** shared color/size scales from full `queryResult.rows` (same as heatmap)
- Facet labels: existing `facetLabelUtils`

---

## Geo scatter warning (decision 6)

When **all** of:

- `globalChartType` is null or a non-map type, and
- resolved pair is continuous × continuous on X/Y, and
- fields pass a light **geo heuristic** (e.g. column name contains `lon`/`lng`/`long`/`latitude`/`lat`, or user flagged column cast)—optional heuristic,

show non-blocking banner: *“Longitude/latitude on both axes; Cartesian scatter may be misleading—try Map chart type.”*

Heuristic details can be minimal in MVP; warning must not fire on every continuous×continuous pair.

---

## Interactions (MVP)

| Feature | MVP |
|---------|-----|
| Tooltip, legend, color/size/shape | Yes |
| Facet background | Yes |
| Map pan/zoom | Optional (navigation only) |
| Brush / zoom → filter | **No** |
| Cross-filter click | **No** (unless already free via tooltips) |
| Data labels | Same sampling rules as scatter; may defer if cluttered |

---

## `chartTypeParams` (saved config)

Extend state (names tentative):

```ts
map: {
  // phase 2: projection?: string;
  outlineOpacity?: number;
  fitPadding?: number;    // degrees or ratio — TBD in spike
}
```

Bump saved-config schema version when added.

---

## Phasing

### Phase 1 — MVP (this doc)

- Point map, WGS84, X=lon Y=lat, **bundled vector outlines**, per-facet fit
- Channels + faceting + query `rawRows` + scatter budgets
- Registry + `isAllowed` + geo scatter warning
- Plot 0.6.17 spike: `projection` + `Plot.geo` + dots

### Phase 2

- Choropleth (region key + measure + join to same or richer geometry)
- Map brush → bbox filter; projection picker
- Optional **raster tile** basemap (provider + API key) for users who want street/satellite detail
- Stronger geo column detection / ClickHouse geo types

### Phase 3

- Clustering, density on map, routes, non-WGS84

---

## Testing (MVP)

- Golden: `isAllowed`, view grain, query fields for map type
- Render: cities fixture, empty facet, single point, 2×2 facets
- Warning: lon/lat + scatter does not block; map type clears warning
- Manual: outlines visible at world/regional zoom, facet fit with disparate regions, bundle size acceptable

---

## Open implementation spikes (not blocking decisions)

1. Plot **0.6.17** — confirm `projection`, `Plot.geo`, and `Plot.dot` in one plot.
2. **Topology asset** — which file (Natural Earth TopoJSON vs world-atlas), simplification level, license string for attribution, gzip size in bundle.
3. **Antimeridian** fit when facet spans Pacific.
4. **Pan/zoom** without filter: update projection domain + redraw geo layer, or defer to static maps in MVP.

---

## Reference

Prior discussion captured exploratory options (including raster tiles); **decision #4 is now vector outlines**. This file is the source of truth.
