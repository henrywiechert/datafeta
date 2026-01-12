# Virtual Columns Module

UI components for creating and managing computed/calculated columns using SQL expressions. Virtual columns are evaluated server-side and appear as regular fields in the visualization.

## Concept: How Virtual Columns Work

Virtual columns are **computed columns** that don't exist in the source table. They're defined by a SQL expression and evaluated **server-side** as part of the query.

### The Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│  1. USER DEFINES                                                    │
│                                                                     │
│  VirtualColumnDefinition {                                          │
│    name: "profit_margin",                                          │
│    expression: "(revenue - cost) / revenue * 100",                 │
│    output_type: "numeric"                                          │
│  }                                                                  │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│  2. FRONTEND SENDS TO BACKEND                                       │
│                                                                     │
│  QueryDescription {                                                 │
│    target_table: "sales",                                          │
│    dimensions: [...],                                              │
│    measures: [...],                                                │
│    virtual_columns: [                         ← Attached here      │
│      { name: "profit_margin",                                      │
│        expression: "(revenue - cost) / revenue * 100" }            │
│    ]                                                                │
│  }                                                                  │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│  3. BACKEND GENERATES SQL (conceptually)                            │
│                                                                     │
│  SELECT                                                             │
│    category,                                                       │
│    (revenue - cost) / revenue * 100 AS profit_margin,  ← Injected  │
│    SUM(revenue) AS "SUM(revenue)"                                  │
│  FROM sales                                                         │
│  GROUP BY category, profit_margin                                  │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│  4. FRONTEND TREATS AS REGULAR FIELD                                │
│                                                                     │
│  Field {                                                            │
│    id: "virtual_0",                                                │
│    columnName: "profit_margin",                                    │
│    is_virtual: true,            ← Marked as virtual                │
│    type: "dimension",           ← Inferred from output_type        │
│    flavour: "continuous"                                           │
│  }                                                                  │
│                                                                     │
│  → User can drag to axes, filter, color by, etc.                   │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Points

1. **Expression only sent, not evaluated client-side**: The frontend passes the raw expression string; the backend does all the SQL evaluation.

2. **Appears as regular field**: The `useVirtualColumns` hook converts `VirtualColumnDefinition[]` into `Field[]` objects that merge into `availableFields`.

3. **Query-time injection**: Every query that uses fields includes `virtual_columns` in the `QueryDescription` so the backend can construct the computed column.

4. **Field preferences preserved**: Users can set type/flavour preferences for virtual columns (e.g., treat profit_margin as a measure instead of dimension).

### Example Usage

```typescript
// User creates virtual column in UI
virtualColumns: [
  { name: "profit_margin", expression: "(revenue - cost) / revenue * 100" }
]

// User drags "profit_margin" to Y-axis
// Query builder produces:
{
  target_table: "sales",
  dimensions: [{ field: "category" }],
  measures: [{ field: "revenue", aggregation: "sum" }],
  virtual_columns: [
    { name: "profit_margin", expression: "(revenue - cost) / revenue * 100" }
  ]
}

// Backend returns data with "profit_margin" column computed
```

### Why Server-Side Evaluation?

| Approach | Pros | Cons |
|----------|------|------|
| **Server-side (current)** | Full SQL power, handles NULLs, works with aggregations | Requires backend support |
| Client-side JS | No backend changes | Limited to simple expressions, memory-heavy |

The server-side approach enables complex expressions like `CASE WHEN`, window functions, and proper NULL handling that would be difficult to implement client-side.

