## FieldChip Module Architecture

The `FieldChip` module provides **draggable field representations** used throughout the visualization UI. Fields appear as chips in the fields panel, on axes, and in property zones (color, size, etc.). The module supports **drag-and-drop**, **multi-selection**, **context menus**, and **automatic tooltip truncation**.

---

### **Module Structure**

```
FieldChip/
├── index.ts                   # Barrel exports
├── types.ts                   # DragSource type, FieldChipProps interface
├── FieldChip.tsx              # Main orchestrator component
├── ChipWithTooltip.tsx        # Visual chip with conditional tooltip
├── FieldChipLabel.tsx         # Label content with symbols and metadata
├── FieldContextMenu.tsx       # Context menu wrapper
├── FieldMenuItems.tsx         # Menu items (type, flavour, aggregation, etc.)
├── fieldMenuConfig.ts         # Zone-based menu configuration
├── ColumnCastingDialog.tsx    # Dialog for configuring column casting
├── useDragHandlers.ts         # Hook: drag start/end, multi-field drag
├── useFieldSelection.ts       # Hook: click/modifier selection logic
├── useTruncationDetection.ts  # Hook: ResizeObserver for tooltip trigger
├── dragImageUtils.ts          # Custom drag image with badge
├── chipStyles.ts              # Dynamic styling based on field properties
├── utils.ts                   # Field update rules, formatting helpers
├── FieldChip.module.css       # Main chip styles
└── FieldChipLabel.module.css  # Label-specific styles
```

---

### **Component Hierarchy**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FieldChip                                       │
│  Orchestrates selection, drag handlers, and context menu state              │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                        ChipWithTooltip                                 │  │
│  │  Visual chip with MUI Chip + conditional Tooltip                      │  │
│  │                                                                       │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │  │
│  │  │                     FieldChipLabel                              │  │  │
│  │  │  # fieldName (SUM) [continuous] (float)                        │  │  │
│  │  │  ↑                                                             │  │  │
│  │  │  Symbol: # for regular, ƒ for virtual columns                  │  │  │
│  │  │  Color: green (continuous) or blue (discrete)                  │  │  │
│  │  └─────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                       │  │
│  │  [Badge: count] (shown when dragging multiple fields)                 │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                       FieldContextMenu                                 │  │
│  │  Opens at cursor position on right-click                              │  │
│  │                                                                       │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │  │
│  │  │                      FieldMenuItems                             │  │  │
│  │  │  • Dimension / Measure                                         │  │  │
│  │  │  • Discrete / Continuous                                       │  │  │
│  │  │  • Data Type (string/integer/float/datetime)                   │  │  │
│  │  │  • DateTime Part submenu                                       │  │  │
│  │  │  • Configure Casting                                           │  │  │
│  │  │  • Aggregation (SUM/AVG/MIN/MAX/COUNT)                        │  │  │
│  │  │  • Bar Sort Order (axes only)                                  │  │  │
│  │  │  • Remove from this zone                                       │  │  │
│  │  └─────────────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### **Data Flow Diagram**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         EXTERNAL STATE                                       │
│                                                                             │
│  ┌─────────────────────────┐    ┌─────────────────────────────────────────┐ │
│  │ Zustand selectionStore  │    │ Parent Component                        │ │
│  │  • selectedFields[]     │    │  • field: Field                         │ │
│  │  • anchorFieldId        │    │  • source: DragSource                   │ │
│  │  • selectSingle()       │    │  • onUpdate: (Field | Field[]) => void  │ │
│  │  • toggleSelection()    │    │  • allFields?: Field[]                  │ │
│  │  • selectRange()        │    │  • menuConfig?: FieldMenuConfig         │ │
│  │  • clearSelection()     │    │  • onRemoveFromZone?: () => void        │ │
│  └────────────┬────────────┘    └──────────────────┬──────────────────────┘ │
│               │                                    │                        │
└───────────────┼────────────────────────────────────┼────────────────────────┘
                │                                    │
                ▼                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FieldChip                                       │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ HOOKS                                                               │    │
│  │                                                                     │    │
│  │ useIsFieldSelected(field.id, source)                                │    │
│  │   └─► isSelected (granular subscription)                            │    │
│  │                                                                     │    │
│  │ useDragHandlers({ field, source, index, allFields })                │    │
│  │   └─► isDragging, handleDragStart, handleDragEnd                    │    │
│  │   └─► Creates custom drag image with badge for multi-select         │    │
│  │   └─► Sets JSON payload: { fields[], source, indices[] }            │    │
│  │                                                                     │    │
│  │ useFieldSelection({ field, source, allFields })                     │    │
│  │   └─► handleMouseDown (Ctrl/Cmd toggle, Shift range)                │    │
│  │   └─► handleClick (preventDefault)                                  │    │
│  │   └─► handleContextMenu (select if not selected, return position)   │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ STATE                                                               │    │
│  │  menuPosition: { x, y } | null                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│                              │                                              │
│              ┌───────────────┴───────────────┐                              │
│              ▼                               ▼                              │
│  ┌─────────────────────────┐    ┌─────────────────────────────────────┐    │
│  │ ChipWithTooltip         │    │ FieldContextMenu                    │    │
│  │  • Visual rendering     │    │  • Opens when menuPosition !== null │    │
│  │  • Truncation detection │    │  • Renders FieldMenuItems           │    │
│  │  • Drag badge           │    │  • Calls onUpdate with field changes│    │
│  └─────────────────────────┘    └─────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### **DragSource Types**

