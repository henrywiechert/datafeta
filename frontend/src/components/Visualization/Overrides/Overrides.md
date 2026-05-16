# Overrides Module

The **Overrides** module provides a unified panel for configuring visual properties (color, size, labels, tooltips, chart type) both globally and per-field. This replaces the older standalone panels (Label, Tooltip, Size) with a single, hierarchical configuration interface.

---

## Module Structure

```
Overrides/
├── FieldOverridesPanel.tsx    # Main panel with global + per-field sections
├── FieldOverrideRow.tsx       # Expandable row for each target field
├── useFieldOverrides.ts       # Hook for override state management
├── ChartTypeControl.tsx       # Chart type toggle (auto/line/scatter/tick/bar)
├── ColorFieldControl.tsx      # Color field drop zone + palette picker
├── SizeFieldControl.tsx       # Size field drop zone + range popover
├── SizeRangeControl.tsx       # Slider for size range/manual size
├── LabelFieldControl.tsx      # Label fields drop zone + mode selector
├── TooltipFieldControl.tsx    # Tooltip fields drop zone
└── overrideUtils.ts           # Shared utilities (chip styles, drag parsing)
```

---

## Architecture

### Two-Level Configuration

```
┌─────────────────────────────────────────────────────┐
│                 FieldOverridesPanel                  │
├─────────────────────────────────────────────────────┤
│ [ALL] ▼  Global defaults                            │
│   ├── ChartTypeControl                              │
│   ├── ColorFieldControl                             │
│   ├── SizeFieldControl                              │
│   ├── LabelFieldControl                             │
│   └── TooltipFieldControl                           │
├─────────────────────────────────────────────────────┤
│ [Y] measure_1  ▶  (collapsed, has override dot)     │
│ [X] category_1  ▶  (collapsed)                      │
│ [Y] measure_2  ▼  Per-field override                │
│   ├── ChartTypeControl                              │
│   ├── ColorFieldControl                             │
│   ├── SizeFieldControl                              │
│   └── LabelFieldControl                             │
└─────────────────────────────────────────────────────┘
```

- **Global (ALL)**: Settings apply to all charts unless overridden
- **Per-field**: Override specific measures/dimensions with different settings

### Override Resolution

Per-field overrides take precedence over global settings:

```typescript
// In renderFieldControls()
const effectiveColorScheme = override.colorScheme || colorScheme || 'tableau10';
const effectiveSizeRange = override.sizeRange || sizeRange || [4, 20];
```

---

## Component Responsibilities

### FieldOverridesPanel

| Aspect | Description |
|--------|-------------|
| Role | Main panel orchestrating global + per-field overrides |
| State | `expandedId` — which row is currently expanded |
| Data | Uses `computeOverrideTargets()` to determine targetable fields |
| Pattern | Renders one row per target field + global row |

### FieldOverrideRow

| Aspect | Description |
|--------|-------------|
| Role | Expandable accordion row with header and content |
| Props | `id`, `label`, `axis`, `isGlobal`, `hasOverride`, `isExpanded` |
| Features | Click to expand, reset button (per-field only), override indicator |

### useFieldOverrides (Hook)

| Handler | Description |
|---------|-------------|
| `handleUpdateOverride` | Patches a single field's override |
| `handleClearOverride` | Removes all overrides for a field |
| `clearColorOverridesForAllFields` | Strips color overrides from all fields |
| `clearSizeOverridesForAllFields` | Strips size overrides from all fields |
| `clearLabelOverridesForAllFields` | Strips label overrides from all fields |
| `clearChartTypeOverridesForAllFields` | Strips chart type overrides from all fields |
| `resolveColorField` | Resolves override's colorField from ID |
| `resolveSizeField` | Resolves override's sizeField from ID |

### ChartTypeControl

| Aspect | Description |
|--------|-------------|
| Role | Toggle button group for chart type selection |
| Options | Auto, Line, Scatter, Tick, Bar |
| Behavior | `undefined` means auto-detect |

### ColorFieldControl

| Aspect | Description |
|--------|-------------|
| Role | Color field drop zone + color scheme picker |
| Features | Drop field, remove field, change scheme, change manual color, adjust bias |
| Reuses | `PropertyDropZone`, `ColorPalettePopover`, `FieldChip` |

### SizeFieldControl

| Aspect | Description |
|--------|-------------|
| Role | Size field drop zone + size range popover |
| Features | Drop field, remove field, adjust range/manual size via popover |
| Reuses | `PropertyDropZone`, `SizeRangeControl`, `FieldChip` |

### SizeRangeControl

| Aspect | Description |
|--------|-------------|
| Role | Slider UI for size range or manual size |
| Modes | Dual-thumb slider (when field set), single slider (manual size) |
| State | Local state for smooth drag interaction |

