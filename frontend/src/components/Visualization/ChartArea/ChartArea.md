## ChartArea Module Architecture

The `ChartArea` module is the **main visualization container** that orchestrates data querying, chart generation, and rendering. It follows a **hook-based composition pattern** where the main component acts as a thin orchestrator delegating to specialized hooks.

---

### **Module Structure**

```
ChartArea/
├── ChartArea.tsx          # Main orchestrator component
├── index.ts               # Barrel exports
├── types.ts               # Shared type definitions
├── hooks/                 # State/logic hooks
│   ├── useQueryExecution  # Coordinates query building + execution
│   ├── useQueryBuilder    # Builds QueryDescription from fields
│   ├── useQueryExecutor   # Executes queries (backend/DuckDB)
│   ├── useQueryFingerprint# Deduplication of query requests
│   ├── useChartGeneration # Observable Plot spec generation
│   ├── useDataProcessing  # Table view detection + data cleaning
│   ├── useDebugView       # Debug panel toggle/resize
│   └── useFullscreen      # Fullscreen mode
├── components/            # Presentational components
│   ├── ChartRenderer      # Chart grid or table view
│   ├── ChartControls      # Toolbar (undo/redo, swap, fullscreen)
│   ├── DebugPanel         # Query/spec inspection panel
│   ├── BarSortControl     # Floating bar sort control
│   └── DatasetStatus      # Status indicator
└── utils/                 # Pure functions
    ├── dataValidation     # Data cleaning utilities
    └── chartAreaUtils     # Timing, resize handlers
```

---

### **Data Flow Diagram**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            EXTERNAL CONTEXTS                                 │
├────────────────────┬───────────────────┬────────────────────────────────────┤
│VisualizationContext│  DataSourceContext│  ConnectionContext                 │
│  • state (fields,  │  • selectedTable  │  • connectionDetails               │
│    filters, etc.)  │  • availableFields│                                    │
│  • dispatch        │  • virtualTable   │                                    │
│  • startOperation  │                   │                                    │
│  • completeOp      │                   │                                    │
└────────┬───────────┴─────────┬─────────┴───────────────┬────────────────────┘
         │                     │                         │
         ▼                     ▼                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          ChartArea.tsx (Orchestrator)                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ Reads from contexts:                                                    ││
│  │  • xAxisFields, yAxisFields, colorField, filters, virtualColumns, etc. ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌──────────────────────┐    ┌──────────────────────┐                       │
│  │ useQueryExecution    │───▶│ useQueryBuilder      │ Builds QueryDescription│
│  │  • queryDescription  │    │  • field mapping     │                       │
│  │  • optimizationHints │    │  • optimization hints│                       │
│  │  • lastQueryDecision │    └──────────────────────┘                       │
│  │                      │───▶│ useQueryExecutor     │ Executes query        │
│  │                      │    │  • backend/DuckDB    │ (hybrid local/remote) │
│  │                      │    │  • decision engine   │                       │
│  └──────────┬───────────┘    └──────────────────────┘                       │
│             │ queryResult                                                   │
│             ▼                                                               │
│  ┌──────────────────────┐    ┌──────────────────────┐                       │
│  │ useDataProcessing    │    │ useChartGeneration   │                       │
│  │  • useTableView      │───▶│  • grid (Grid        │ Canonical grid model  │
│  │  • tableData         │    │     ResultModel)     │                       │
│  │  • cleanedResult     │    │  • facetLimitWarning │                       │
│  └──────────────────────┘    └──────────┬───────────┘                       │
│                                         │ grid                              │
│             ┌───────────────────────────┴──────────────┐                    │
│             ▼                                          ▼                    │
│  ┌──────────────────────┐              ┌────────────────────────┐           │
│  │ useDebugView         │              │ useFullscreen          │           │
│  │  • isDebugOpen       │              │  • isFullscreen        │           │
│  │  • debugHeight       │              │  • toggleFullscreen    │           │
│  └──────────────────────┘              └────────────────────────┘           │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ Props
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CHILD COMPONENTS                                   │
├──────────────────────┬──────────────────────┬───────────────────────────────┤
│  ChartRenderer       │  ChartControls       │  DebugPanel                   │
│  ┌────────────────┐  │  • Undo/Redo buttons │  • SQL query display          │
│  │ if tableView:  │  │  • Swap axes         │  • Query result               │
│  │  TableViewLazy │  │  • Fullscreen toggle │  • Grid result                │
│  │ else:          │  │  • Debug toggle      │  • Optimization hints         │
│  │  ChartGrid     │  │  • Independent axis  │                               │
│  │  BarSortControl│  │    toggles           │                               │
│  └────────────────┘  │                      │                               │
└──────────────────────┴──────────────────────┴───────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  FacetLimitDialog (conditional)                                             │
│  • Shown when facet count exceeds 500                                       │
│  • User can proceed or cancel                                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### **Hook Composition & Dependencies**

| Hook | Inputs | Outputs | Used By |
|------|--------|---------|---------|
| `useQueryBuilder` | fields, filters, virtualTable, virtualColumns | `queryDescription`, `optimizationHints` | `useQueryExecution` |
| `useQueryExecutor` | queryDescription, filters, fields, hints | `executeQuery()`, `lastQueryDecision` | `useQueryExecution` |
| `useQueryExecution` | table, fields, filters, dispatch | `queryDescription`, `optimizationHints`, `lastQueryDecision` | `ChartArea` |
| `useDataProcessing` | fields, queryResult | `useTableView`, `tableData` | `ChartArea` |
| `useChartGeneration` | fields, colors, sizes, queryResult, overrides | `grid`, `chartInfo`, `facetLimitWarning` | `ChartArea` |
| `useDebugView` | (none) | `isDebugOpen`, `debugHeight`, `toggleDebugView` | `ChartArea` |
| `useFullscreen` | elementRef | `isFullscreen`, `toggleFullscreen` | `ChartArea` |

---

### **External Connections**

**Contexts consumed:**
- `VisualizationContext` — main state (fields, filters, queryResult, virtualColumns, fieldOverrides)
- `DataSourceContext` — selectedTable, selectedDatabase, availableFields, virtualTable
- `ConnectionContext` — connectionDetails (type, host, etc.)
- `SheetContext` — resetWorkspace
- `useRenderingCoordinator` — batch rendering tracking

**External services:**
- `duckdbService` — local DuckDB WASM for hybrid query execution
- `apiService` — backend API calls (query, row-count, etc.)
- `generatePlot()` — Observable Plot spec generator

**Emitted actions (via dispatch):**
- `SET_QUERY_RESULT`, `SET_QUERY_ERROR`
- `SWAP_AXIS_FIELDS`
- `RESTORE_UNDOABLE_STATE`
- `SET_INDEPENDENT_DOMAIN`
- `SET_MEASURE_VALUES_SOURCE_FIELDS`

---

### **Key Patterns**

1. **Hook composition** — Small, focused hooks composed by `ChartArea.tsx`
2. **Memoization** — Heavy use of `useMemo`/`useCallback` to prevent re-renders
3. **Rendering coordination** — `useRenderingCoordinator` tracks when all facet cells finish rendering
4. **Facet validation** — Pre-render check prevents browser overwhelm (>500 facets)
5. **Hybrid query** — Decision engine picks backend vs. local DuckDB execution
