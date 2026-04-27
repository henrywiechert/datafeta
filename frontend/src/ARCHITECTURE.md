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
