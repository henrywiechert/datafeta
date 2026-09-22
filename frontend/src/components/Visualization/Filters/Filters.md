# Filters Module

The **Filters** module provides the UI and logic for filtering data in the visualization. It supports three filter types (discrete, continuous, datetime) and a two-tier filter architecture (base vs. refinement) for efficient local filtering.

---

## Module Structure

```
Filters/
├── FilterPanel.tsx              # Top-level panel with Apply button
├── FilterDropZone.tsx           # Drop zone container for filter fields
├── FilterFieldChip.tsx          # Expandable chip with embedded controls
├── DiscreteFilterControl.tsx    # Checkbox list with search/regex
├── ContinuousFilterControl.tsx  # Slider + text inputs for numeric range
├── DateTimeFilterControl.tsx    # Date pickers (legacy, simple)
└── *.module.css                 # Scoped styles for each component
```

---

## Component Hierarchy

```
FilterPanel
└── FilterDropZone
    └── FilterFieldChip (per field)
        ├── Lock/Unlock Toggle (base vs refinement tier)
        ├── FieldChip (reuses unified chip component)
        ├── Expand/Collapse Button
        └── Collapse
            └── [DiscreteFilterControl | ContinuousFilterControl | DateTimeRangeFilter]
```

---

## Component Responsibilities

### FilterPanel

| Aspect | Description |
|--------|-------------|
| Role | Pure view with Apply button; writes config changes through to context draft |
| Props | `filterFields`, `filterConfigurations`, `filterMetadata`, callbacks |
| State | None — draft lives in VisualizationContext / DataSourceContext |
| Pattern | Edits write through immediately; Apply commits draft → applied for the chart |

**Key behavior**: Config edits update the draft layer immediately (no panel-local copy). The chart still only re-queries when **Apply** copies draft → `appliedFilterConfigurations`.

### FilterDropZone

| Aspect | Description |
|--------|-------------|
| Role | Drag-and-drop target for adding filter fields |
| Features | Handles unified payload format (always arrays), deduplicates drops |
| Empty state | Shows "Filters" placeholder |
| Chip order | Session filters come first in the merged list, but `useFilterController` remembers the displayed order (`stabilizeFilterFieldOrder`) so a scope toggle does not move the chip. Order resets to session-first on sheet switch / reload. |

### FilterFieldChip

| Aspect | Description |
|--------|-------------|
| Role | Expandable filter container with tier toggle and embedded controls |
| Props | `field`, `filterConfig`, `filterMetadata`, callbacks |
| State | `expanded` (collapse state), `isBaseFilter` (tier toggle) |

**Key features**:
- **Lock icon**: Toggle between base (🔒) and refinement (🔓) filter
- **Summary text**: Shows selection count or range in chip label
- **Filter type detection**: Auto-selects control based on field properties
- **Reuses `FieldChip`**: Consistent styling with axis/panel chips

### DiscreteFilterControl

| Aspect | Description |
|--------|-------------|
| Role | Multi-select checkbox list with client-side filtering |
| Features | Search/regex filter, All/None + Invert selection, compact LIKE preview for sampled lists |
| Optimization | Memoized `CheckboxItem` for performant large lists |

**Special handling**:
- Type-safe selection matching (`"1"` vs `1` after JSON round-trip)
- Null value display as `(null)`
- Numeric vs. alphabetic sorting auto-detection
- Partial results warning with Query Regex backend filter option
- **Respect other filters** toggle (on = constrain options by sibling discrete filters; off = full list)
- **Selection | Pattern** match mode, shown only when the value list is sampled (`metadata.isPartial`)
  or when the filter is already in pattern mode, so a saved pattern config stays editable. On a
  column small enough to enumerate, the checkbox list is the complete answer and LIKE adds nothing.

### ContinuousFilterControl

| Aspect | Description |
|--------|-------------|
| Role | Numeric range filter with slider and text inputs |
| Features | Dual-thumb slider, min/max text fields, smart step calculation |
| State | Local slider/text state for smooth drag interaction |

### DateTimeFilterControl

