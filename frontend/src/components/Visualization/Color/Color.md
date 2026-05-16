## Color Module Architecture

The `Color` module provides **color encoding controls** for chart visualizations. It handles both **field-based coloring** (categorical/sequential/diverging schemes) and **manual color selection** when no field is assigned.

---

### **Module Structure**

```
Color/
├── ColorPanel.tsx              # Top-level panel wrapper (PropertySection)
├── ColorDropZone.tsx           # Drop zone for field assignment + palette trigger
├── ColorPalettePopover.tsx     # Unified popover: schemes OR manual picker
├── ColorSchemeSelector.tsx     # Standalone scheme chooser (Menu variant)
├── ManualColorSelector.tsx     # Standalone manual color picker (Menu variant)
├── ColorBiasControl.tsx        # Slider for continuous scale bias adjustment
├── ColorPanel.module.css       # Panel styles
├── ColorDropZone.module.css    # Drop zone layout styles
├── ColorSchemeSelector.module.css  # Scheme menu styles
└── ColorBiasControl.module.css # Bias slider styles
```

---

### **Component Hierarchy**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              ColorPanel                                      │
│  Wraps everything in a PropertySection with palette icon                    │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                          ColorDropZone                                 │  │
│  │  Drop target for dragging fields from FieldsPanel                     │  │
│  │                                                                       │  │
│  │  ┌─────────────────┐  ┌─────────────────────────────────────────────┐ │  │
│  │  │ ColorPalette    │  │ Field Chip (if colorField assigned)         │ │  │
│  │  │ Popover         │  │   or                                        │ │  │
│  │  │ (palette icon)  │  │ Placeholder text "Drag a field here..."     │ │  │
│  │  └────────┬────────┘  └─────────────────────────────────────────────┘ │  │
│  │           │                                                           │  │
│  └───────────┼───────────────────────────────────────────────────────────┘  │
│              │                                                              │
│              ▼ Opens on click                                               │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                     ColorPalettePopover                                │  │
│  │                                                                       │  │
│  │  IF fieldFlavour === null (no field):                                 │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │  │
│  │  │ Manual Color Grid (10 predefined colors)                        │  │  │
│  │  │ ● ● ● ● ●                                                       │  │  │
│  │  │ ● ● ● ● ●                                                       │  │  │
│  │  └─────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                       │  │
│  │  IF fieldFlavour === 'discrete':                                      │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │  │
│  │  │ CATEGORICAL SCHEMES                                             │  │  │
│  │  │   Tableau 10  [■■■■■■■■]  ✓                                     │  │  │
│  │  │   Accent      [■■■■■■■■]                                        │  │  │
│  │  │   ...                                                           │  │  │
│  │  └─────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                       │  │
│  │  IF fieldFlavour === 'continuous':                                    │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │  │
│  │  │ SEQUENTIAL SCHEMES                                              │  │  │
│  │  │   Blues       [■■■■■■■■]                                        │  │  │
│  │  │   Greens      [■■■■■■■■]                                        │  │  │
│  │  ├─────────────────────────────────────────────────────────────────┤  │  │
│  │  │ DIVERGING SCHEMES                                               │  │  │
│  │  │   RdBu        [■■■■■■■■]  ✓                                     │  │  │
│  │  │   PiYG        [■■■■■■■■]                                        │  │  │
│  │  ├─────────────────────────────────────────────────────────────────┤  │  │
│  │  │ Bias                                                            │  │  │
│  │  │   [========●========]  -1.0 ←→ +1.0                             │  │  │
│  │  └─────────────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### **Data Flow Diagram**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FROM VisualizationContext                            │
│  State: colorField, colorScheme, colorBias, manualColor                     │
│  Dispatch: SET_COLOR_FIELD, SET_COLOR_SCHEME, SET_COLOR_BIAS, etc.          │
└─────────────────────────────┬───────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Parent Component                                   │
│  (e.g., PropertiesArea or similar visualization config panel)               │
│                                                                             │
│  Passes props to ColorPanel:                                                │
│    • colorField: Field | null                                               │
│    • colorScheme: string (e.g., 'tableau10')                                │
│    • colorBias: number (-1 to +1)                                           │
│    • manualColor: string (hex color)                                        │
│    • onDrop, onRemove, onSchemeChange, onBiasChange, onManualColorChange    │
└─────────────────────────────┬───────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            ColorPanel                                        │
│  Renders PropertySection with title="Color" and PaletteIcon                 │
│                                                                             │
│  Passes all props through to:                                               │
│    └─► ColorDropZone                                                        │
│          │                                                                  │
│          ├─► ColorPalettePopover (palette icon button)                      │
│          │     │                                                            │
│          │     └─► ColorBiasControl (if continuous field)                   │
│          │                                                                  │
│          └─► FieldChip (if colorField assigned)                             │
│               or placeholder text                                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### **Component Responsibilities**

