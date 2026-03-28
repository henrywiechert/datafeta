# Discrete Filters

Discrete filters let you include or exclude specific values of a text or low-cardinality dimension.

---

## Adding a discrete filter

Drag any **Dimension** (text, category, or low-cardinality date) onto the **Filters** drop zone.  
A filter panel opens below the chart showing the distinct values in that field.

---

## Selecting values

- **Check** a value to include it.
- **Uncheck** a value to exclude it.
- Use **Select All** / **Clear All** buttons to toggle everything at once.

Changes are staged (no query runs yet). Click **Apply** to execute the filter and refresh the chart.

---

## Searching for values

Type in the **search box** at the top of the filter panel to narrow down the value list. The search is case-insensitive and matches any substring.

**Regex search** — prefix your search term with `/` to use a regular expression. For example:  
`/^product_[AB]` matches all values starting with `product_A` or `product_B`.

---

## Values loading on demand

For large datasets with many distinct values, the filter list loads lazily — initially showing the first N values. Scroll down or search to load more.

---

## Removing a filter

Click the **×** on the filter pill in the filter bar, or drag the field off the Filters drop zone.
