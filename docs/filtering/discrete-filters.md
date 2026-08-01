# Discrete Filters

Discrete filters let you include or exclude specific values of a text or low-cardinality dimension.

---

## Adding a discrete filter

Drag any **Dimension** (text, category, or low-cardinality date) onto the **Filters** drop zone.  
A filter panel opens below the chart showing the distinct values in that field.

---

## Value lists: All vs Relevant

Each discrete filter has an **All | Relevant** control for its checkbox list (independent of Apply / the chart query):

| Mode | Option list |
|------|-------------|
| **All** (default) | Full column distinct values |
| **Relevant** | Distinct values constrained by **other discrete** filters’ current (draft) settings |

**Relevant changes only which values are visible, never which values are selected.** A value you checked
stays checked even when it drops out of the Relevant list, and it reappears (still checked) when you
switch back to **All** or relax the other filters.

- Switching mode refetches that filter’s list immediately — Apply is not required.
- In **Relevant** mode, editing another discrete filter’s draft selection refreshes this list (debounced).
  Unapplied (draft) sibling settings count, so you see the effect before pressing **Apply**.
- Select-all / “no effective restriction” siblings do not shrink other lists (same as chart query behavior).
- High-cardinality fields still use sampling + Query Regex; both honor sibling filters when Relevant.
- **Query Regex** is the one control that does rewrite the selection (it selects all matching values).

**JOIN note:** for a table-qualified field, both the value list and the distinct *count* resolve the field
to its source table and drop the JOIN, so that you see every distinct value of the column rather than only
the rows the JOIN matches. Sibling filters follow that rewrite: one on the *same* table applies normally,
while one on a *different* table is skipped rather than producing an error. A Relevant list on a JOIN is
therefore constrained only by siblings from its own table.

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
