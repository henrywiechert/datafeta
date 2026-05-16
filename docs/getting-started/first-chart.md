# Building Your First Chart

After connecting to a data source you are taken to the **Visualization workspace**. This is where you build and explore charts.

---

## Workspace layout

```
┌──────────────┬──────────────┬──────────────────────────────┐
│              │  Filters     │  [ X axis drop zone ]        │
│   Fields     │  ──────────  │  [ Y axis drop zone ]        │
│   Panel      │  Overrides   │  ────────────────────        │
│              │  ──────────  │                              │
│              │  Measure     │       Chart Area             │
│              │  Groups      │                              │
└──────────────┴──────────────┴──────────────────────────────┘
```

- **Fields panel** (left) — all columns from your data, grouped as Dimensions and Measures; also contains the database/table selector, virtual columns, and join controls
- **Middle panel** — stacked vertically from top to bottom:
    - **Filters** — drag fields here to filter; configure values and click Apply
    - **Field Overrides** — per-field chart type, color, and label settings
    - **Overlays / Measure Groups** — multi-metric and overlay configuration
- **Chart panel** (right) — at the top, two stacked drop zones:
    - **X axis drop zone** — drag a Dimension or Measure here for the horizontal axis
    - **Y axis drop zone** — drag a Dimension or Measure here for the vertical axis
    - Below the drop zones, the rendered chart fills the remaining space

All three panels are resizable by dragging the dividers, and each can be collapsed to give the chart more space.

Panels can be collapsed by clicking the `<` / `>` arrows on the resize handles to give the chart more room.

---

## Step-by-step: your first bar chart

### 1. Add a field to the X axis

Drag any **Dimension** (shown in blue) from the Fields panel and drop it on the **X axis** drop zone at the top of the chart area.

### 2. Add a field to the Y axis

Drag a **Measure** (shown in green/orange) and drop it on the **Y axis** drop zone. DataSlicer automatically runs the query and displays a bar chart.

### 3. Add colour

Drag a Dimension onto the **Color** drop zone. The bars are now split and colored by that dimension.

### 4. Filter the data

Drag any field from the Fields panel onto the **Filters** drop zone at the top of the middle panel. A filter card appears — check or uncheck values (for text fields) or set a range (for numeric/date fields). Click **Apply** to refresh the chart.

### 5. Save

Click the **Save** (💾) icon in the sheet tab bar to store the current configuration as a snapshot.

---

## Tips

- **Auto chart selection** — DataSlicer picks the best chart type for your field combination. You can override this in the Properties panel.
- **Swap axes** — Use the swap button between the X and Y drop zones to flip the orientation.
- **Undo / Redo** — Press `Cmd+Z` / `Cmd+Shift+Z` (macOS) or `Ctrl+Z` / `Ctrl+Y` (Windows) to undo or redo changes.
