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

Drag Measures to:

- **X axis** or **Y axis** — to compute an aggregate for each group
- **Size** — to scale mark size by a numeric value
- **Color** — applies a gradient colour scale
- **Tooltip** — to show a value on hover without plotting it

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
