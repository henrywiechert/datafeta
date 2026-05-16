# Legend Module

The **Legend** module displays a color legend for the visualization when a color field is active. It supports both categorical (discrete) and continuous color scales.

---

## Module Structure

```
Legend/
├── LegendPanel.tsx           # Main legend component (with filter-from-legend support)
├── BackgroundLegendPanel.tsx  # Facet background colour legend
├── LegendStack.tsx           # Resizable container for stacked legend panels
└── LegendPanel.module.css    # Scoped styles
```

---

## Component: LegendPanel

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `colorField` | `Field \| null` | — | The field used for color encoding |
| `queryResult` | `QueryResult \| null` | — | Query result containing data for scale derivation |
| `colorScheme` | `string` | `'tableau10'` | Color scheme ID from `colorSchemes.ts` |
| `colorBias` | `number` | `0` | Bias for continuous color scales (-1 to 1) |
| `onFilterAction` | `(action, values, allDomainValues) => void \| undefined` | `undefined` | Callback for "Keep only" / "Exclude" filter actions. When `undefined` items are non-interactive |

### Behavior

- Returns `null` if no `colorField` or no valid scale can be derived
- Automatically detects categorical vs. continuous based on `deriveColorScaleInfo()`
- Updates reactively when color field, scheme, bias, or query result changes
- **Interactive mode (discrete only):** When `onFilterAction` is provided, legend items support selection and a right-click context menu

---

## Visual Rendering

### Categorical (Discrete) Legend

```
┌─────────────────────────┐
│ Color: category_name    │  ← Header with field name
├─────────────────────────┤
│ ■ Value A               │  ← Color swatch + label (clickable when interactive)
│ ■ Value B  ← selected   │  ← Highlighted background when selected
│ ■ Value C               │
│ ...                     │
└─────────────────────────┘
         ↓ right-click on selected item
┌─────────────────┐
│ Keep only       │  ← Context menu (reuses ContextMenu component)
│ Exclude         │
└─────────────────┘
```

- Each unique value gets a color swatch from the scheme
- Labels are formatted (numbers get locale formatting, nulls show "NULL")
- **Selection model:** Click = single select, Ctrl/Cmd+click = toggle (multi-select)
- **Context menu:** Right-click on a selected item opens "Keep only" / "Exclude"
- **Keep only:** Creates/updates a discrete filter with only the selected categories
- **Exclude:** Creates/updates a discrete filter with all categories *except* the selected ones

### Continuous Legend

```
┌─────────────────────────┐
│ Color: measure_name     │  ← Header with field name
├─────────────────────────┤
│ ████████████████████    │  ← Gradient bar
│ 0          1,234,567    │  ← Min/max labels
└─────────────────────────┘
```

- CSS gradient generated from color scheme range
- Shows actual min/max values from data (via `colorScale.rawMin`/`rawMax`)

---

## Data Flow

```
colorField + queryResult + colorScheme + colorBias
                    │
                    ▼
        deriveColorScaleInfo()
        (colorSchemeUtils.ts)
                    │
                    ▼
         ┌─────────┴─────────┐
         │                   │
    kind: 'categorical'  kind: 'continuous'
         │                   │
         ▼                   ▼
   discreteItems        continuousLegend
   (label + color        (gradient, min, max)
    + raw value)[]              │
         │                      │
         ├──────────┬───────────┘
         │          │
         ▼          ▼
    LegendPanel UI (render)
         │
         │ user selects items + right-clicks
         ▼
    onFilterAction('keep' | 'exclude', values, allDomainValues)
         │
         ▼
    ChartArea.handleLegendFilterAction
         │
         ├── existing filter? ──► updateExistingDiscreteFilter()
         │                           (filterActions.ts)
         └── no filter? ──────► addFieldAsDiscreteFilter()
                                    (filterActions.ts)
         │
         ▼
    SET_FILTER_CONFIGURATION + APPLY_FILTERS dispatches
         │
         ▼
    Query re-executes, chart updates
```

---

## External Connections

| Connection | Direction | Description |
|------------|-----------|-------------|
| `ChartArea` | ← | Parent renders `LegendPanel` when `colorField` is set; provides `onFilterAction` for discrete fields |
| `colorSchemeUtils` | → | Uses `deriveColorScaleInfo()` to compute scale |
| `colorSchemes.ts` | → | Imports `DEFAULT_CATEGORICAL_SCHEME` |
| `fieldUtils` | → | Uses `getFieldDisplayName()` for header label |
| `ContextMenu` | → | Reuses the shared context menu component for "Keep only / Exclude" popup |
| `filterActions.ts` | → (via ChartArea) | `addFieldAsDiscreteFilter()` / `updateExistingDiscreteFilter()` to create/update filters |
| `types.ts` | → | `Field`, `QueryResult` types |

---

## CSS Classes

| Class | Description |
|-------|-------------|
| `.container` | Flex column, full height, light background |
| `.header` | Title bar with field name |
| `.content` | Scrollable area for legend items |
| `.gradientLegend` | Container for continuous gradient |
| `.gradientBar` | The actual gradient visualization |
| `.gradientLabels` | Min/max label row |
| `.legendItem` | Single categorical item row |
| `.legendItemInteractive` | Adds cursor pointer and hover effect (only when `onFilterAction` is provided) |
| `.legendItemSelected` | Highlighted background for selected items |
| `.colorSwatch` | 16×16 color box |
| `.legendLabel` | Text label with truncation |

---

## Usage

```tsx
// In ChartArea.tsx
{state.colorField && (
  <LegendPanel
    colorField={state.colorField}
    queryResult={state.queryResult}
    colorScheme={state.colorScheme}
    colorBias={state.colorBias}
    onFilterAction={
      state.colorField?.flavour === 'discrete'
        ? handleLegendFilterAction
        : undefined
    }
  />
)}
```

The legend is conditionally rendered only when a color field is active.
The `onFilterAction` callback is only provided for discrete color fields,
keeping continuous legends non-interactive.
