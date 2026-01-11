# Legend Module

The **Legend** module displays a color legend for the visualization when a color field is active. It supports both categorical (discrete) and continuous color scales.

---

## Module Structure

```
Legend/
├── LegendPanel.tsx           # Main legend component
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

### Behavior

- Returns `null` if no `colorField` or no valid scale can be derived
- Automatically detects categorical vs. continuous based on `deriveColorScaleInfo()`
- Updates reactively when color field, scheme, bias, or query result changes

---

## Visual Rendering

### Categorical (Discrete) Legend

```
┌─────────────────────────┐
│ Color: category_name    │  ← Header with field name
├─────────────────────────┤
│ ■ Value A               │  ← Color swatch + label
│ ■ Value B               │
│ ■ Value C               │
│ ...                     │
└─────────────────────────┘
```

- Each unique value gets a color swatch from the scheme
- Labels are formatted (numbers get locale formatting, nulls show "NULL")

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
   (label + color)[]    (gradient, min, max)
         │                   │
         └─────────┬─────────┘
                   ▼
            LegendPanel UI
```

---

## External Connections

| Connection | Direction | Description |
|------------|-----------|-------------|
| `VisualizationPage` | ← | Parent renders `LegendPanel` when `colorField` is set |
| `colorSchemeUtils` | → | Uses `deriveColorScaleInfo()` to compute scale |
| `colorSchemes.ts` | → | Imports `DEFAULT_CATEGORICAL_SCHEME` |
| `fieldUtils` | → | Uses `getFieldDisplayName()` for header label |
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
| `.colorSwatch` | 16×16 color box |
| `.legendLabel` | Text label with truncation |

---

## Usage

```tsx
// In VisualizationPage.tsx
{state.colorField && (
  <LegendPanel
    colorField={state.colorField}
    queryResult={state.queryResult}
    colorScheme={state.colorScheme}
    colorBias={state.colorBias}
  />
)}
```

The legend is conditionally rendered only when a color field is active.
