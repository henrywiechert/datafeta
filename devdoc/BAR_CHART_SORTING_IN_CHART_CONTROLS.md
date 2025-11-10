# Bar Chart Sorting - In-Chart Visual Controls

## Concept: Interactive Sort Indicator Within the Chart Visualization

Instead of (or in addition to) context menus on field chips, add a **small clickable icon directly on/near the chart** that toggles sort order.

---

## Option A: Icon on Category Axis Label (Most Intuitive)

### Visual Example - Vertical Bar Chart

```
┌────────────────────────────────────────────────────────────┐
│                                                            │
│    15000 ┤                                                 │
│          │ ███                                             │
│    10000 ┤ ███                                             │
│          │ ███ ███ ███     ███                             │
│     5000 ┤ ███ ███ ███ ███ ███                             │
│          │ ███ ███ ███ ███ ███                             │
│        0 ┼─────────────────────                            │
│          │  B   C   A   E   D                              │
│          │                                                 │
│          └─ Product Category [↕]  ← Clickable icon here   │
│                              └─ Click to cycle sort        │
└────────────────────────────────────────────────────────────┘

States:
[↕] or [⇅] = No sort (natural order)
[⬆] or [↑] = Ascending (small to large)  
[⬇] or [↓] = Descending (large to small)
```

### Horizontal Bar Chart

```
┌────────────────────────────────────────────────────────────┐
│                          ┌─ Revenue [↓]  ← Icon here       │
│                          │                                 │
│ Product B  ████████████████████                            │
│ Product C  ████████████                                    │
│ Product A  ████████                                        │
│ Product E  ████████                                        │
│ Product D  ████                                            │
│           ▲                                                │
│           └─ Category axis (no icon here)                  │
│          0     5000    10000   15000                       │
└────────────────────────────────────────────────────────────┘
```

