# FieldsPanel Module

The `FieldsPanel` module provides the left sidebar for data source selection and field browsing. It combines metadata selection (database/table), multi-table operations (JOIN/UNION), virtual columns, and categorized field lists.

## Module Structure

```
FieldsPanel/
├── FieldsPanel.tsx              # Main container orchestrating all sub-components
├── FieldsPanel.module.css       # Container and layout styles
├── index.ts                     # Barrel exports
│
├── CompactMetadataSelector.tsx  # Data source selection (DB/table)
├── CompactMetadataSelector.module.css
├── CompactAutocomplete.module.css  # Shared compact dropdown styles
│
├── TableAddPicker.tsx           # Add table picker for UNION mode
├── SelectedTablesList.tsx       # Shows primary + union tables
├── SelectedTablesList.module.css
│
├── JoinTableSelector.tsx        # Related tables JOIN toggle
├── JoinTableSelector.module.css
│
├── FieldCategory.tsx            # Renders Dimensions or Measures list
├── FieldsSearch.tsx             # Search input for filtering fields
└── (uses ../FieldChip/)         # Individual field chips
```

## Visual Layout

```
┌─────────────────────────────────────┐
│  Data Source                        │  ← CompactMetadataSelector
│  ┌─────────────────────────┬──┐     │
│  │ [Database Dropdown    ▼]│  │     │  ← TableAddPicker (ClickHouse)
│  └─────────────────────────┴──┘     │
│  ┌─────────────────────────┬──┐     │
│  │ [Table Dropdown       ▼]│ +│     │
│  └─────────────────────────┴──┘     │
├─────────────────────────────────────┤
│  Selected Tables                    │  ← SelectedTablesList
│  ┌─────────────────────────────┐    │
│  │ [Primary] db.table      🗑️ │    │
│  │ [UNION]   db2.table2    🗑️ │    │
│  └─────────────────────────────┘    │
├─────────────────────────────────────┤
│  Related Tables              [▼]    │  ← JoinTableSelector (collapsible)
│  ┌─────────────────────────────┐    │
│  │ [🔗 table1] [🔗 table2]     │    │
│  └─────────────────────────────┘    │
├─────────────────────────────────────┤
│  Fields                             │
│  [Search fields...]                 │  ← FieldsSearch
├─────────────────────────────────────┤
│  Virtual Columns                    │  ← VirtualColumnManager
│  [+ New] [vc1: expr...] [×]         │
├─────────────────────────────────────┤
│  Dimensions                         │  ← FieldCategory
│  ┌───────────────────────────┐      │
│  │ [category_name          ] │      │  ← FieldChip (draggable)
│  │ [product_type           ] │      │
│  │ [region                 ] │      │
│  └───────────────────────────┘      │
├─────────────────────────────────────┤
│  Measures                           │  ← FieldCategory
│  ┌───────────────────────────┐      │
│  │ [amount                 ] │      │
│  │ [quantity               ] │      │
│  │ [price                  ] │      │
│  └───────────────────────────┘      │
└─────────────────────────────────────┘
     ↑ Drop zone for removing fields
```

## Component Responsibilities

| Component | Role |
|-----------|------|
| `FieldsPanel` | Main orchestrator; manages drop-to-remove, search filtering, field categorization, keyboard shortcuts (Escape clears selection) |
| `CompactMetadataSelector` | Routes to appropriate table selection UI based on connection type; handles JOIN/UNION coordination |
| `TableAddPicker` | Staged DB+table selection for adding tables (ClickHouse UNION mode) |
| `SelectedTablesList` | Displays primary table + union secondaries with remove actions |
| `JoinTableSelector` | Collapsible panel showing related/joinable tables with toggle chips |
| `FieldCategory` | Renders a category (Dimensions/Measures) with virtualization for large lists (>50 fields) |
| `FieldsSearch` | Controlled text input for filtering fields by name, aggregation, or data type |

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    VisualizationPage                             │
│  (provides all props via useVisualizationState, DataSourceContext) │
└─────────────────────────────────────────────────────────────────┘
                                │
                    Props Flow  │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                       FieldsPanel                                │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  Props received:                                             ││
