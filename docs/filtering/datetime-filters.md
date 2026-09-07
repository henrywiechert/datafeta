# DateTime Filters

DateTime filters let you restrict the data to a specific time period.

---

## Adding a DateTime filter

Drag any **Date** or **DateTime** field onto the **Filters** drop zone.  
A date range picker opens.

---

## Picking a date range

1. Click the **start date** field and choose a date from the calendar, or type it directly (`YYYY-MM-DD`).
2. Click the **end date** field and set the upper bound.
3. Both ends of the range are **inclusive**.
4. Click **Apply** to refresh the chart.

---

## Time component

For DateTime fields (with hours/minutes/seconds), additional time inputs appear alongside the date pickers so you can set precise timestamps.

---

## Quick presets

Common relative ranges (e.g. "Last 7 Days", "This Month") are offered in the **Preset** dropdown above the date inputs. The list depends on the field's datetime part (hour/day/month/year presets differ).

### Presets stay relative

A preset is remembered as such, not just as the dates it resolved to. When a saved configuration or snapshot is loaded, every "now"-anchored preset is recalculated against the current time — a snapshot saved with "Last 7 Days" ten days ago still shows the last 7 days, not the week it was saved in. The same happens when a browser tab is reopened later.

Editing a start or end date by hand switches the filter to **Custom range**, which is then restored exactly as saved. "All Time" is bounded by the data rather than by the clock, so its stored range is kept as well.

---

## Removing a DateTime filter

Click the **×** on the filter pill in the filter bar.
