# Hooks Module

Custom React hooks for state management, data operations, and UI interactions.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        VisualizationPage                            │
│  ┌─────────────────────┐      ┌──────────────────────────────────┐ │
│  │ useVisualizationState│      │        useDragDrop               │ │
│  │   (facade hook)     │      │   (drag/drop with undo/redo)     │ │
│  └──────────┬──────────┘      └──────────────────────────────────┘ │
│             │                                                       │
│  ┌──────────┴──────────────────────────────────────┐               │
│  │  Composed Hooks:                                 │               │
│  │  ├─ useFieldOperations   (field CRUD)           │               │
│  │  ├─ useVirtualColumns    (computed columns)     │               │
│  │  ├─ useMetadataOperations (API metadata)        │               │
│  │  └─ useFilterMetadata    (filter values/ranges) │               │
│  └─────────────────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Hook Inventory

### Core State Management

| Hook | Purpose | Used By |
|------|---------|---------|
| `useVisualizationState` | Facade composing field, metadata, and filter hooks | `VisualizationPage` |
| `useDragDrop` | Drag-drop operations with undo/redo integration | `VisualizationPage` |
| `useUndoRedo` | Re-export of `UndoRedoContext` hook | Multiple components |
| `useLayoutState` | Panel visibility/collapse state | `LayoutContext` |

### Field Operations

| Hook | Purpose | Used By |
|------|---------|---------|
| `useFieldOperations` | Field CRUD (add, remove, update, reorder) | `useVisualizationState` |
| `useVirtualColumns` | Virtual column field generation | `useVisualizationState` |
| `useFieldsPanelDrag` | Fields panel drop-to-remove handling | `FieldsPanel` |

### Data & Metadata

| Hook | Purpose | Used By |
|------|---------|---------|
| `useMetadataOperations` | Database/table/column API calls | `useVisualizationState` |
| `useFilterMetadata` | Filter values (discrete) and ranges (continuous) | `useVisualizationState` |
| `useConnectionForm` | Connection form state (ClickHouse, CSV, Kaggle) | `DataSourceSelectionPage` |

### UI Helpers

| Hook | Purpose | Used By |
|------|---------|---------|
| `useChartTooltip` | Custom tooltip show/hide/position | `ObservablePlot` |
| `useRenderingCoordinator` | Track multi-plot rendering completion | `ChartArea` |

---

## Key Hooks Explained

### `useVisualizationState`

**Facade hook** that composes multiple specialized hooks into a single API surface.

```typescript
const {
  // Metadata
  databases, tables, selectedDatabase, selectedTable,
  availableFields, isLoadingMetadata, metadataError,
  
  // Virtual columns
  virtualColumns, handleAddVirtualColumn, handleUpdateVirtualColumn,
  
  // Field operations
  handleFieldUpdate, handleDatabaseSelect, handleTableSelect,
  
  // Filter support
  refetchFilterValues,
} = useVisualizationState();
```

**Design note:** Does NOT expose `handleRemoveFromAxis`, `handleReorderFields` - use `useDragDrop` instead for undo/redo support.

---

### `useDragDrop`

Handles all drag-and-drop operations with **undo/redo integration**.

```typescript
const {
  handleAxisDrop,           // Drop onto X/Y axis
  handleRemoveFromAxis,     // Remove field (with undo)
  handleRemoveMultipleFromAxis, // Batch remove
  handleReorderFields,      // Reorder within axis
  handleMoveFieldBetweenAxes,   // X↔Y transfer
  handleFilterDrop,         // Drop onto filter zone
  handleColorDrop,          // Drop onto color zone
  handleSizeDrop,           // Drop onto size zone
  handleLabelDrop,          // Drop onto label zone
  // ... removal handlers
} = useDragDrop(availableFields);
```

**Key behavior:** Every operation calls `recordAction(getUndoableSnapshot())` before modifying state.

---

### `useFieldOperations`

Lower-level field operations **without** undo/redo.

Used internally by `useVisualizationState`. Employs **refs for stable callbacks** to prevent unnecessary re-renders:

```typescript
// Refs keep callbacks stable even when state changes
const xAxisFieldsRef = useRef(xAxisFields);
useEffect(() => { xAxisFieldsRef.current = xAxisFields; }, [xAxisFields]);

// Callbacks read from refs at execution time
const handleRemoveFromAxis = useCallback((fieldId: string) => {
  const currentXFields = xAxisFieldsRef.current; // Fresh value
  // ...
}, [dispatch]); // Stable dependency array
```

