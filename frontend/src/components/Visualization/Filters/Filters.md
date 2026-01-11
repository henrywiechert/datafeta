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
| Role | Container with "Apply" button, manages local vs. committed state |
| Props | `filterFields`, `filterConfigurations`, `filterMetadata`, callbacks |
| State | `localConfigurations` — staged changes before Apply |
| Pattern | Changes accumulate locally; Apply batches commits to context |

**Key behavior**: Filter changes don't trigger queries until "Apply" is clicked. This prevents expensive re-queries during multi-step filter configuration.

### FilterDropZone

| Aspect | Description |
|--------|-------------|
| Role | Drag-and-drop target for adding filter fields |
| Features | Handles unified payload format (always arrays), deduplicates drops |
| Empty state | Shows "Filters" placeholder |

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
| Features | Search/regex filter, Select All/Deselect All, Query Regex for backend |
| Optimization | Memoized `CheckboxItem` for performant large lists |

**Special handling**:
- Type-safe selection matching (`"1"` vs `1` after JSON round-trip)
- Null value display as `(null)`
- Numeric vs. alphabetic sorting auto-detection
- Partial results warning with Query Regex backend filter option

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
│                         FilterPanel                              │
│  localConfigurations ──[staged changes]──────────────────────┐  │
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
│  [Apply Button] ──────────────────────────────────────────────┘  │
│       │                                                          │
│       └── onConfigChange() × N → onApplyFilters()                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    VisualizationContext
                              │
                              ▼
                    filterTierManager
                    ├── Base filters → Backend query
                    └── Refinement filters → Local DuckDB WHERE
```

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
| `filterTierManager` | → | Checks/sets base vs. refinement tier per column |
| `FieldChip` module | → | Reuses unified chip component for consistent styling |
| `DateTime` module | → | Uses `DateTimeRangeFilter` for part-based datetime filtering |
| Parent (`useFilterOperations`) | ← | Receives callbacks: `onDrop`, `onRemove`, `onConfigChange`, `onApplyFilters`, `onRefetchValues` |

---

## Key Patterns

### 1. Staged State Pattern
```tsx
// FilterPanel: Local changes don't affect context until Apply
const [localConfigurations, setLocalConfigurations] = useState(filterConfigurations);

const handleApply = () => {
  Object.entries(localConfigurations).forEach(([fieldId, config]) => {
    if (JSON.stringify(config) !== JSON.stringify(filterConfigurations[fieldId])) {
      onConfigChange(fieldId, config);
    }
  });
  onApplyFilters();
};
```

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
