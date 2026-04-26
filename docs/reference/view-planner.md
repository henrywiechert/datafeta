# View Planner Semantics

Datafeta uses a visual specification: users place fields on axes and encoding controls, then the frontend derives a query and a chart layout from that state. The view planner makes those derived rules explicit without adding more shelves to the UI.

## Current Rules

- X and Y axis fields preserve user order. Discrete fields partition the display into panes; continuous dimensions and measures become in-pane positional axes.
- Facets are implicit. X-axis discrete dimensions become column facets, and Y-axis discrete dimensions become row facets. Chart generators may reserve one discrete field as a category axis when the chart type needs one.
- Measures use explicit aggregations when present. If measures appear on exactly one axis, the query path defaults them to an aggregation so bar and line charts summarize instead of returning raw rows.
- Color, size, shape, facet background, label, and tooltip fields can affect the query as well as rendering. Query planning must include fields needed to draw marks and tooltips, not just positional fields.
- Distribution chart families can request specialized grains such as CDF and box-plot summary queries.
- Measure Groups are the preferred structure for multi-measure charts. They represent related measures that share a comparison frame, not arbitrary independent layers.

## Planner Boundaries

The planner should describe the user's intended view before SQL or Observable Plot options are produced. It is intentionally conservative:

- It preserves the existing `QueryDescription` contract for backend and DuckDB execution.
- It keeps implicit facets as an internal rule rather than introducing visible facet shelves.
- It models domain policy as data so shared, independent, per-facet, and measure-group domains are explicit.
- It treats selections separately from filters so brushing can later become either zoom filters, linked selections, or relational inputs to another view.

## Why This Exists

The same semantic decisions currently appear in several places: query field collection, raw vs aggregated query selection, faceting, chart-type inference, Measure Groups, and DuckDB cache planning. A canonical `ViewSpec`/`RenderPlan` lets those modules share one explanation of the view while still allowing each layer to keep its specialized implementation details.
