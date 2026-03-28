# Chart Customization

Use the **Properties** panel on the right side of the workspace to customize how your chart looks.

---

## Color Scheme

Controls how the **Color** encoding is rendered.

- **Categorical palettes** (e.g. Tableau 10, Set1) — for Dimension fields with distinct values. Each value gets a unique colour.
- **Sequential / diverging palettes** (e.g. Viridis, Blues, RdBu) — for Measure fields on Color. Values are mapped to a colour gradient.

To change the palette, open **Color** in the Properties panel and select from the dropdown.

**Color bias** — a slider that shifts the luminance/saturation of the selected palette. Useful when the default colours are too light or dark for your display.

**Manual colour** — click any legend item to open a colour picker and assign a specific colour to one value.

---

## Size

When a Measure is placed on the **Size** drop zone:

- The **Size range** sliders in the Properties panel control the minimum and maximum mark size in pixels.
- Useful for bubble charts and tick strips where you want to emphasize differences in magnitude.

---

## Labels

- Toggle **Show Labels** in the Properties panel to display the measure value on each mark.
- Labels are automatically positioned to minimise overlap.

---

## Sort Order (Bar Charts)

In the Properties panel under **Sort**:

- **None** — bars appear in the natural data order.
- **Ascending** / **Descending** — bars are sorted by the measure value.
- You can choose which measure to sort by when multiple measures are present.

---

## Axis Formatting

- Axis tick labels are formatted automatically based on the field type (numbers use compact notation for large values, dates use locale-appropriate formats).
- To rename a field's axis label, right-click the field in the axis drop zone and choose **Rename**.

---

## Chart Type Override

See [Chart Types](chart-types.md) for details on forcing a specific chart type via the Properties panel.
