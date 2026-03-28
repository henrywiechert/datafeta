# Measure Groups (Multiple Metrics)

Measure Groups let you plot **multiple numeric metrics side by side** in the same chart, each with its own colour, mark type, and axis.

---

## When to use Measure Groups

Use Measure Groups when you want to compare several metrics that share the same X axis — for example, plotting `revenue` and `cost` as bars over time, or overlaying a `target` line on top of an `actual` bar.

---

## Adding multiple measures

1. Drag a second (or third, fourth…) Measure onto the same axis drop zone where the first measure already lives.  
   DataSlicer automatically activates the **MeasureValues** mode.

2. A **Measure Groups panel** appears in the Properties area, listing all active measures.

---

## Customizing per measure

In the Measure Groups panel, each measure has its own row where you can set:

| Option | Description |
|---|---|
| **Chart type** | Override the mark type for just this measure (bar, line, scatter, tick) |
| **Color** | Assign a specific colour to this measure's marks |
| **Axis** | Assign to the primary or secondary Y axis |

---

## Combined bar + line example

1. Drag `revenue` (Measure) to the Y axis → bar chart appears.
2. Drag `target` (Measure) to the same Y axis → Measure Groups activates.
3. In the Measure Groups panel, set `target` chart type to **Line**.
4. Result: bars for revenue with a line overlay for the target.