**Positioning Logic:**
- Place icon next to the **measure axis label** (since we're sorting by measure value)
- Alternative: Next to category axis label (more intuitive - "sorting these categories")

**Interaction:**
- Click icon to cycle: None → Asc → Desc → None
- Hover shows tooltip: "Sort by value"

**Pros:**
- ✅ Extremely intuitive - right where users expect it
- ✅ Familiar pattern (like Excel column headers)
- ✅ No extra UI elements needed
- ✅ Visible indicator of current state

**Cons:**
- ⚠️ Requires rendering HTML overlay on SVG chart
- ⚠️ May clutter axis label area
- ⚠️ Needs careful positioning to not overlap with labels

---

## Option B: Floating Sort Button in Chart Corner

```
┌────────────────────────────────────────────────────────────┐
│  [↕]  ← Floating button (top-left corner)                 │
│                                                            │
│    15000 ┤                                                 │
│          │ ███                                             │
│    10000 ┤ ███                                             │
│          │ ███ ███ ███     ███                             │
│     5000 ┤ ███ ███ ███ ███ ███                             │
│          │ ███ ███ ███ ███ ███                             │
│        0 ┼─────────────────────                            │
│          │  B   C   A   E   D                              │
│                                                            │
│          Product Category                                  │
└────────────────────────────────────────────────────────────┘

Variations:
- Top-left: [↕]
- Top-right: [↕]
- Bottom-right: [↕]
```

**Interaction:**
- Click to cycle through states
- Icon changes to show current sort: [↕] → [↑] → [↓] → [↕]
- Hover tooltip: "Click to sort bars"

**Pros:**
- ✅ Doesn't interfere with chart elements
- ✅ Always in same position (easy to find)
- ✅ Easy to implement (absolute positioned div)

**Cons:**
- ⚠️ May not be immediately obvious what it controls
- ⚠️ Takes up chart space
- ⚠️ Could be confused with other controls

---

## Option C: Icon Appears on Hover Over Category Axis

```
BEFORE HOVER (Clean):
┌────────────────────────────────────────────────────────────┐
│                                                            │
│    15000 ┤                                                 │
│          │ ███ ███ ███     ███                             │
│     5000 ┤ ███ ███ ███ ███ ███                             │
│        0 ┼─────────────────────                            │
│          │  B   C   A   E   D                              │
│          Product Category                                  │
└────────────────────────────────────────────────────────────┘

AFTER HOVER (Icon Appears):
┌────────────────────────────────────────────────────────────┐
│                                                            │
│    15000 ┤                                                 │
│          │ ███ ███ ███     ███                             │
│     5000 ┤ ███ ███ ███ ███ ███                             │
│        0 ┼─────────────────────                            │
│          │  B   C   A   E   D                              │
│          Product Category [↕] ← Appears on hover           │
│                          ▲                                 │
│                          └─ Hover this area                │
└────────────────────────────────────────────────────────────┘

WHEN SORTED (Icon Always Visible):
┌────────────────────────────────────────────────────────────┐
│                                                            │
│    15000 ┤ ███                                             │
│          │ ███                                             │
│    10000 ┤ ███ ███ ███     ███                             │
│     5000 ┤ ███ ███ ███ ███ ███                             │
│        0 ┼─────────────────────                            │
│          │  B   C   A   E   D                              │
│          Product Category [↓] ← Always visible when sorted │
└────────────────────────────────────────────────────────────┘
```

**Behavior:**
- Icon hidden by default (clean look)
- Appears when hovering over axis label area
- Once sorting is applied, icon stays visible permanently (until set back to None)

**Pros:**
- ✅ Best of both worlds: clean default, discoverable on exploration
- ✅ Visual feedback when sorting is active
- ✅ Doesn't clutter when not needed

**Cons:**
- ⚠️ May not be discovered by users who don't hover
- ⚠️ Requires hover state management

---

## Option D: Mini Toolbar Above Chart

```
┌────────────────────────────────────────────────────────────┐
│  Sort: [⭕ None] [⬆ Asc] [⬇ Desc]   ← Mini button group   │
├────────────────────────────────────────────────────────────┤
│                                                            │
│    15000 ┤                                                 │
│          │ ███ ███ ███     ███                             │
│     5000 ┤ ███ ███ ███ ███ ███                             │
│        0 ┼─────────────────────                            │
│          │  B   C   A   E   D                              │
│          Product Category                                  │
└────────────────────────────────────────────────────────────┘

Or more compact:
┌────────────────────────────────────────────────────────────┐
│  [⭕] [⬆] [⬇]  ← Icon-only buttons                         │
├────────────────────────────────────────────────────────────┤
│    15000 ┤                                                 │
│          │ ███ ███ ███     ███                             │
```

**Pros:**
- ✅ Very clear and explicit
- ✅ All options visible at once

**Cons:**
- ⚠️ Takes vertical space
- ⚠️ Creates visual separation from chart

---

## Option E: Icon Integrated Into Axis Line

```
┌────────────────────────────────────────────────────────────┐
│                                                            │
│    15000 ┤                                                 │
│          │ ███ ███ ███     ███                             │
│     5000 ┤ ███ ███ ███ ███ ███                             │
│        0 ┼─────────────────────┬[↕]← Icon on axis line     │
│          │  B   C   A   E   D  │                           │
│          Product Category      │                           │
└────────────────────────────────────────────────────────────┘

Or at the start of the axis:
┌────────────────────────────────────────────────────────────┐
│                                                            │
│    15000 ┤                                                 │
│          │ ███ ███ ███     ███                             │
│     5000 ┤ ███ ███ ███ ███ ███                             │
│      [↕]┼─────────────────────  ← Icon at axis origin     │
│          │  B   C   A   E   D                              │
│          Product Category                                  │
└────────────────────────────────────────────────────────────┘
```

**Pros:**
- ✅ Integrated, feels part of the chart
- ✅ Clear association with the axis

**Cons:**
- ⚠️ Unusual placement
- ⚠️ May interfere with axis rendering

---

## 🎯 Recommended Approach: **Option C** (Hover-Revealed Icon)

### Why This Works Best:

1. **Minimal disruption when not needed** - Clean look by default
2. **Discoverable** - Appears on hover (common interaction pattern)
3. **Clear feedback** - Icon stays visible when sorting is active
4. **Intuitive location** - Next to axis label (familiar pattern)
5. **No permanent space cost** - Only visible when relevant

### Implementation Details:

```typescript
// Pseudo-code structure
<div className="chart-container">
  <div className="chart-wrapper" onMouseEnter={handleHover}>
    {/* Observable Plot SVG */}
    <Plot ... />
    
    {/* Overlay for axis label with sort icon */}
    <div className="axis-label-overlay">
      <span>Product Category</span>
      <button 
        className={`sort-icon ${sortOrder ? 'visible' : 'hidden-until-hover'}`}
        onClick={cycleSortOrder}
      >
        {sortOrder === 'asc' ? '⬆' : sortOrder === 'desc' ? '⬇' : '↕'}
      </button>
    </div>
  </div>
</div>
```

### CSS Behavior:
```css
.sort-icon {
  opacity: 0;
  transition: opacity 0.2s;
}

.chart-wrapper:hover .sort-icon {
  opacity: 1;
}

/* Always show when sorting is active */
.sort-icon.visible {
  opacity: 1;
}
```

---

## Technical Implementation Considerations

### Challenge: Observable Plot Renders SVG
- Observable Plot creates an SVG chart
- We need to overlay HTML elements for interactive controls
- Solution: Wrap the plot in a positioned container with HTML overlays

### Positioning Strategy:

```typescript
// After Plot renders, calculate axis label position
const axisLabelElement = plotElement.querySelector('.x-axis-label');
const rect = axisLabelElement.getBoundingClientRect();

// Position sort icon next to it
sortIconElement.style.left = `${rect.right + 5}px`;
sortIconElement.style.top = `${rect.top}px`;
```

### State Management:

```typescript
interface ChartSortState {
  measureField: Field;  // Which measure is being sorted
  sortOrder: 'none' | 'asc' | 'desc';
}

function cycleSortOrder(current: 'none' | 'asc' | 'desc') {
  if (current === 'none') return 'asc';
  if (current === 'asc') return 'desc';
  return 'none';
}
```

---

## Icon Design Options

### Unicode Characters:
- `↕` (U+2195) - Up down arrow
- `⬆` (U+2B06) - Upwards black arrow
- `⬇` (U+2B07) - Downwards black arrow
- `↑` (U+2191) - Upwards arrow
- `↓` (U+2193) - Downwards arrow
- `⇅` (U+21C5) - Up down arrow (alternative)
- `🔀` - Random/shuffle (for "none")
- `⭕` - Circle (for "none")

### Custom SVG Icons:
```xml
<!-- No Sort -->
<svg width="16" height="16">
  <path d="M8 2 L8 14 M8 2 L5 5 M8 2 L11 5 M8 14 L5 11 M8 14 L11 11" 
        stroke="currentColor" fill="none"/>
</svg>

<!-- Sort Ascending -->
<svg width="16" height="16">
  <path d="M8 2 L8 14 M8 2 L5 5 M8 2 L11 5" 
        stroke="currentColor" fill="none"/>
</svg>

<!-- Sort Descending -->
<svg width="16" height="16">
  <path d="M8 2 L8 14 M8 14 L5 11 M8 14 L11 11" 
        stroke="currentColor" fill="none"/>
</svg>
```

---

## Combining Approaches: Best of Multiple Worlds

### Hybrid: In-Chart Icon + Context Menu

**Primary:** Hover-revealed icon on chart (Option C)
- Quick access for power users
- Visual feedback

**Secondary:** Context menu on field chip (Option 1 from original proposal)
- Fallback for discovery
- More explicit control

**Benefits:**
- Multiple paths to same functionality (improves discoverability)
- Redundancy is good for usability
- Users can choose their preferred method

---

## Example: Complete Interaction Flow

### 1. Initial State (No Sort)
```
User hovers over chart axis area
  ↓
Icon [↕] fades in next to "Product Category"
  ↓
Tooltip appears: "Click to sort by value"
```

### 2. First Click (Sort Ascending)
```
User clicks [↕]
  ↓
Icon changes to [⬆]
  ↓
Bars smoothly rearrange (smallest to largest)
  ↓
Icon stays visible (even without hover)
```

### 3. Second Click (Sort Descending)
```
User clicks [⬆]
  ↓
Icon changes to [⬇]
  ↓
Bars flip order (largest to smallest)
```

### 4. Third Click (Back to None)
```
User clicks [⬇]
  ↓
Icon changes to [↕] and fades out
  ↓
Bars return to natural order
  ↓
Icon only visible on hover again
```

---

## Visual States Summary

| State | Icon | Visibility | Tooltip |
|-------|------|------------|---------|
| **None (default)** | `↕` | Hidden (shows on hover) | "Click to sort by value" |
| **Ascending** | `⬆` | Always visible | "Sorted ascending (click to change)" |
| **Descending** | `⬇` | Always visible | "Sorted descending (click to change)" |

---

## Testing Scenarios

1. **Hover interaction** - Icon appears/disappears smoothly
2. **Click cycling** - None → Asc → Desc → None
3. **Multiple measures** - Which field's sort applies?
4. **Faceted charts** - Does each facet get its own icon?
5. **Small charts** - Does icon fit without overlap?
6. **Horizontal bars** - Icon positioned correctly on measure axis?
7. **Touch devices** - How to handle hover on mobile?

---

## Mobile/Touch Considerations

**Problem:** Hover doesn't work on touch devices

**Solution:**
- Icon always visible on touch devices (detect with CSS media query)
- Or: Show icon after first touch on chart area
- Or: Rely on context menu approach for mobile

```css
/* Always show on touch devices */
@media (hover: none) {
  .sort-icon {
    opacity: 1;
  }
}
```

---

## Recommendation Summary

**Primary:** Option C (Hover-revealed icon on axis label)
- Clean, discoverable, minimal disruption
- Icon next to category axis label with tooltip
- Hidden by default, appears on hover, stays visible when sorting active

**Fallback:** Also keep context menu on field chip
- Provides alternative access method
- More explicit for users who prefer menus

**Icon:** Use simple Unicode arrows: `↕` `⬆` `⬇`
- Clear, recognizable, no custom assets needed
- Can enhance with color on hover

This gives you the best balance of:
- ✅ Discoverability
- ✅ Minimal disruption
- ✅ Clear feedback
- ✅ Multiple interaction paths