---

### `useMetadataOperations`

Handles all metadata API calls and **auto-fetching effects**:

- `fetchDatabases()` - List available databases
- `fetchTables(db)` - List tables in database  
- `fetchColumns()` - Get column schema
- `fetchSuggestedJoins()` - Find joinable tables
- `fetchMergedColumns()` - Get merged schema for JOINs/UNIONs

**Auto-fetch effects:**
1. Connection change → fetch databases (ClickHouse) or tables (CSV/Kaggle)
2. Database selected → fetch tables
3. Table selected → fetch columns
4. Joined tables change → fetch merged columns

---

### `useFilterMetadata`

Manages filter metadata (distinct values, ranges) per filter field.

**Smart fetching:**
- Discrete fields with ≤5000 values → fetch all
- Discrete fields with >5000 values → fetch 100 random samples + show warning
- Continuous/datetime fields → fetch min/max range

**Supports:**
- Regex filtering for large discrete fields
- Virtual columns (expression-based)
- Virtual tables (JOINs/UNIONs)
- Per-field abort controllers for cancellation

---

### `useRenderingCoordinator`

Coordinates multi-plot rendering for faceted charts:

```typescript
const coordinator = useRenderingCoordinator();

// Before rendering
coordinator.startRenderingBatch(plotIds, onAllRendered, timeout);

// Each plot calls when done
coordinator.markPlotRendered(plotId);

// When all plots complete, onAllRendered fires
```

Used to keep loading modal visible until all facet cells finish rendering.

---

### `useConnectionForm`

Manages connection form state via `useReducer`:

```typescript
const {
  connectionType,           // 'clickhouse' | 'csv' | 'kaggle'
  csvState,                 // CSV-specific form state
  clickHouseState,          // ClickHouse-specific form state
  kaggleState,              // Kaggle-specific form state
  updateCsvState,           // Partial updates
  validateForm,             // Returns { isValid, errorMessage }
  buildConnectionDetails,   // Build ConnectionDetails object
  searchKaggleDatasets,     // Kaggle API integration
  // ...
} = useConnectionForm();
```

---

## Performance Patterns

### Refs for Stable Callbacks

Both `useFieldOperations` and `useDragDrop` use refs to avoid callback recreation:

```typescript
// ❌ Bad: Callback recreated every time xAxisFields changes
const handleRemove = useCallback((id) => {
  dispatch({ payload: xAxisFields.filter(f => f.id !== id) });
}, [xAxisFields, dispatch]);

// ✅ Good: Callback stable, reads fresh value from ref
const xAxisFieldsRef = useRef(xAxisFields);
useEffect(() => { xAxisFieldsRef.current = xAxisFields; }, [xAxisFields]);

const handleRemove = useCallback((id) => {
  dispatch({ payload: xAxisFieldsRef.current.filter(f => f.id !== id) });
}, [dispatch]);
```

### Abort Controllers

`useFilterMetadata` uses per-field abort controllers:

```typescript
const abortControllers = useRef<Map<string, AbortController>>(new Map());

// Cancel previous fetch for this field
abortControllers.current.get(fieldId)?.abort();

// Start new fetch with fresh controller
const controller = new AbortController();
abortControllers.current.set(fieldId, controller);
await apiService.getDistinctValues(..., controller.signal);
```

---

## External Connections

| Hook | Contexts Used | APIs Called |
|------|---------------|-------------|
| `useVisualizationState` | Connection, Visualization, Sheet, DataSource | - |
| `useDragDrop` | Visualization, DataSource | - |
| `useMetadataOperations` | - | `listDatabases`, `listTables`, `listColumns`, `getMergedColumns` |
| `useFilterMetadata` | - | `getDistinctValues`, `getFieldRange`, `getDateTimeRange` |
| `useConnectionForm` | - | `searchKaggleDatasets`, `listKaggleFiles` |

---

## Importing Hooks

All hooks are exported from `index.ts` for convenient imports:

```typescript
// Individual import
import { useVisualizationState } from './hooks/useVisualizationState';

// Barrel import (preferred)
import { useVisualizationState, useDragDrop, useMetadata } from './hooks';
```
