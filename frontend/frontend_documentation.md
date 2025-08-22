# Frontend Documentation

This document provides an overview of the frontend application's structure, API communication, global state management, loading/cancellation, and the current chart/table pipeline.

## 1. Application Structure
- Built with React 18 + TypeScript and Material UI v5.
- `index.tsx` is the entry point, rendering `App` within `React.StrictMode` and wrapped by `ConnectionProvider`.
- `App.tsx` manages the main application layout and navigation using React Router v6 and MUI `Tabs` between:
  - `DataSourceSelectionPage` — connect to the backend (CSV/ClickHouse) and pick a table
  - `VisualizationPage` — drag fields to axes, run queries, view results (table or charts)
- `VisualizationProvider` wraps the router and provides global visualization state.

## 2. API Communication
- `src/apiService.ts` handles communication with the backend at `http://localhost:8000/api/v1/data`:
  - `connect`/`disconnect`
  - `listDatabases`/`listTables`/`listColumns`
  - `executeQuery`
- All methods use robust error handling and support request cancellation via `AbortController`:
  - In-flight requests are cancelled before starting a new one
  - Global `cancelAllRequests()` is exposed to abort on user cancellation

## 3. Global State Management
- `ConnectionContext.tsx` manages connection details and exposes the active data source.
- `VisualizationContext.tsx` manages:
  - Axis fields, available metadata, selected database/table
  - Query result/error
  - Loading states and a cancellable modal for operations: `query`, `rendering`, `metadata`
  - Helpers: `startOperation`, `completeOperation`, `cancelOperation` with timeout-based modal display

## 4. Loading States and Timeout Management
- Timeouts and UI behavior live in `src/config/loadingConfig.ts`:
  - Production defaults: `query = 3000ms`, `rendering = 2000ms`, `metadata = 5000ms`
  - Development overrides: `query = 1000ms`, `rendering = 100ms`, `metadata = 3000ms`
- `LoadingModal.tsx` shows progress, elapsed time, and a Cancel button when applicable.
- Operations integrate timeouts via `VisualizationContext` to show/hide the modal and allow cancellation.

## 5. Chart and Table Rendering
- When only discrete dimensions are present, the app renders a table view (AG Grid) instead of charts.
  - Logic: `utils/tableViewUtils.ts` (`shouldUseTableView`, `prepareTableData`)
  - Component: `components/Visualization/TableView.tsx`
- For continuous data, charts are generated with Observable Plot:
  - Generator: `src/observable-plot-generator/observablePlotGenerator.ts` → returns `PlotResult`
    - Single chart via `options`
    - Multi-plot via `plots` with `layout` metadata (grid/vertical/horizontal)
    - Faceting and shared numeric domains supported
  - Renderer: `components/Visualization/ChartGrid/ChartGrid.tsx` (grid + axes + labels)
  - Plot wrapper: `components/Visualization/ObservablePlot.tsx` (responsive sizing)
- The orchestration lives in `components/Visualization/ChartArea/` using hooks:
  - `useQueryExecution` — builds queries and calls API with cancellation
  - `useDataProcessing` — cleans results and decides table vs chart
  - `useChartGeneration` — generates Observable Plot specs

## 6. Field Semantics
- Fields (`src/types.ts`) have:
  - `type`: `dimension` | `measure`
  - `flavour`: `discrete` | `continuous`
  - `dataType`: `string` | `integer` | `float` | `datetime`
- Helper classification lives in `utils/fieldClassification.ts`.

## 7. Notes on Removed/Legacy Items
- No Vega/Vega-Lite pipeline is present.
- No Web Worker is used for chart generation currently.
- The previous `spec-generator`/`specGeneratorV2` references do not exist; Observable Plot is the active implementation.
