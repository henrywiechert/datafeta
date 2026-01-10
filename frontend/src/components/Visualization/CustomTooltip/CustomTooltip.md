## CustomTooltip Module Architecture

The `CustomTooltip` module provides a **custom HTML tooltip** that replaces Observable Plot's built-in SVG tooltips. It offers full CSS control, smart positioning, and proper fullscreen support.

---

### **Module Structure**

```
CustomTooltip/
├── CustomTooltip.tsx    # React component with smart positioning logic
└── CustomTooltip.css    # Styling, animations, and fullscreen support
```

---

### **Component Overview**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            CustomTooltip                                     │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ ┌──────────────────────────────────────────────────────────────┐    │    │
│  │ │                    Tooltip Container                         │    │    │
│  │ │  position: fixed (or absolute in fullscreen)                 │    │    │
│  │ │  z-index: 999999                                             │    │    │
│  │ │                                                              │    │    │
│  │ │  ┌──────────┐  ┌─────────────────────────────────────────┐   │    │    │
│  │ │  │ Color    │  │  Field Label: Field Value               │   │    │    │
│  │ │  │ Bar      │  │  Another Label: Another Value           │   │    │    │
│  │ │  │ (opt.)   │  │  ...                                    │   │    │    │
│  │ │  └──────────┘  └─────────────────────────────────────────┘   │    │    │
│  │ └──────────────────────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  Smart positioning:                                                         │
│   • Anchors right of cursor by default                                      │
│   • Flips to left if would overflow viewport right edge                     │
│   • Adjusts vertically if would overflow top/bottom                         │
│   • Recalculates bounds for fullscreen mode                                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### **Props Interface**

```typescript
interface TooltipField {
  label: string;              // Field name (bold)
  value: string | number;     // Raw value
  formattedValue?: string;    // Optional formatted display value
}

interface CustomTooltipProps {
  x: number;                  // Cursor X position (viewport coords)
  y: number;                  // Cursor Y position (viewport coords)
  fields: TooltipField[];     // Array of label-value pairs to display
  visible: boolean;           // Whether tooltip should render
  colorHex?: string;          // Optional color bar on left edge
}
```

---

### **Visual Design**

```
┌─────────────────────────────────────────┐
│▌ Sales:          $1,234,567            │
│▌ Region:         North America          │
│▌ Quarter:        Q4 2025               │
│▌ Growth:         +12.5%                │
└─────────────────────────────────────────┘
 ↑
 Color bar (8px, optional, from colorHex prop)

Background: rgba(20, 20, 20, 0.95) - near-black with transparency
Border: 1px solid rgba(255, 255, 255, 0.2)
Shadow: 0 4px 12px rgba(0, 0, 0, 0.3)
Font: Montserrat, 11px
Labels: Bold, white (#ffffff)
Values: Normal, light gray (#e0e0e0)
```

---

### **Positioning Logic**

```
                    VIEWPORT / FULLSCREEN BOUNDS
    ┌───────────────────────────────────────────────────────┐
    │                                                       │
    │     Default: anchor RIGHT of cursor                   │
    │                                                       │
    │              ●────┬─────────┐                         │
    │            cursor │ Tooltip │                         │
    │                   └─────────┘                         │
    │                                                       │
    │     Near right edge: flip to LEFT                     │
    │                                                       │
    │                         ┌─────────┬────●              │
    │                         │ Tooltip │  cursor           │
    │                         └─────────┘                   │
    │                                                       │
    │     Near top/bottom: adjust Y to stay in bounds       │
    │                                                       │
    └───────────────────────────────────────────────────────┘
```

**Fullscreen handling:**
- Detects `document.fullscreenElement` (with vendor prefixes)
- Recalculates bounds relative to fullscreen container
- Switches from `position: fixed` to `position: absolute`

---

### **CSS Classes**

| Class | Purpose |
|-------|---------|
| `.custom-tooltip` | Base container styles |
| `.custom-tooltip--right` | Transform for right-anchored position |
| `.custom-tooltip--left` | Transform for left-anchored position |
| `.custom-tooltip__row` | Flexbox row for label-value pairs |
| `.custom-tooltip__label` | Bold label styling |
| `.custom-tooltip__value` | Normal value styling with word-wrap |
| `.custom-tooltip__header` | Optional header with color swatch |
| `.custom-tooltip__color-swatch` | Small color indicator box |
| `.chart-mark--highlighted` | Applied to hovered chart marks (brightness filter) |

---

### **Animations**

```css
/* Fade in from right (default) */
@keyframes tooltipFadeIn {
  from { opacity: 0; transform: translate(10px, -50%) scale(0.95); }
  to   { opacity: 1; transform: translate(10px, -50%) scale(1); }
}

/* Fade in from left (when flipped) */
@keyframes tooltipFadeInLeft {
  from { opacity: 0; transform: translate(calc(-100% - 10px), -50%) scale(0.95); }
  to   { opacity: 1; transform: translate(calc(-100% - 10px), -50%) scale(1); }
}
```

Duration: 0.15s ease-in

---

### **External Connections**

**Used by:**
- `ObservablePlot` component — renders tooltip on hover over chart marks
- Tooltip data populated from Observable Plot's hover callback

**Receives data from:**
- Chart hover events providing cursor position and data point values
- Observable Plot's tip channel configuration

**Styling considerations:**
- Uses `z-index: 999999` to appear above all chart content
- `pointer-events: none` prevents tooltip from blocking hover detection
- Fullscreen CSS selectors (`:fullscreen`, `:-webkit-full-screen`, etc.) for cross-browser support

---

### **Key Patterns**

1. **Smart positioning** — `useEffect` recalculates position on every cursor move to prevent overflow
2. **Fullscreen awareness** — Detects fullscreen state and adjusts coordinate system accordingly
3. **Optional color bar** — `colorHex` prop adds visual connection to hovered chart element
4. **Formatted values** — Supports both raw `value` and `formattedValue` for flexible display
5. **CSS transforms** — Uses `translate()` for smooth positioning without layout reflow
