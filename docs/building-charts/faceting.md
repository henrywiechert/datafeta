# Faceting (Small Multiples)

Faceting splits your chart into a grid of smaller charts, one per value of a dimension. This lets you compare patterns across groups without overlapping all the data into one chart.

---

## Creating a facet grid

Drag one or two Dimensions onto the **Facet** drop zones:

- **Column facet** — one sub-chart per column (values appear as column headers)
- **Row facet** — one sub-chart per row
- Use both together to create a full facet **grid** (MxN layout)

DataSlicer renders all charts with shared axis scales so values are directly comparable across panels.

---

## Facet headers

Each sub-chart has a label at the top (column facet) or left (row facet) showing the facet value. For long text values the labels are truncated — hover to see the full value.

---

## Scrolling large facet grids

If the number of facet values exceeds the screen area, the chart becomes scrollable. The axis labels and facet headers remain fixed while the chart content scrolls. Use the facet count control to limit how many values are shown.

---

## Background colors by facet

You can highlight specific facet rows or columns by dragging a Dimension onto the **Background** drop zone. Each value gets a distinct background colour, making it easy to identify groups at a glance.

---

## Shared vs. independent scales

By default all sub-charts share the same axis domain so they are directly comparable. This is usually what you want. If values vary enormously across facets, you can explore per-facet dynamic scaling by removing the measure from the shared axis.
