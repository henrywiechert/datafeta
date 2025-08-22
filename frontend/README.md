# Frontend

React 18 + TypeScript application bootstrapped with Create React App (react-scripts 5). It uses Material UI v5, React Router v6, and Observable Plot for charting.

## Prerequisites
- Node.js 16+ and npm

## Install and run
```bash
npm install
npm start
```
- Opens at: http://localhost:3000
- The frontend expects a backend at: http://localhost:8000/api/v1/data (see `src/apiService.ts`). Start the backend from `../backend`.

## Available scripts
- `npm start`: Start the development server
- `npm test`: Run tests in watch mode
- `npm run build`: Production build to `build/`
- `npm run eject`: Eject CRA (irreversible)

## Architecture overview
- Entry: `src/index.tsx` renders `App` within `React.StrictMode` and wraps it with `ConnectionProvider`.
- App shell: `src/App.tsx` wraps routes with `VisualizationProvider` and uses React Router v6 + MUI `Tabs` to switch between:
  - `DataSourceSelectionPage` (connect to CSV or ClickHouse and pick table)
  - `VisualizationPage` (fields, query, table/charts)
- API layer: `src/apiService.ts` handles connect/disconnect/list/query with robust error handling and `AbortController`-based cancellation.
- State:
  - `src/contexts/ConnectionContext.tsx` manages active data source connection
  - `src/contexts/VisualizationContext.tsx` manages fields on axes, available metadata, query results, and loading modal state (query/rendering/metadata)

## Charting and table pipeline
- Chart generator: `src/observable-plot-generator/observablePlotGenerator.ts` creates Observable Plot specifications (`PlotResult`).
  - Single chart via `options`, or multiple charts via `plots` + `layout` metadata
  - Faceting and Cartesian grids are supported
  - Shared numeric domains are computed for fair comparisons across facets
- Renderer: `src/components/Visualization/ChartGrid/ChartGrid.tsx` renders a single plot or a CSS Grid of plots. `src/components/Visualization/ObservablePlot.tsx` wraps Observable Plot with responsive sizing.
- Table view: When only discrete dimensions are present, a table view is rendered using AG Grid (`src/components/Visualization/TableView.tsx`), with helpers in `src/utils/tableViewUtils.ts`.

## Loading and cancellation
- Long-running operations show a cancellable modal (`src/components/LoadingModal.tsx`) controlled by `VisualizationContext` and timeouts in `src/config/loadingConfig.ts`.
  - Production defaults: query 3s, rendering 2s, metadata 5s
  - Development overrides: query 1s, rendering 100ms, metadata 3s
- All API requests can be cancelled via `AbortController` (see `apiService.cancelAllRequests()`).

## Notable folders
- `src/pages/` — `DataSourceSelectionPage.tsx`, `VisualizationPage.tsx`
- `src/components/Visualization/ChartArea/` — orchestrates query execution, data processing, chart generation and rendering
- `src/components/Visualization/ChartGrid/` — grid renderer and axes/labels
- `src/observable-plot-generator/` — chart generation logic and types