### LabelFieldControl

| Aspect | Description |
|--------|-------------|
| Role | Label fields drop zone + data label mode selector |
| Features | Multiple label fields, dataLabelMode (auto/all/sample), labelsEnabled toggle |
| Reuses | `PropertyDropZone`, `FieldChip` |

### TooltipFieldControl

| Aspect | Description |
|--------|-------------|
| Role | Tooltip fields drop zone (global only) |
| Features | Multiple tooltip fields, drag-to-add, click-to-remove |
| Reuses | `PropertyDropZone`, `FieldChip` |

---

## Data Flow

```
User Action (drop field, change scheme, etc.)
              │
              ▼
┌─────────────────────────────────────────┐
│          Control Component              │
│  (ColorFieldControl, SizeFieldControl)  │
└────────────────┬────────────────────────┘
                 │
    ┌────────────┴────────────┐
    │                         │
 Global                   Per-field
    │                         │
    ▼                         ▼
recordAction()           handleUpdateOverride()
dispatch(SET_*)          dispatch(UPDATE_FIELD_OVERRIDE)
clearXOverridesForAll()        │
    │                         │
    └────────────┬────────────┘
                 │
                 ▼
        VisualizationContext
                 │
                 ▼
        fieldOverrides state
                 │
                 ▼
        Chart Generation
        (applies overrides per-cell)
```

### Global vs Per-Field Actions

| Action Type | Global | Per-field |
|-------------|--------|-----------|
| Change color | `SET_COLOR_FIELD` + clear all color overrides | `UPDATE_FIELD_OVERRIDE` |
| Change size | `SET_SIZE_FIELD` + clear all size overrides | `UPDATE_FIELD_OVERRIDE` |
| Change labels | `SET_LABEL_FIELDS` + clear all label overrides | `UPDATE_FIELD_OVERRIDE` |
| Change chart type | `SET_GLOBAL_CHART_TYPE` + clear all chartType overrides | `UPDATE_FIELD_OVERRIDE` |

---

## External Connections

| Connection | Direction | Description |
|------------|-----------|-------------|
| `VisualizationContext` | ↔ | Reads state, dispatches actions |
| `UndoRedoContext` | → | Records snapshots before changes |
| `Properties` module | → | Uses `PropertySection`, `PropertyDropZone` |
| `Color` module | → | Uses `ColorPalettePopover` |
| `FieldChip` module | → | Renders chips for dropped fields |
| `fieldOverrides` utils | → | `computeOverrideTargets()` determines targetable fields |

---

## Override State Shape

```typescript
interface FieldOverrideState {
  // Chart type
  chartType?: UserChartType;
  
  // Color
  colorFieldId?: string | null;
  colorField?: Field | null;
  colorScheme?: string;
  colorBias?: number;
  manualColor?: string;
  
  // Size
  sizeFieldId?: string | null;
  sizeField?: Field | null;
  sizeRange?: [number, number];
  manualSize?: number;
  
  // Labels
  labelFields?: Field[];
  dataLabelMode?: 'auto' | 'all' | 'sample';
}

// Stored as:
fieldOverrides: Record<string, FieldOverrideState>
```

---

## Key Patterns

### 1. Field Independence via UUID

When dropping a field from available fields or axes, a new UUID is generated:

```typescript
const isFromZone = source === 'COLOR_ZONE';
const fieldToSet = isFromZone ? droppedField : { ...droppedField, id: uuidv4() };
```

This ensures override fields are independent and don't affect the original.

### 2. Cascade Clear on Global Change

When changing global settings, per-field overrides for that property are cleared:

```typescript
onDrop={(field) => {
  recordAction(getUndoableSnapshot());
  clearColorOverridesForAllFields();  // Clear per-field color overrides
  dispatch({ type: 'SET_COLOR_FIELD', payload: field });
}}
```

### 3. Effective Value Resolution

Per-field controls show effective values (override or fallback to global):

```typescript
const effectiveManualColor = override.manualColor || manualColor || '#4e79a7';
const effectiveColorScheme = override.colorScheme || colorScheme || 'tableau10';
```

### 4. Unified Drag Data Parsing

`parseDragData()` handles both legacy single-field and new multi-field formats:

```typescript
// Backward compatibility: normalize legacy single-field format
if (!fields && parsedData.field) {
  fields = [parsedData.field];
}
// For overrides, only take the first field
return { field: fields[0], source: source || null };
```

---

## Visual Design

- **Compact layout**: Icon + drop zone in a single row
- **No boxy cards**: Subtle borders only when expanded
- **Consistent grid**: `gridTemplateColumns: 'auto minmax(0, 1fr)'`
- **Section separators**: Thin borders between control groups
- **Override indicator**: Reset button enabled when overrides exist
