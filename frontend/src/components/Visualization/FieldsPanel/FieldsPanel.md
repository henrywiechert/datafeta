# FieldsPanel Module

The `FieldsPanel` module provides the left sidebar for data source selection and field browsing: metadata selection (database/table), multi-table operations (JOIN/UNION), virtual columns, and categorized field lists.

Both cards collapse through `../Properties/SectionHeader`, the same header the
Properties sections use, so the chevron sits on the left and rotates in all of
them.

Everything in the Data Source header's `actions` slot is a 20×20 `IconButton`
with a left-placed tooltip — add files (CSV), add tables by pattern
(ClickHouse), manage relationships, refresh. *Add by pattern* used to be a text
`Button` with its own type scale, which made the row's width jump between
connection types and squeezed the collapsed hint. Relationships is reachable
from the header only; the Related Tables box deliberately has no second button
for the same dialog.

The module fills **two cards** of the Fields well, not one. `CompactMetadataSelector` is mounted by `VisualizationPage` as the Data Source card, and `FieldsPanel` is the Fields card below it — so `FieldsPanel` does not render the selector and is not passed any of the metadata, JOIN/UNION or partition props. They are siblings separated by the canvas gap; see `src/theme/THEMING.md`, "The card layout".

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
├── (uses ../Properties/SectionHeader)  # The shared collapse header
└── (uses ../FieldChip/)         # Individual field chips
```

## Visual Layout

Two cards, with the shell canvas between them:

```
┌─────────────────────────────────────┐
│  Data Source                        │  ← CompactMetadataSelector
│  ┌───────────────────┬──┬──┐        │     (the Data Source card)
│  │ [Database       ▼]│ ⇄│ ⊞│        │  ← TableAddPicker (ClickHouse)
│  └───────────────────┴──┴──┘        │     ⇄ switch, ⊞ add database
│  ┌───────────────────┬──┬──┐        │
│  │ [Table          ▼]│  │ +│        │     + add the staged table
│  └───────────────────┴──┴──┘        │
│  (1 table not in prod_eu)           │  ← transient skip badge
│  Selected Tables                    │  ← SelectedTablesList
│  ┌─────────────────────────────┐    │
│  │ [P] prod_us/orders      🗑️ │    │
│  │ [U] prod_eu/orders   🧹 🗑️ │    │  ← 🧹 removes the whole DB
│  │ [U] prod_eu/events   🧹 🗑️ │    │
│  └─────────────────────────────┘    │
│  Related Tables              [▼]    │  ← JoinTableSelector (collapsible)
│  ┌─────────────────────────────┐    │
│  │ [🔗 table1] [🔗 table2]     │    │
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘
      (4px canvas gap)
┌─────────────────────────────────────┐
│  Fields                             │  ← the Fields card: FieldsPanel
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
| `CompactMetadataSelector` | The Data Source card, mounted by `VisualizationPage` rather than by `FieldsPanel`. Routes to appropriate table selection UI based on connection type; handles JOIN/UNION coordination |
| `TableAddPicker` | Staged DB+table selection. Dropdowns only stage; the three buttons are the only things that commit. Resolves both DB-row actions from the cached table list so each button knows its outcome before the click |
| `SelectedTablesList` | Displays primary table + union secondaries. Two remove actions per row: the table, and (for a non-primary database contributing 2+ tables) every table of that database. Owns one shared confirm dialog, used by the per-database remove and by removing the primary |
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
Used with ClickHouse for combining tables with similar schemas.

**One table at a time** — stage a DB and a table, press `+`:

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

**A whole database at once** — stage a DB, press `⊞`. The picker mirrors the
tables already selected (primary + unions) from that database:

```
TableAddPicker ──stage DB──► planDatabaseMirror(cached table list)
                                     │  resolved on every render, so the
                                     │  button's tooltip and disabled state
                                     ▼  already state the outcome
                             onAddDatabase(db, plan)
                                     │
                                     ▼
                       handleAddDatabase in CompactMetadataSelector
                                     │
                     onAddUnionTables(plan.toAdd)  ── ONE dispatch
                                     │
                                     ▼
                     skip badge, only if something was
                     left behind; clears itself after 6s
```

Bulk paths (`⊞`, and *Add tables by pattern*) must use the batched
`ADD_UNION_TABLES` action: the merged-columns effect in `useMetadataOperations`
keys on `unionTables` identity, so one dispatch per table would cost one
`getMergedColumns` round trip per table.

### Confirming destructive removals

`SelectedTablesList` holds a single `PendingConfirm` (`{ title, detail,
onConfirm }`) that backs one dialog, rather than one dialog per action. Two
things route through it:

- **Removing the primary**, because `SET_SELECTED_TABLE` also drops every union
  and join, the detected relationships and the merged virtual table, and leaves
  axis fields invalid. The `detail` line enumerates what will actually be lost
  for the current selection, falling back to the axis warning when the primary
  is the only table.
- **Removing a whole database** (below).

Removing a single secondary stays immediate — it is one row, and the row is
trivially re-added.

### Removing a whole database

Rows carry a second remove icon (`DeleteSweep`) that drops every selected table
of that row's database in one batched `REMOVE_UNION_TABLES`, behind an
"are you sure" dialog. Two deliberate omissions:

- **The primary's own database never gets it.** Removing its last table clears
  the primary, and `SET_SELECTED_TABLE` resets joins, unions, `virtualTable` and
  `customRelationships` with it — too much to hang off a row icon.
- **A database contributing one table never gets it**, because the row's own
  remove icon already does exactly that without a confirmation step.

Per-row remove labels are database-qualified (`Remove prod_eu.orders`): after a
mirror the same table name appears on several rows, so the bare name is not a
unique accessible name.

### Switching database (keep tables)

`⇄` runs `switchDatabasePreserveTables`: same table names, new database. It is
an action button, not a mode — selecting a database in the dropdown never
switches anything. `planDatabaseSwitch` resolves whether it can succeed from the
cached table list, so the button carries its own reason when blocked. Note that
`⊞` creates a cross-database union, which blocks `⇄` until those unions are
removed.

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
