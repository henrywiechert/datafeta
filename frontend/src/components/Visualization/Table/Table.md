# Table Module

The `Table` module provides tabular data visualization using AG-Grid. It renders query results as an interactive table with sorting, filtering, pagination, and hierarchical row grouping support.

## Module Structure

```
Table/
├── TableView.tsx       # Main AG-Grid table component
├── TableViewLazy.tsx   # Lazy-loading wrapper with skeleton
└── index.ts            # Barrel exports (default: TableViewLazy)
```

## Component Overview

### TableViewLazy
Lazy-loading wrapper that defers AG-Grid bundle (~200KB) until table view is needed.

```
┌─────────────────────────────────────────┐
│  TableViewLazy                          │
│  ┌───────────────────────────────────┐  │
│  │  React.Suspense                   │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │  TableViewSkeleton          │  │  │  ← Shows while loading
│  │  │  ┌───────────────────────┐  │  │  │
│  │  │  │ ████████████████████ │  │  │  │  ← Header skeleton
│  │  │  │ ████████████████████ │  │  │  │  ← Row skeletons (8x)
│  │  │  │ ███████████████████  │  │  │  │     with fading opacity
│  │  │  │ ██████████████████   │  │  │  │
│  │  │  └───────────────────────┘  │  │  │
│  │  └─────────────────────────────┘  │  │
│  │                OR                  │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │  TableView (AG-Grid)        │  │  │  ← Actual table
│  │  └─────────────────────────────┘  │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

### TableView
Main component wrapping AG-Grid with custom configuration for hierarchical data display.

## Props Interface

```typescript
interface TableViewProps {
  columns: Column[];   // Column definitions
  rows: any[];         // Row data
  xFields: any[];      // X-axis fields (affects layout type)
  yFields: any[];      // Y-axis fields (affects layout type)
}

interface Column {
  field: string;                  // Data field key
  headerName: string;             // Display header
  width?: number;                 // Column width (default: 120)
  pinned?: 'left' | 'right';      // Pin column to side
  cellStyle?: { textAlign: ... }; // Cell alignment
  rowSpan?: (params) => number;   // Hierarchical row spanning
  cellRenderer?: string;          // Custom renderer name
  cellClassRules?: object;        // Conditional CSS classes
  comparator?: Function;          // Custom sort comparator
}
```

## Layout Types

The table adapts based on axis field configuration:

| xFields | yFields | Layout Type | minWidth |
|---------|---------|-------------|----------|
| ✓       | ✓       | `grid`      | 60px     |
| ✗       | ✓       | `vertical`  | 80px     |
| ✓       | ✗       | `horizontal`| 80px     |
| ✗       | ✗       | `empty`     | 80px     |

## Hierarchical Grouping

Supports visual row grouping for dimension hierarchies:

```
┌────────────┬────────────┬─────────┐
│ Category   │ Product    │ Sales   │
├────────────┼────────────┼─────────┤
│            │ Widget A   │ $1,200  │
│ Electronics├────────────┼─────────┤  ← "Electronics" spans 3 rows
│            │ Widget B   │ $800    │
│            ├────────────┼─────────┤
│            │ Gadget X   │ $2,100  │
├────────────┼────────────┼─────────┤
│ Furniture  │ Chair      │ $450    │  ← New group
└────────────┴────────────┴─────────┘
```

### Row Span Metadata
Columns with `rowSpan` function expect row data to include:
- `{field}_rowSpan`: Number of rows to span
- `{field}_hidden`: Boolean, true for continuation rows

### HierarchicalCellRenderer
Custom cell renderer that:
- Hides content for `_hidden` rows
- Applies bold styling to spanning cells
- Adds subtle background to group headers

## AG-Grid Configuration

```typescript
<AgGridReact
  // Data
  rowData={rows}
  columnDefs={columnDefs}
  
  // Features
  pagination={rows.length > 1000}
  paginationPageSize={25}
  paginationPageSizeSelector={[25, 50, 100]}
  
  // Interactions
  sortable={true}
  filter={'agTextColumnFilter'}
  resizable={true}
  rowSelection="multiple"
  suppressRowClickSelection={true}
  
  // Layout
  domLayout="normal"
  suppressHorizontalScroll={false}
  suppressColumnVirtualisation={layoutType === 'grid'}
  
  // Hierarchical support
  suppressRowTransform={true}  // Required for row spanning
  
  // Sizing
  onGridReady={(params) => params.api.sizeColumnsToFit()}
/>
```

## Styling

Uses MUI `styled` component for hierarchical cell theming:

```typescript
const HierarchicalTableContainer = styled('div')(({ theme }) => ({
  '& .hierarchical-group-cell': {
    backgroundColor: 'rgba(25, 118, 210, 0.04)',
    borderRight: `2px solid ${theme.palette.primary.main}`,
    fontWeight: 600,
  },
  '& .ag-row-span-continued': {
    borderTop: 'none !important',
    borderBottom: 'none !important',
  },
  // ... hover states, focus ring removal
}));
```

## Performance Considerations

### Lazy Loading
- AG-Grid bundle (~200KB) loaded only when table view is activated
- Skeleton placeholder provides immediate visual feedback

### Pagination
- Auto-enabled for datasets >1000 rows
- Page sizes: 25, 50, 100

### Column Virtualization
- Disabled for `grid` layout (many narrow columns)
- Enabled for other layouts (improves scrolling performance)

### Value Handling
- `valueGetter` used to handle field names containing dots
- `valueFormatter` handles null/undefined values gracefully

## External Connections

| External | Connection |
|----------|------------|
| `ChartRenderer` | Parent; renders TableViewLazy when `useTableView` is true |
| `ChartArea` | Provides column/row data via `tableData` prop |
| AG-Grid Community | Core table rendering library |
| MUI Theme | Provides colors for hierarchical styling |

## Data Flow

```
ChartArea (useTableData hook)
         │
         │ Generates { columns, rows }
         │ based on xAxisFields, yAxisFields, queryResult
         ▼
┌─────────────────────────────────────┐
│ ChartRenderer                       │
│   useTableView ? TableViewLazy      │
│               : ChartGrid           │
└─────────────────────────────────────┘
         │
         │ columns, rows, xFields, yFields
         ▼
┌─────────────────────────────────────┐
│ TableView                           │
│   • Converts columns → AG-Grid ColDef
│   • Detects layout type             │
│   • Configures pagination           │
│   • Applies hierarchical styling    │
└─────────────────────────────────────┘
```

## Empty State

When no columns are provided:
```
┌─────────────────────────────────────┐
│                                     │
│   Drag discrete dimensions to       │
│   the axes to create a table view.  │
│                                     │
└─────────────────────────────────────┘
```

## Export Structure

```typescript
// index.ts
export { default as TableView } from './TableView';
export { default as TableViewLazy } from './TableViewLazy';
export { default } from './TableViewLazy';  // Default is lazy version
```

**Note**: Default export is `TableViewLazy` to encourage lazy loading by default.
