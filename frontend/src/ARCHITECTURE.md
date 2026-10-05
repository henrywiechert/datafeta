# Frontend Architecture Notes

This directory favors explicit feature boundaries over broad aggregate imports.

## Import Boundaries

- Import hooks and services from concrete modules, such as
  `hooks/useGlobalFilters` or `services/queryExecutionOrchestrator`.
- Treat `hooks/index.ts` and `services/index.ts` as legacy compatibility
  surfaces, not as the preferred public API for new code.
- Use `types/index.ts` as the shared type hub when importing cross-domain app
  types. For deeply local code, importing from a narrower type module is also
  acceptable.
- Keep `observable-plot-generator` internals package-like: components should
  enter through `observablePlotGenerator` or documented helpers, while chart
  types and faceting internals should prefer sibling/internal imports.

## Planning Boundary

`viewPlanner` owns the semantic view shape. Query building and chart faceting
should reuse the same `ViewSpec` when they are part of the same chart render, so
query shape, pane partitioning, and render planning do not drift.

## Filter Boundary

Session-scoped filters live in `DataSourceContext`; sheet-scoped filters live in
`VisualizationContext`. Merge logic should go through `utils/effectiveFilters`
instead of being reimplemented in hooks or components.

## Encoding Fields

The single-field encoding shelves (color, size, shape, facet background) are
registered once in `utils/encodingFields.ts` (`ENCODING_FIELDS`). Query field
collection, cache hashes, schema/field validation and result remapping iterate
that registry, and the query hooks pass the fields as one `encodingFields`
object, so a new single-field channel does not need to be threaded through each
of them. Code that gives a channel a special role (color steering the point
budget, size as Gantt duration) still reads that channel by name.

Discrete palette channels (shape today) share three building blocks:
`deriveDiscretePaletteScale` (top-N + Other bucketing), `DiscreteEncodingLegendPanel`
and `DiscreteEncodingControl` (drop zone + manual picker). A new one supplies
its palette and swatch renderer.

## Chart Grid: Cell-Kind Model

The `ChartGrid` consumes a generic `GridResultModel` whose cells carry a
discriminated `GridCellContent` (`plot | pie | text | mark | empty`).
Renderers dispatch on `kind` in `PlotArea.tsx`; new chart-type *presentations*
(`'chart' | 'table' | 'pie'`) are centralized in
`observable-plot-generator/chartTypes/chartTypePresentation.ts` so consumers
like `ChartArea` and `tableViewUtils` do not string-match individual chart-type
ids. Auto-detection of the default chart type lives in
`detectDefaultUserChartType` (`observable-plot-generator/helpers/chartTypeResolver.ts`)
and is consumed by both the chart-generation pipeline and the chart-type
toggle UI. See `observable-plot-generator/ARCHITECTURE.md` for the detailed
extension model.
