# Chart Types

DataSlicer automatically selects the most appropriate chart type based on the fields you place on the axes. You can also override the selection manually in the **Properties** panel.

---

## Bar Chart

**Best for:** comparing values across discrete categories.

- Place a Dimension on one axis and a Measure on the other.
- Bars can be **grouped** (side-by-side) or **stacked** when a Color field is present.
- Sort bars by the measure value (ascending or descending) using the sort controls in the Properties panel.

---

## Line Chart

**Best for:** trends over time or ordered categories.

- Typically a Date/DateTime Dimension on X and a Measure on Y.
- Multiple lines appear when a Color Dimension is added.
- Works well for comparing multiple measures using [Measure Groups](measure-groups.md).

---

## Scatter Plot

**Best for:** correlation between two numeric measures.

- Place a Measure on X and a different Measure on Y.
- Add a Dimension to **Color** to distinguish groups.
- Add a Measure to **Size** to create a bubble chart.

---

## Tick Strip

**Best for:** distribution of a single measure without aggregation.

- Place a Measure on one axis; leave the other axis empty or use a low-cardinality Dimension.
- Each row in the data is drawn as an individual tick mark.
- Useful for seeing the spread and outliers in raw data.

---

## Cell Chart (Heatmap)

**Best for:** showing a value at the intersection of two categorical dimensions.

- Place a Dimension on X and a Dimension on Y.
- Add a Measure to **Color** — the cell is filled with a colour gradient.

---

## Gantt Chart

**Best for:** intervals and timelines (start/end events).

- Requires a Date or DateTime field defining the **start** time and another for the **end** time on the X axis.
- Each row is drawn as a horizontal bar spanning the interval.

---

## CDF Chart

**Best for:** cumulative distribution of a numeric measure.

- Place a Measure on the X axis.
- Each data point shows "what fraction of values are below this value".
- Useful for latency, response time, and percentile analysis.

---

## Overriding the chart type

In the **Properties** panel → **Chart Type**, use the dropdown to force a specific type. Choosing **Auto** returns control to DataSlicer's automatic selection.

---

## Multi-mark charts

You can combine chart types in a single view using [Measure Groups](measure-groups.md) — for example bars for one metric and a line overlay for another.
