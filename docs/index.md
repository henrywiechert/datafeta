# DataSlicer User Manual

**DataSlicer** is an interactive web-based tool for exploring and visualizing data — without writing any code or SQL. Connect to your data, drag fields onto a chart, and instantly see the results.

---

## What you can do with DataSlicer

- **Connect to data** from CSV files, ClickHouse databases, Parquet files, or Kaggle datasets
- **Build charts** by drag-and-drop — bar, line, scatter, heatmap, timeline, and more
- **Filter and slice** your data interactively with checkboxes, sliders, and date pickers
- **Facet** charts into small multiples to compare groups side by side
- **Create computed fields** using SQL expressions and date binning
- **Save and share** your visualizations as snapshots

---

## Quick Start

1. Open DataSlicer in your browser.
2. On the **Connect** page, choose a data source and configure it (e.g. upload a CSV file).
3. Click **Connect** — you will be taken to the visualization workspace.
4. Drag a field from the **Fields** panel onto the **X axis** or **Y axis** drop zones.
5. DataSlicer automatically selects an appropriate chart type and runs the query.
6. Continue adding fields to color, size, filters, or as facets.
7. Use **Save** (💾) to store the current view as a snapshot.

---

## Navigation

| Section | What you'll find |
|---|---|
| [Getting Started](getting-started/connecting-data.md) | How to connect to your data and build your first chart |
| [Building Charts](building-charts/field-types.md) | Chart types, encodings, customization, faceting |
| [Filtering](filtering/discrete-filters.md) | All filter types — checkbox, range, date |
| [Advanced](advanced/virtual-columns.md) | Computed fields, joins, multi-sheet workspaces |
| [Saving & Sharing](saving-sharing/snapshots.md) | Snapshots, import/export, URL sharing |
| [Reference](reference/keyboard-shortcuts.md) | Keyboard shortcuts, connector details |

## Architecture diagrams

- [Backend architecture overview](reference/backend-architecture-overview.html)
- [Backend data source + plugin architecture](reference/backend-data-source-architecture.html)
