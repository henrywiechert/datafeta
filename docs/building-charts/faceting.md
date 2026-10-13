# Faceting (Small Multiples)

Faceting splits your chart into a grid of smaller charts, one per value of a dimension. This lets you compare patterns across groups without overlapping all the data into one chart.

---

## Creating a facet grid

Faceting comes from the axis shelves. A discrete field placed in front of the chart's own fields
on an axis splits the chart:

- **Column facets**: a discrete Dimension at the start of the **X** shelf gives one sub-chart per
  value, side by side, with the values as column headers.
- **Row facets**: a discrete Dimension at the start of the **Y** shelf gives one sub-chart per
  value, stacked.
- Use both together to create a full facet **grid** (M×N layout).

Discrete fields always come before continuous ones on a shelf, so on a scatter plot (continuous
fields on both axes) you can drop the facet field anywhere on the shelf. On a bar chart, the order
of the discrete fields decides the nesting. Drop the facet field at the *start* of the shelf so
that it becomes the outer level.

<video src="../../assets/snippets/faceted-bar-chart.webm" poster="../../assets/snippets/faceted-bar-chart.png" controls loop muted playsinline width="100%"></video>

The same works for scatter plots. Here `Datacenter` on X splits the scatter plot of every row
into one panel per datacenter:

<video src="../../assets/snippets/scatter-faceted.webm" poster="../../assets/snippets/scatter-faceted.png" controls loop muted playsinline width="100%"></video>

Colouring by another discrete Dimension adds a third grouping. Each server role forms its own
cluster in both panels:

<video src="../../assets/snippets/scatter-faceted-colored.webm" poster="../../assets/snippets/scatter-faceted-colored.png" controls loop muted playsinline width="100%"></video>

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
