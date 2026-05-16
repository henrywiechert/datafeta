# Frontend Documentation

The frontend is a React-based data analysis application that provides an intuitive interface for connecting to data sources, exploring data, and creating interactive visualizations.

**Last Updated**: December 24, 2025

## Application Overview

### Core Components
- **UI Framework**: React with TypeScript and Material-UI
- **Chart Library**: Observable Plot for dynamic visualization generation
- **State Management**: Context-based architecture with global state providers
- **API Integration**: Session-based backend communication with query optimization

### Main Features
- **Data Source Connection**: Database connections (ClickHouse) and CSV file uploads
- **Interactive Visualization**: Dynamic chart generation with intelligent field classification
- **Multi-Chart Faceting**: Advanced faceting with three-layer scrolling architecture
- **Multi-Table Support**: Table joins and cross-database unions
- **Query Optimization**: Field-level optimization hints for performance
- **Virtual Columns**: Calculated fields with SQL expressions
- **Arrow transport**: Efficient binary transfer for larger query results
- **DuckDB WASM local cache**: Column-slice caching + local refinement filtering and local aggregation where applicable

## Application Structure

### Key Pages
1. **Data Source Selection**: Interface for connecting to databases or uploading CSV files
2. **Visualization Page**: Interactive data exploration with drag-and-drop field management

### Key Directories
- `src/components/` - React components (Visualization, ChartGrid, Controls)
- `src/contexts/` - Global state (ConnectionContext, VisualizationContext)
- `src/observable-plot-generator/` - Chart generation engine with faceting system
- `src/hooks/` - Custom React hooks (queries, metadata, filters)
- `src/utils/` - Utilities (field classification, datetime handling)
- `src/apiService.ts` - Backend API integration
- `src/services/` - Query execution orchestration, local SQL builder, caching services

## Architecture

### State Management
- **ConnectionContext**: Data source connections, tables, columns, multi-table configuration
- **VisualizationContext**: Field selection, query building, chart state, optimization hints

### Query execution (high level)
- **Backend** remains the source of truth for SQL generation and remote execution.
- **Frontend** can fetch Arrow results and optionally cache a base-filtered slice in DuckDB WASM.
- **Caching** is standardized on **column-slice caching** (keyed by `(database, table, baseFilterHash)`), tracked via `LocalCacheHandle`.

### Chart Generation Pipeline
1. Field classification (dimension/measure, discrete/continuous)
2. Facet planning (discrete dimensions → faceting)
3. Chart type selection (bars, lines, scatter, tick strips)
4. Domain calculation (shared domains for consistency)
5. Grid generation (cartesian or faceted layouts)
6. Three-layer rendering (facet headers, axes, scrollable plots)

## Documentation

- **[Observable Plot Charts](./observable-plot.md)** - Chart generation system
- **[Faceting System](./faceting.md)** - Multi-chart faceting architecture
- **[Field Classification](./fields.md)** - Field types and aggregations
- **[API Communication](./api.md)** - Backend API and query handling
- **[UI Management](./ui-management.md)** - Component hierarchy, state flow, and render mechanics

## Development

### Scripts
- `npm start` - Development server (port 3000)
- `npm test` - Run test suite
- `npm run build` - Production build

### Environment Variables
- **`REACT_APP_API_BASE`**: API base path or absolute URL (default: `/api/v1`). The frontend calls endpoints under `${REACT_APP_API_BASE}/data/*`.