│  │  • availableFields: Field[]      ← from metadata query       ││
│  │  • databases/tables              ← from DataSourceContext    ││
│  │  • selectedDatabase/Table        ← current selection         ││
│  │  • unionTables, joinedTables     ← multi-table state         ││
│  │  • virtualColumns                ← computed columns          ││
│  │  • onFieldUpdate, onRemove*      ← callbacks to context      ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ┌─────────────────┐    ┌─────────────────┐                     │
│  │ useFieldsPanelDrag│    │ useSelectionStore│                   │
│  │ (drop-to-remove) │    │ (multi-select)   │                   │
│  └─────────────────┘    └─────────────────┘                     │
│                                                                  │
│  Internal: filterBySearch() → filteredDimensions/Measures        │
└─────────────────────────────────────────────────────────────────┘
```

## Multi-Table Modes

### UNION Mode (Cross-Database)
Used with ClickHouse for combining tables with similar schemas:

```
TableAddPicker ──select DB + table──► handleAddTable()
                                           │
                    ┌──────────────────────┴───────────────────────┐
                    ▼                                              ▼
            First selection?                              Has primary table?
                    │                                              │
       onDatabaseSelect(db)                            onAddUnionTable(db, table)
       onTableSelect(table)                                        │
                    │                                              ▼
                    └────────────► SelectedTablesList ◄────────────┘
```

### JOIN Mode (Same Database)
Used for related tables with foreign key relationships:

```
JoinTableSelector
    │
    ├── suggestedJoinableTables (from backend relationship detection)
    │
    └── onToggleJoinedTable(tableName) ──► joinedTables[]
```

## Performance Optimizations

### Component Memoization
`FieldsPanel` uses `React.memo` with custom comparison:
- Compares data props (fields, tables, databases)
- **Skips callback comparison** - callbacks are stable via refs pattern
- Prevents re-renders when only chart state changes

### Field List Virtualization
`FieldCategory` uses `react-window` for large field lists:
- Threshold: 50 fields triggers virtualization
- Fixed row height: 21px
- Uses `ResizeObserver` for dynamic container height
- `will-change: transform` hint for smooth scrolling

### Search Filtering
- `filterBySearch` memoized on `fieldsSearch` changes
- Filtered lists (`filteredDimensions`, `filteredMeasures`) memoized
- Search matches: column name, aggregation, data type

## External Connections

| External Module | Connection |
|-----------------|------------|
| `VisualizationPage` | Parent; passes all props |
| `DataSourceContext` | Provides databases, tables, selection handlers |
| `useSelectionStore` | Zustand store for multi-field selection |
| `useFieldsPanelDrag` | Hook for drop-to-remove functionality |
| `FieldChip` | Renders individual draggable field items |
| `VirtualColumnManager` | Renders virtual column management UI |

## Key Patterns

### Drop-to-Remove
The fields list acts as a drop zone for removing fields from axes:
```tsx
// useFieldsPanelDrag handles:
handleDrop(e) {
  const data = JSON.parse(e.dataTransfer.getData('text/plain'));
  // Routes to appropriate onRemove* callback based on source
}
```

### Connection-Type Branching
UI adapts based on `connectionType`:
```tsx
{connectionType === 'clickhouse' ? (
  <>
    <TableAddPicker ... />      // Two-dropdown + add button
    <SelectedTablesList ... />   // Shows primary + union tables
  </>
) : (
  <FilterableSelect ... />       // Simple single dropdown
)}
```

### Keyboard Shortcuts
- **Escape**: Clears field multi-selection (via `clearSelection()`)

## CSS Architecture

| File | Purpose |
|------|---------|
| `FieldsPanel.module.css` | Container layout, fields list, drag-over styling |
| `CompactMetadataSelector.module.css` | Metadata selector layout, field rows |
| `CompactAutocomplete.module.css` | Shared compact autocomplete dropdown styles (global listbox) |
| `JoinTableSelector.module.css` | Join panel container, chip hover effects |
| `SelectedTablesList.module.css` | Table list items, role chips |

### Drag-Over Visual Feedback
```css
.dragOver {
  background-color: rgba(244, 67, 54, 0.1);  /* Red tint */
  border: 2px dashed #f44336;                /* Red dashed border */
}
```

## Export Structure

```typescript
// index.ts
export { default } from './FieldsPanel';
export { default as FieldsPanel } from './FieldsPanel';
export { default as FieldCategory } from './FieldCategory';
export { default as FieldsSearch } from './FieldsSearch';
export { default as CompactMetadataSelector } from './CompactMetadataSelector';
export { default as JoinTableSelector } from './JoinTableSelector';
export { default as TableAddPicker } from './TableAddPicker';
export { default as SelectedTablesList } from './SelectedTablesList';
```