| Aspect | Description |
|--------|-------------|
| Role | Simple date range picker (legacy) |
| Note | For full datetime fields without parts. `DateTimeRangeFilter` from `DateTime/` module is used for part-based datetime fields |

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         FilterPanel (pure view)                  │
│  filterConfigurations (draft from context) ───────────────────┐  │
│                                                               │  │
│  ┌──────────────────────────────────────────────────────────┐ │  │
│  │                     FilterDropZone                        │ │  │
│  │  ┌──────────────────────────────────────────────────────┐│ │  │
│  │  │              FilterFieldChip × N                      ││ │  │
│  │  │  ┌─────────────────────────────────────────────────┐ ││ │  │
│  │  │  │ [🔒/🔓] [FieldChip: "price (5 selected)"] [▼]   │ ││ │  │
│  │  │  ├─────────────────────────────────────────────────┤ ││ │  │
│  │  │  │ DiscreteFilterControl / ContinuousFilterControl │ ││ │  │
│  │  │  └─────────────────────────────────────────────────┘ ││ │  │
│  │  └──────────────────────────────────────────────────────┘│ │  │
│  └──────────────────────────────────────────────────────────┘ │  │
│                                                               │  │
│  [Apply Button] ── onApplyFilters() ──────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
              onConfigChange (write-through draft)
                              ▼
              VisualizationContext.filterConfigurations
              (+ session draft in DataSourceContext)
                              │
                    APPLY_FILTERS
                              ▼
              appliedFilterConfigurations → chart query
```

**Scope routing**: `mergeFilterMetadata` / `mergeFilterConfigurations` let the session (global) store win over the sheet reducer. A write into the sheet reducer for a session filter is therefore not merely redundant — it is *invisible*, and the stale session copy stays on screen. `useFilterMetadata` is fed the merged field list and cannot tell the two apart, so it dispatches through `useFilterStoreDispatch`, which sends `SET_FILTER_METADATA`, `SET_FILTER_CONFIGURATION` and `SET_AND_APPLY_FILTER_CONFIGURATION_SILENT` to the session store for session fields and lets everything else fall through. `useFilterConfigWriter` does the same for panel edits.

**All / Relevant discrete lists**: Each discrete card can load either the full value universe (**All**, default) or values constrained by other discrete filters' draft settings (**Relevant**). `useRelevantValueLists` watches the draft configs and refetches a Relevant list when a sibling's *effective* constraints change (debounced 300 ms; the skip-hash is computed over the converted `Filter[]`, so UI-only edits and select-all siblings do not trigger a fetch).

Relevant is a view mode: the only config field the toggle writes is `valueListMode`. Selections are never rewritten — only `refetchFilterValues(..., { applySelectionFromResult: true })`, used by Query Regex, does that. `totalAvailableCount` is likewise only ever set from an unconstrained, non-partial list, so the query builder's "all values selected ⇒ omit IN (...)" shortcut stays correct.

Every discrete value list — the cold-start fetch, Query Regex, and All/Relevant refreshes — goes through one function, `fetchDiscreteValueList` in `useFilterMetadata`. It counts the distinct values, samples (`SAMPLE_SIZE` random values) instead of listing them once the count exceeds `DISCRETE_FULL_LIST_MAX`, and reports back `{ count, values, sampled, constrained }`. Callers only decide how to phrase the warning and what to do with the result, so the threshold, the sibling constraints, and `constrainedByOtherFilters` cannot drift apart between the two entry points.

Both `/distinct-count` and `/query` receive the same converted `Filter[]`, and both re-scope them the same way for a table-qualified field on a JOIN: the field resolves to its source table, the JOIN is dropped, and `scope_filters_to_table` (backend) strips the resolved table's prefix from siblings while skipping siblings that belong to another table. Sampling threshold and value list therefore stay in agreement.

**Table-scope changes**: Adding or removing a table changes which values exist behind every filter, so `useFilterMetadata` refetches *all* filter fields whenever the serialized table scope — primary database, primary table, UNION secondaries, and the `virtualTable` a JOIN produces — differs from the previous render. The per-field effect cannot cover this: it only fires when a field is new or changed its own semantics, and a field survives a table change untouched. Without the scope effect, every discrete picker keeps listing the values of the tables that were there before.

That refresh passes `reconcileToValueUniverse`, which brings the draft discrete config back in line with the list just fetched:

| Previous state | After the table change |
|----------------|------------------------|
| Everything selected (`selectedValues.length >= totalAvailableCount`) | Everything selected again, including the values a new table brought in — the user asked for no filtering on that column, not for the old value set |
| Partial selection | Picks kept; values that no longer exist are dropped |
| Pattern mode, sampled list, or a Relevant-constrained list | Left alone — none of them names a value universe that can be reconciled |

While the refresh is in flight the loading placeholder carries the previous value list forward (for the same column only), so the picker takes `DiscreteFilterControl`'s delayed-overlay path rather than collapsing to a spinner.

`totalAvailableCount` is always refreshed to the new cardinality, because the query builder compares the selection size against it to decide it can omit `IN (...)`. The write goes through `SET_AND_APPLY_FILTER_CONFIGURATION_SILENT` (draft *and* applied, no `queryVersion` bump): the table change re-queries anyway, and leaving the applied copy behind would let the picker and the chart disagree about which values the filter names.

`metadata.constrainedByOtherFilters` marks a list that was fetched under sibling filters. `FilterFieldChip` must not derive `totalAvailableCount` or `excludedValues` from such a list — both describe the column's full value universe, and deriving them from a Relevant subset makes "all visible selected" look like "all values selected" (filter dropped) or turns `NOT IN` into a pass for every value outside the list.

---

## Filter Tier Architecture

The module supports a **two-tier filter system** managed by `filterTierManager`:

| Tier | Icon | Behavior | Cache Impact |
|------|------|----------|--------------|
| **Base** | 🔒 | Sent to backend, affects query | Invalidates cache, triggers re-fetch |
| **Refinement** | 🔓 | Applied locally via DuckDB WASM | Instant, no network, uses cached data |

**Benefits**:
- Users can refine locally after initial data fetch
- No network round-trip for exploration filters
- Base filters can be "locked" for expensive server-side operations

**API** (`filterTierManager`):
- `isBaseFilter(columnName)` — check tier
- `categorizeFilters(configs)` — split into base/refinement
- `buildRefinementWhereClause(refinementFilters)` — generate DuckDB SQL
- `getBaseFilterHash()` — cache key component

---

## Filter Type Detection

`FilterFieldChip.getFilterType()` determines which control to render:

```
field.dataType === 'datetime' && field.dateTimePart
  → 'discrete' (datetime parts like "month" become categorical)

