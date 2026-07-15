# Field Types & the Fields Panel

The **Fields panel** on the left lists every column available in your connected data. Fields are automatically classified along two independent axes: **Dimension vs. Measure** and **Discrete vs. Continuous**.

---

## Discrete vs. Continuous

This is the most fundamental property of a field — it determines how the chart encodes the field visually and what kind of axis or legend is produced.

| | Discrete | Continuous |
|---|---|---|
| **Values** | Finite, named categories | Numbers or a numeric range |
| **Axis type** | Categorical (one position per value) | Numeric / scaled |
| **Color legend** | Distinct colour per value | Colour gradient |
| **Chip colour in panel** | Blue | Green |

**Discrete** fields produce categorical groupings — the chart shows one band or position per distinct value.  
**Continuous** fields produce a numeric scale — the chart maps values to positions or sizes on a linear (or log) axis.

---

## Dimensions

Dimensions are fields used for **grouping, slicing, and labelling** — they are never aggregated.

They appear in the **Dimensions** section of the Fields panel.

### Discrete dimensions
Text and low-cardinality fields: `country`, `product_name`, `status`, `category`.  
Used to create categorical axes, split colour legends, and facet groups.

### Continuous dimensions
Date/time fields and numeric IDs: `order_date`, `timestamp`, `user_id`.  
Used when you want values placed on a true continuous scale — e.g. a timeline where the spacing between dates reflects elapsed time.

> **Note:** Date fields default to discrete mode (one tick per distinct date). Switch a date field to *continuous / timeline* mode in the field menu when you want proportional time-axis spacing.

Drag Dimensions to:

- **X axis** or **Y axis** — to group or scale the chart by that field
- **Color** — discrete → one colour per value; continuous → colour gradient
- **Filters** — checkbox list (discrete) or date range picker (continuous)
- **Facet** — to create a separate sub-chart per value (discrete)

---

## Measures

Measures are **numeric fields that must be aggregated** before they can be plotted (sum, average, min, max, count, …).

They appear in the **Measures** section of the Fields panel.

### Continuous measures
The common case: `revenue`, `temperature`, `duration_ms`, `price`.  
Values are placed on a linear scale; every standard aggregation applies.

### Discrete measures
Count-like or integer-range fields: star ratings, boolean flags, small enumerations.  
Treated categorically even though the underlying data type is numeric.

### Latest / Earliest value

Besides the standard aggregations (sum, average, min, max, count, …), a measure can use **Latest value** or **Earliest value**: the value of the field at the row where a chosen datetime column is largest or smallest within each group. This is the natural "closing value per bucket" for gauge-like columns — e.g. the closing weight of a hive per day, rather than its sum or average.

Right-click a measure chip and choose **Latest value (by …)** / **Earliest value (by …)**. If the table has a single datetime column it is used automatically; otherwise pick the ordering column from the submenu.

!!! note
    Latest/Earliest value is not yet available on stacked (union) tables.

Drag Measures to:

- **X axis** or **Y axis** — to compute an aggregate for each group
- **Size** — to scale mark size by a numeric value
- **Color** — applies a gradient colour scale
- **Tooltip** — to show a value on hover without plotting it

### Table calculations

A measure on an axis can carry a **table calculation** — a second computation applied *after* aggregation:

- **Difference** — the change relative to the previous bucket. Useful for cumulative columns (e.g. an ever-increasing `weight` gauge): bucket the time axis by day or week and the chart shows the *increase per day/week*. The first bucket of each series is empty (there is no previous value).
- **% Difference** — the change relative to the previous bucket as a fraction of that bucket's value (`0.05` = +5 %). Empty for the first bucket of each series and when the previous value is 0.
- **Running Sum** — the cumulative total up to and including each bucket.

Right-click a measure chip on an axis and choose **Table Calculation**. The option requires an ordering dimension on the shelf — typically a datetime field with a timeline bucket (day, week, month, …); any other dimensions (colour, facets) each get their own independent series. The ordering dimension may also live on the **Tooltip** shelf — handy for measure-vs-measure scatter plots where the time bucket defines the grain but is not plotted. If the ordering dimension is later removed, the calculation is ignored until one is added again.

!!! example "Daily weight increase vs. temperature"
    To plot the *per-day increase of a hive's closing weight* against the *daily maximum temperature* as a scatter chart:

    1. Drag `timestamp` to **Tooltip** and set it to **Day** (timeline) — this defines the per-day grain.
    2. Drag `hive_weight` to **X**, choose **Latest value (by timestamp)**, then **Table Calculation → Difference**.
    3. Drag `temperature` to **Y**, choose **max**.

    Each point is one day; hovering shows the date.

!!! note
    Gaps in the time series are not filled in: if a bucket has no data, **Difference** compares against the last bucket that *does* have data.

---

## Axis ordering rule

On each axis, **discrete fields always come before continuous fields**. DataSlicer enforces this automatically when you drag multiple fields onto the same axis. The discrete fields define the categorical grouping; the continuous field provides the scale within each group.

---

## Field chip appearance

Field chips in the panel are colour-coded:

| Chip colour | Classification |
|---|---|
| Blue background | Discrete (dimension or measure) |
| Green background | Continuous (dimension or measure) |

The symbol `ƒ` on a chip indicates a **virtual / calculated column**.

---

## Renaming fields

Right-click a field in the Fields panel and choose **Rename** to give it a display alias. The original column name in the data is not changed.

---

## Drag-and-drop rules

- You can drag a field to **multiple drop zones** (e.g. a Dimension on both X axis and Color).
- Drag an item already on a drop zone to **reorder** it (for multi-field axes).
- Click **×** on a chip in a drop zone to remove it.
- Hold `Shift` while clicking to select multiple fields, then drag them all at once.