## UI Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                      FieldsPanel.tsx                                │
│  Contains the VirtualColumnManager in the left sidebar             │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   VirtualColumnManager                              │
│  • Displays list of existing virtual columns                       │
│  • Compact row: name + truncated expression                        │
│  • Click to edit, X to delete                                      │
│  • "+" button to create new                                        │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                           [add/edit clicked]
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   VirtualColumnEditor (Dialog)                      │
│  • Name field (identifier format validation)                       │
│  • Expression field (SQL, multiline)                               │
│  • Column picker (Autocomplete for large lists)                    │
│  • Output type selector (numeric/text/datetime)                    │
│  • Description field                                                │
│  • Example expressions with click-to-insert                        │
│  • Security validation (blocks DROP, DELETE, etc.)                 │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                            [save clicked]
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   VirtualColumnDefinition                           │
│  { name, expression, output_type?, description? }                  │
│  → Stored in VisualizationState.virtualColumns                     │
│  → Sent to backend in QueryDescription.virtual_columns             │
└─────────────────────────────────────────────────────────────────────┘
```

## Files

| File | Purpose | Lines |
|------|---------|-------|
| `VirtualColumnManager.tsx` | List view + add/edit/delete UI | 157 |
| `VirtualColumnEditor.tsx` | Full editor dialog | 323 |

## Type Definition

```typescript
// From types.ts
interface VirtualColumnDefinition {
  name: string;                              // Column identifier (e.g., profit_margin)
  expression: string;                        // SQL expression
  output_type?: 'numeric' | 'text' | 'datetime';  // Data type hint
  description?: string;                      // User documentation
}
```

## Component Props

### VirtualColumnManager

```typescript
interface VirtualColumnManagerProps {
  virtualColumns: VirtualColumnDefinition[];   // Current list
  availableColumns: string[];                  // Column names for picker
  onAdd: (column: VirtualColumnDefinition) => void;
  onEdit: (index: number, column: VirtualColumnDefinition) => void;
  onDelete: (index: number) => void;
}
```

### VirtualColumnEditor

```typescript
interface VirtualColumnEditorProps {
  open: boolean;
  column: VirtualColumnDefinition | null;      // null = new, object = edit
  availableColumns: string[];
  existingNames: string[];                     // For duplicate validation
  onSave: (column: VirtualColumnDefinition) => void;
  onCancel: () => void;
}
```

## Validation Rules

### Name Validation
- Required
- Must match `/^[a-zA-Z_][a-zA-Z0-9_]*$/` (SQL identifier format)
- Must not duplicate existing virtual column names

### Expression Validation
- Required
- Blocks dangerous keywords: `DROP`, `DELETE`, `INSERT`, `UPDATE`, `TRUNCATE`, `ALTER`, `CREATE`

## UI Features

### Manager (List View)
- Compact inline display: **name** `expression...`
- Tooltip shows full expression + description
- Delete button appears on hover
- Click row to edit

### Editor (Dialog)
- **Column Picker**: Autocomplete with search for large column lists
  - Shows first 100 by default
  - Filters as user types
  - Click inserts column name at cursor position
- **Example Expressions**: Click to populate expression field
- **Output Type**: Optional hint for field classification

## Example Expressions

| Category | Expression |
|----------|------------|
| Arithmetic | `(revenue - cost) / revenue * 100` |
| Rounding | `ROUND(amount, 2)` |
| String concat | `CONCAT(first_name, ' ', last_name)` |
| Conditional | `CASE WHEN amount > 1000 THEN 'High' ELSE 'Low' END` |
| Multi-condition | `CASE WHEN score >= 90 THEN 'A' WHEN score >= 80 THEN 'B' ELSE 'C' END` |
| Absolute value | `ABS(delta)` |
| Upper case | `UPPER(status)` |
| Split segment | `SPLIT(process_name, ":", -1)` |

## Integration Points

### Consumer
- `FieldsPanel.tsx` renders `VirtualColumnManager` in the left sidebar

### Data Flow
1. User creates/edits virtual column in dialog
2. `onSave` callback updates `VisualizationState.virtualColumns`
3. Query builder includes `virtual_columns` in `QueryDescription`
4. Backend evaluates expressions and returns computed values
5. Virtual columns appear as regular fields (with `is_virtual: true`)

## Performance Considerations

- **Autocomplete virtualization**: Shows max 100 columns by default to handle tables with hundreds of columns
- **Filtered search**: Only matching columns rendered when user types
- **Lazy dialog**: `VirtualColumnEditor` only renders when `editorOpen` is true

## Security

The frontend validation blocks obvious SQL injection keywords, but the **backend must also validate** expressions since client-side checks can be bypassed.

Blocked keywords:
- `DROP`
- `DELETE`
- `INSERT`
- `UPDATE`
- `TRUNCATE`
- `ALTER`
- `CREATE`

## Design Notes

- **No index file**: Components imported directly by path
- **Controlled state**: Editor resets when `open` prop changes
- **Cursor positioning**: Column insertion places cursor after inserted text
- **Monospace fonts**: Expression fields use monospace for SQL readability