field.dataType === 'datetime'
  → 'datetime' (full datetime range picker)

field.flavour === 'discrete'
  → 'discrete' (checkbox list)

else
  → 'continuous' (slider/range)
```

---

## External Connections

| Connection | Direction | Description |
|------------|-----------|-------------|
| `VisualizationContext` | ↔ | Reads `filterFields`, `filterConfigurations`, `filterMetadata`; dispatches `UPDATE_FIELD` |
| `useFilterStoreDispatch` | → | Routes `useFilterMetadata`'s per-field writes to the store that wins the merge — session store for global filters, sheet reducer otherwise |
| `filterTierManager` | → | Checks/sets base vs. refinement tier per column |
| `FieldChip` module | → | Reuses unified chip component for consistent styling |
| `DateTime` module | → | Uses `DateTimeRangeFilter` for part-based datetime filtering |
| Parent (`useFilterOperations`) | ← | Receives callbacks: `onDrop`, `onRemove`, `onConfigChange`, `onApplyFilters`, `onRefetchValues` |

---

## Key Patterns

### 1. Draft / Apply Pattern
```tsx
// FilterPanel: write-through to context draft; Apply commits to chart
onConfigChange(fieldId, config); // → SET_FILTER_CONFIGURATION (no query)
onApplyFilters();                // → APPLY_FILTERS (draft → applied, bumps queryVersion)
```

The Apply control lights up (amber, contained) when merged draft configs differ from applied
(sheet + session); it is muted/disabled when there is nothing to commit.

### 2. Memoized List Items
```tsx
// DiscreteFilterControl: Each checkbox memoized independently
const CheckboxItem = React.memo<CheckboxItemProps>(({ value, valueStr, isChecked, onToggle }) => {
  // Only re-renders when its own props change
});
```

### 3. Type-Safe Selection Matching
```tsx
// Handle saved state where "1" (string) needs to match 1 (number)
const valueKey = (v: any) => v === null ? '__NULL__' : String(v);
const selectedKeysSet = new Set(selectedValues.map(valueKey));
const isChecked = selectedKeysSet.has(valueKey(value)); // O(1) lookup
```

### 4. Smart Summary Text
```tsx
// FilterFieldChip: Dynamic chip label based on filter state
const getSummaryText = () => {
  if (filterConfig.type === 'discrete') {
    return `${field.columnName} (${count} selected)`;
  }
  if (filterConfig.type === 'continuous') {
    return `${field.columnName} [${min} - ${max}]`;
  }
  // ...
};
```

---

## CSS Architecture

Each component has a corresponding `.module.css` file for scoped styling:

| File | Key Classes |
|------|-------------|
| `FilterPanel.module.css` | Panel container styling |
| `FilterDropZone.module.css` | `.dropZone`, `.isOver`, `.placeholder`, `.fieldsList` |
| `FilterFieldChip.module.css` | `.container`, `.chipContainer`, `.expandButton`, `.controlContainer` |
| `DiscreteFilterControl.module.css` | `.checkboxList`, `.checkboxItem`, `.searchRow`, `.buttonGroup` |
| `ContinuousFilterControl.module.css` | `.filterBox`, `.sliderContainer`, `.inputsContainer` |
| `DateTimeFilterControl.module.css` | `.container`, `.inputsContainer` |
