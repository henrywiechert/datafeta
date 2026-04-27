# Frontend Contexts Architecture

This document provides a high-level overview of the React contexts used in Data Slicer, their responsibilities, and how they interact.

## Context Hierarchy

```
index.tsx
│
├── DataSourceProvider                  ← Session-scoped metadata and table selection
│   │
│   └── VisualizationProvider           ← Root visualization instance used by connection reset logic
│       │
│       └── ConnectionProvider          ← Database connection state
│           │                             (depends on DataSourceContext and VisualizationContext)
│           │
│           └── App.tsx
│               │
│               └── SheetProvider       ← Multi-sheet workspace management
│                   │
│                   └── VisualizationPage.tsx
│                       │
│                       └── VisualizationProvider key={activeSheet.id}
│                           │             ← Per-sheet chart configuration
│                           │                (remounts on sheet switch)
│                           └── UndoRedoProvider
```

`VisualizationProvider` appears at two levels. The root provider exists because
`ConnectionProvider` currently dispatches `RESET_QUERY_STATE` on connect and
disconnect. The keyed provider inside `VisualizationPage.tsx` is the per-sheet
state boundary used for axes, filters, encodings, query results, and rendering
state. If the connection reset boundary is decoupled in the future, the root
provider can be revisited.

## Context Overview

| Context | Scope | Persistence | Purpose |
|---------|-------|-------------|---------|
| `SheetContext` | App-wide | localStorage | Multi-sheet workspace tabs |
| `ConnectionContext` | App-wide | None | Database connection lifecycle |
| `DataSourceContext` | App-wide | None | DB/table selection, available fields |
| `VisualizationContext` | Root + per-sheet | Via SheetContext for per-sheet instance | Chart axes, filters, encodings, query/render state |
| `UndoRedoContext` | Per-sheet | Memory only | Action history for undo/redo |
| `LayoutContext` | App-wide | localStorage | Panel collapse/resize state |

---

## Detailed Descriptions

### 1. SheetContext
**File:** `SheetContext.tsx`

Manages multiple visualization "sheets" (like Excel worksheets):
- Create, rename, duplicate, delete sheets
- Switch active sheet
- Persist sheets to localStorage
- Each sheet stores its own `VisualizationStateSnapshot`

**Key pattern:** When switching sheets, `VisualizationProvider` remounts with `key={activeSheet.id}`, restoring that sheet's state.

```typescript
interface Sheet {
  id: string;
  name: string;
  visualizationState: VisualizationStateSnapshot;  // Axes, filters, colors, etc.
  createdAt: number;
  lastModified: number;
}
```

---

### 2. ConnectionContext
**File:** `ConnectionContext.tsx`

Manages backend connection lifecycle:
- Connect to ClickHouse, CSV, or Kaggle data sources
- Track connection status, loading, errors
- Store connection details (host, port, type)
- On connect/disconnect: resets shared metadata and clears query state

**Current dependency:** Uses `useDataSource().resetMetadata()` and
`useVisualizationContext().dispatch({ type: 'RESET_QUERY_STATE' })` to clear
query results on connection changes. This is the only reason the root
`VisualizationProvider` wraps `ConnectionProvider`; per-sheet visualization
state still lives inside `VisualizationPage.tsx`.

---

### 3. DataSourceContext
**File:** `DataSourceContext.tsx`

Manages data source selection (shared across all sheets):
- Selected database and table
- Available databases, tables, fields
- Multi-table support: JOIN mode and UNION mode
- Virtual table definitions
- Tables cache for cross-database operations

**Key insight:** Data source is shared because all sheets query the same connected database. Only the visualization configuration varies per sheet.

---

### 4. VisualizationContext
**Directory:** `VisualizationContext/`

The largest and most complex context. Manages per-sheet chart configuration:
- **Axes:** X/Y axis fields
- **Filters:** Filter fields and configurations
- **Encodings:** Color, size, label, tooltip fields
- **Loading:** Query/rendering/metadata operation states
- **Virtual columns:** Computed column definitions
- **Field overrides:** Per-field chart type and styling

**Structure:**
```
VisualizationContext/
├── index.ts                 # Re-exports
├── types.ts                 # State and action types
├── initialState.ts          # Default state factory
├── useVisualizationContext.ts  # Main hook
├── VisualizationProvider.tsx   # Provider with reducer
└── reducers/
    ├── axisReducer.ts       # X/Y axis field actions
    ├── filterReducer.ts     # Filter configuration
    ├── encodingReducer.ts   # Color, size, label, tooltip
    ├── loadingReducer.ts    # Operation progress tracking
    ├── overridesReducer.ts  # Per-field overrides
    ├── virtualColumnReducer.ts  # Computed columns
    └── undoRedoReducer.ts   # State reset from undo
```