Fields can appear in different zones, each with its own behavior:

| DragSource | Location | Menu Behavior |
|------------|----------|---------------|
| `AVAILABLE_FIELDS` | Left fields panel | Full editing, no remove option |
| `X_AXIS` | X-axis drop zone | Type/flavour/agg, bar sort, remove |
| `Y_AXIS` | Y-axis drop zone | Type/flavour/agg, bar sort, remove |
| `COLOR_ZONE` | Color property | Type/flavour/agg, remove |
| `SIZE_ZONE` | Size property | Type/flavour/agg, remove |
| `LABEL_ZONE` | Label property | Type/flavour, remove |
| `TOOLTIP_ZONE` | Tooltip property | Type/flavour, remove |

---

### **Hook Responsibilities**

| Hook | Purpose | Performance Strategy |
|------|---------|---------------------|
| `useDragHandlers` | Manages drag start/end, multi-field payload | Uses `getState()` to read selection only on drag start |
| `useFieldSelection` | Handles click, Ctrl/Cmd+click, Shift+click | Granular subscription via `useIsFieldSelected` |
| `useTruncationDetection` | ResizeObserver detects when text is truncated | Only shows tooltip when actually truncated |

---

### **Multi-Selection Behavior**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ SELECTION MODES                                                              │
│                                                                             │
│ 1. SINGLE CLICK                                                             │
│    • Clears selection, selects clicked field                                │
│    • Sets anchor for shift-click range                                      │
│                                                                             │
│ 2. CTRL/CMD + CLICK                                                         │
│    • Toggles selection without clearing others                              │
│    • Updates anchor to clicked field                                        │
│                                                                             │
│ 3. SHIFT + CLICK                                                            │
│    • Selects range from anchor to clicked field                             │
│    • Requires allFields prop for index calculation                          │
│                                                                             │
│ 4. DRAG (when multiple selected)                                            │
│    • Creates payload with all selected fields                               │
│    • Shows badge with count on drag image                                   │
│    • Clears selection after drag starts                                     │
│                                                                             │
│ 5. CONTEXT MENU (when multiple selected)                                    │
│    • Bulk edit: "Apply to N fields" header                                  │
│    • Changes apply to all selected fields                                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### **Menu Configuration**

`FieldMenuConfig` controls which menu items appear based on zone:

```typescript
interface FieldMenuConfig {
  allowRemoveFromZone: boolean;    // "Remove from this zone" action
  allowTypeChange: boolean;        // Dimension/Measure toggle
  allowFlavourChange: boolean;     // Discrete/Continuous toggle
  allowDataTypeChange: boolean;    // string/integer/float/datetime
  allowCasting: boolean;           // Configure Casting dialog
  allowAggregationChange: boolean; // SUM/AVG/MIN/MAX/COUNT
  allowBarSortOrder: boolean;      // Bar sort order (axes only)
  allowDateTimePart: boolean;      // DateTime part submenu
}
```

---

### **Visual Styling**

| Field State | Visual Indicator |
|-------------|------------------|
| Discrete | Blue chip, `#` symbol |
| Continuous | Green chip, `#` symbol |
| Virtual Column | `ƒ` symbol instead of `#` |
| Selected | Darker background + border highlight |
| Measure with Sort | Arrow indicator (↑ or ↓) |

> **Note:** CSS for "invalid on axis" (red styling) exists but is currently unused — nothing sets `field.isInvalid = true`.

**Chip width varies by zone:**
- `AVAILABLE_FIELDS`: Full width (100%)
- Axes/Properties: Compact width (~120px max)

---

### **External Connections**

**State management:**
- `selectionStore` (Zustand) — Multi-field selection state
- `useIsFieldSelected` — Granular selector for single field

**Used by:**
- `FieldsPanel` — Renders available fields
- `AxisDropZone` — Renders fields on X/Y axes
- `ColorDropZone`, `SizeDropZone`, etc. — Property zones

**Drag payload format:**
```json
{
  "fields": [{ "id": "...", "columnName": "...", ... }],
  "source": "X_AXIS",
  "indices": [0, 2, 3]
}
```

---

### **Key Patterns**

1. **Granular subscriptions** — Uses Zustand selectors to only re-render when THIS field's selection changes
2. **getState() for handlers** — Reads selection state directly in handlers to avoid subscriptions
3. **Custom drag image** — Creates DOM element with badge for multi-field drag feedback
4. **Truncation detection** — ResizeObserver checks if label overflows, only shows tooltip when needed
5. **Configurable menus** — `FieldMenuConfig` allows different menu options per zone
6. **Bulk editing** — Context menu operations apply to all selected fields
