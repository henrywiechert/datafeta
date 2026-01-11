# Properties Module

The **Properties** module provides reusable UI building blocks for sidebar property panels. These are foundational components used by Filters, Color, Size, and Overrides panels.

---

## Module Structure

```
Properties/
├── PropertySection.tsx         # Collapsible panel wrapper
├── PropertySection.module.css  # Section styling
├── PropertyDropZone.tsx        # Generic drag-and-drop target
├── PropertyDropZone.module.css # Drop zone styling
└── index.ts                    # Barrel exports
```

---

## Components

### PropertySection

A collapsible accordion-style container for grouping related controls.

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `title` | `string` | — | Section title (e.g., "Filters", "Color") |
| `icon` | `ReactNode` | — | Icon displayed next to title |
| `defaultExpanded` | `boolean` | `true` | Initial expanded state |
| `collapsible` | `boolean` | `true` | Whether section can collapse |
| `headerActions` | `ReactNode` | — | Actions in header (e.g., Apply button) |
| `children` | `ReactNode` | — | Section content |
| `storageKey` | `string` | — | localStorage key for persistence |

#### Features

- **Persistent state**: Expanded/collapsed state saved to localStorage via `storageKey`
- **Animated collapse**: Smooth 200ms transition using MUI `Collapse`
- **Header actions**: Clickable actions (like Apply button) that don't trigger collapse
- **Accessible**: Click header or chevron to toggle

#### Visual Structure

```
┌─────────────────────────────────────────────┐
│ ▼  🎨  Color                    [Apply]     │  ← Header
├─────────────────────────────────────────────┤
│                                             │
│   [Section content / children]              │  ← Content (collapsible)
│                                             │
└─────────────────────────────────────────────┘
```

#### Usage

```tsx
<PropertySection
  title="Filters"
  icon={<FilterListIcon fontSize="small" />}
  defaultExpanded={true}
  storageKey="filterPanel.expanded"
  headerActions={<Button onClick={handleApply}>Apply</Button>}
>
  <FilterDropZone ... />
</PropertySection>
```

---

### PropertyDropZone

A generic drop target for drag-and-drop field operations.

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `hasContent` | `boolean` | — | Whether zone has content |
| `emptyMessage` | `string` | — | Placeholder text when empty |
| `variant` | `'default' \| 'plain'` | `'default'` | Visual style |
| `children` | `ReactNode` | — | Content when filled |
| `onDragOver` | `(e) => void` | — | Drag over callback |
| `onDragLeave` | `(e) => void` | — | Drag leave callback |
| `onDrop` | `(e) => void` | — | Drop callback |

#### Variants

| Variant | Appearance | Use Case |
|---------|------------|----------|
| `default` | Blue dashed border, light blue background | Standalone drop zones (Filter panel) |
| `plain` | No border/background, minimal height | Dense inline controls (Overrides) |

#### Visual States

```
Empty (default):          Empty (plain):
┌─ ─ ─ ─ ─ ─ ─ ─ ─┐      Drag field
│   Drag field    │      
└─ ─ ─ ─ ─ ─ ─ ─ ─┘      

Drag Over:                Has Content:
┌─────────────────┐      ┌─────────────────┐
│   (highlight)   │      │ [FieldChip]     │
└─────────────────┘      └─────────────────┘
```

#### Usage

```tsx
<PropertyDropZone
  hasContent={field !== null}
  emptyMessage="Drag field"
  variant="plain"
  onDrop={handleDrop}
>
  {field && <FieldChip field={field} ... />}
</PropertyDropZone>
```

---

## CSS Architecture

### PropertySection.module.css

| Class | Description |
|-------|-------------|
| `.section` | Container with white background, bottom border |
| `.header` | Flex row, 40px height, hover effect |
| `.titleContainer` | Icon + title with gap |
| `.expandIcon` | Chevron with rotation animation |
| `.icon` | Gray icon container |
| `.title` | 13px bold text |
| `.actions` | Right-aligned action buttons |
| `.content` | 12px padding for children |

### PropertyDropZone.module.css

| Class | Description |
|-------|-------------|
| `.dropZone` | Base: dashed blue border, light blue bg |
| `.hasContent` | Solid border, white background |
| `.dragOver` | Highlighted state on drag |
| `.emptyMessage` | Centered placeholder text |
| `.content` | Flex column for dropped items |
| `.plain` | No border/bg variant |
| `.plain.dragOver` | Subtle highlight for plain variant |

---

## External Connections

| Consumer | Uses |
|----------|------|
| `FilterPanel` | `PropertySection` for collapsible wrapper |
| `ColorPanel` | `PropertySection` |
| `SizePanel` (variants) | `PropertySection`, `PropertyDropZone` |
| `FieldOverridesPanel` | `PropertySection` |
| `ColorFieldControl` | `PropertyDropZone` |
| `SizeFieldControl` | `PropertyDropZone` |
| `LabelFieldControl` | `PropertyDropZone` |
| `TooltipFieldControl` | `PropertyDropZone` |
| `ColorDropZone` | `PropertyDropZone` |

---

## Key Patterns

### 1. LocalStorage Persistence

```tsx
// Load on mount
const getInitialExpanded = () => {
  if (storageKey) {
    const stored = localStorage.getItem(storageKey);
    if (stored !== null) return stored === 'true';
  }
  return defaultExpanded;
};

// Save on change
useEffect(() => {
  if (storageKey) {
    localStorage.setItem(storageKey, String(expanded));
  }
}, [expanded, storageKey]);
```

### 2. Event Propagation Control

Header actions don't trigger collapse:

```tsx
<Box
  className={styles.actions}
  onClick={(e) => e.stopPropagation()}  // Prevent collapse toggle
>
  {headerActions}
</Box>
```

### 3. Drop Zone State Management

Internal `isOver` state for visual feedback:

```tsx
const [isOver, setIsOver] = useState(false);

const handleDragOver = (e: React.DragEvent) => {
  e.preventDefault();
  e.stopPropagation();
  setIsOver(true);
  onDragOver?.(e);
};
```

---

## Design Principles

1. **Composable**: Components are building blocks, not complete solutions
2. **Consistent**: Same visual language across all panels
3. **Responsive**: Proper overflow handling with `min-width: 0`
4. **Accessible**: Keyboard-friendly, clear visual states
5. **Persistent**: User preferences remembered via localStorage