**Key pattern:** Uses `useReducer` with combined reducers for organized state management.

---

### 5. UndoRedoContext
**File:** `UndoRedoContext.tsx`

Provides undo/redo functionality for visualization state:
- Maintains undo stack (max 50 entries)
- Maintains redo stack (cleared on new actions)
- Uses `isPerformingUndoRedo` flag to prevent recursive recording
- Deep-clones state to avoid reference issues

**Integration:** `useUndoRedo` hook used in `VisualizationPage` to record state changes.

---

### 6. LayoutContext
**File:** `LayoutContext.tsx`

Manages UI panel layout:
- Panel visibility (collapsed/expanded)
- Panel widths
- Persisted to localStorage via `useLayoutState` hook

**Panels managed:** Fields panel, filter panel, legend panel, debug panel, etc.

---

## Multi-Field Selection (Zustand Store)

Field selection for drag operations is managed by a Zustand store (`stores/selectionStore.ts`), not a React context:
- Track selected fields with their source (axis, filter, available)
- Support Shift+click range selection
- Support Ctrl/Cmd+click toggle selection
- Escape key clears selection
- Granular subscriptions for performance

---

## Interaction Patterns

### Connection → Visualization
When connection changes, `ConnectionContext` resets shared data source metadata
and dispatches to `VisualizationContext` to clear query results:
```
connect() / disconnect()
    ↓
resetMetadata()
dispatch({ type: 'RESET_QUERY_STATE' })
```

### Sheet ↔ Visualization
Sheet switching triggers `VisualizationProvider` remount:
```
SheetContext.setActiveSheet(newId)
    ↓
VisualizationPage re-renders with key={activeSheet.id}
    ↓
VisualizationProvider remounts, initializes from activeSheet.visualizationState
```

### Visualization → Sheet (Sync)
State changes sync back to sheet storage via `useVisualizationState` hook:
```
VisualizationContext state changes
    ↓
useVisualizationState detects change
    ↓
SheetContext.updateActiveSheetState({ ...snapshot })
    ↓
Persisted to localStorage
```

### UndoRedo ↔ Visualization
```
User action (e.g., add field)
    ↓
recordAction(currentState)  ← Save before change
    ↓
VisualizationContext dispatch
    ↓
User presses Ctrl+Z
    ↓
undo() → returns previous state
    ↓
VisualizationContext dispatch({ type: 'RESTORE_STATE', payload: previousState })
    ↓
completeUndo(currentState) ← Move to redo stack
```

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                           App Level                                  │
│  ┌─────────────┐    ┌──────────────┐    ┌─────────────────────────┐ │
│  │SheetContext │    │ConnectionCtx │    │   selectionStore        │ │
│  │(worksheets) │    │(db connect)  │    │   (Zustand)             │ │
│  └──────┬──────┘    └──────┬───────┘    └─────────────────────────┘ │
│         │                  │                                         │
│         │    Resets metadata and query state on connect/disconnect   │
│         │                  │                                         │
│         ▼                  ▼                                         │
│  ┌─────────────────────────────────────────┐                        │
│  │          DataSourceContext               │  Shared across sheets │
│  │  (databases, tables, fields, JOIN/UNION) │                        │
│  └─────────────────────────────────────────┘                        │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ Remounts on sheet switch
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         Per-Sheet Level                              │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                  VisualizationContext                          │  │
│  │  (axes, filters, encodings, loading, virtual columns)         │  │
│  └───────────────────────────────────────────────────────────────┘  │
│         │                              │                              │
│         ▼                              ▼                              │
│  ┌─────────────┐              ┌─────────────────┐                    │
│  │UndoRedoCtx  │              │  LayoutContext  │                    │
│  │(history)    │              │  (panel state)  │                    │
│  └─────────────┘              └─────────────────┘                    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Key Design Decisions

1. **Shared Data Source:** `DataSourceContext` is app-level because all sheets query the same database. Changing the table affects all sheets.

2. **Per-Sheet Visualization:** Each sheet has independent axes, filters, colors. Implemented via `key={sheetId}` remounting.

3. **Zustand for Selection:** High-frequency updates (field selection during drag) moved to Zustand for granular subscriptions and better performance.

4. **Reducer Pattern:** `VisualizationContext` uses `useReducer` with split reducers for maintainability.

5. **Undo Without Context Coupling:** `UndoRedoContext` stores full state snapshots, independent of action types.