| Component | Purpose | Key Props |
|-----------|---------|-----------|
| `ColorPanel` | Container wrapper with collapsible PropertySection | `colorField`, `colorScheme`, `colorBias`, `manualColor`, callbacks |
| `ColorDropZone` | Drop target for field drag-and-drop, renders field chip | `colorField`, `onDrop`, `onRemove`, scheme/bias/color callbacks |
| `ColorPalettePopover` | Unified popover: scheme picker OR manual color grid | `fieldFlavour`, `currentSchemeId`, `colorBias`, `manualColor`, callbacks |
| `ColorSchemeSelector` | Standalone scheme menu (button or icon variant) | `currentSchemeId`, `fieldFlavour`, `onSchemeChange` |
| `ManualColorSelector` | Standalone color picker (button or icon variant) | `value`, `onChange` |
| `ColorBiasControl` | Slider for adjusting continuous scale bias | `colorBias`, `onChange` |

---

### **Color Scheme Logic**

The scheme options shown depend on the `fieldFlavour` of the assigned color field:

| Field Flavour | Available Schemes | Bias Control |
|---------------|-------------------|--------------|
| `null` (no field) | Manual color picker (10 predefined colors) | No |
| `'discrete'` | Categorical (Tableau 10, Accent, Category10, etc.) | No |
| `'continuous'` | Sequential (Blues, Greens, etc.) + Diverging (RdBu, PiYG, etc.) | Yes |

**Predefined Colors (manual mode):**
```
#4e79a7  #f28e2c  #e15759  #76b7b2  #59a14f
#edc949  #af7aa1  #ff9da7  #9c755f  #bab0ab
```

---

### **External Connections**

**Imports from:**
- `config/colorSchemes` — `categoricalSchemes`, `sequentialSchemes`, `divergingSchemes`, `ColorScheme` type
- `../Properties` — `PropertySection`, `PropertyDropZone` layout components
- `../FieldChip` — Field chip display with edit/remove capabilities

**Used by:**
- Properties panel or visualization configuration area
- Field overrides (per-field color settings)

**State managed externally:**
- `colorField` — The field used for color encoding
- `colorScheme` — ID of the selected scheme (e.g., `'tableau10'`, `'blues'`)
- `colorBias` — Bias for continuous scales (-1 to +1)
- `manualColor` — Fixed hex color when no field assigned

---

### **Key Patterns**

1. **Context-aware UI** — Popover content adapts based on `fieldFlavour` (null/discrete/continuous)
2. **Unified popover** — `ColorPalettePopover` combines scheme selection and manual picker in one component
3. **Debounced bias** — `ColorBiasControl` uses local state with `onChangeCommitted` to avoid excessive updates
4. **Drag-and-drop** — `ColorDropZone` parses JSON payload from drag events for field assignment
5. **Standalone variants** — `ColorSchemeSelector` and `ManualColorSelector` can be used independently (button/icon variants)
