# Frontend Documentation

This document provides an overview of the frontend application's structure, API communication, global state management, and chart specification generation.

## 1. Application Structure
*   The application is built with React.
*   `index.tsx` is the entry point, rendering the `App` component within `React.StrictMode` and wrapped by `ConnectionProvider`.
*   `App.tsx` manages the main application layout, handling navigation between `DataSourceSelectionPage` and `VisualizationPage` using Material-UI tabs. It also wraps its content with `VisualizationProvider` for global state management related to visualization.

## 2. API Communication
*   `apiService.ts` handles all communication with the backend. It provides methods for:
    *   Connecting and disconnecting from data sources (including file uploads for CSV).
    *   Listing databases, tables, and columns.
    *   Executing queries.
*   It includes robust error handling for API responses.

## 3. Global State Management
*   `ConnectionContext.tsx` manages the application's data source connection state and provides functions for connecting and disconnecting.
*   `VisualizationContext.tsx` manages the visualization-related state, including selected fields, available metadata, query results, and associated loading/error states, using a reducer for state updates.

## 4. Loading States and Timeout Management
*   **Loading State Management**: The application includes comprehensive loading states for query execution, chart rendering, and metadata operations with timeout detection and cancellation support.
*   **VisualizationContext Enhancement**: Extended with additional state properties:
    *   `isLoadingQuery`, `isLoadingRendering` - Track loading states for different operations
    *   `showLoadingModal`, `loadingOperationType` - Control modal display and operation type
    *   `loadingStartTime`, `canCancelOperation` - Support timeout detection and cancellation
*   **Timeout Configuration**: `loadingConfig.ts` provides environment-specific timeout settings:
    *   Development: query (2s), rendering (50ms), metadata (3s) - shorter timeouts for testing
    *   Production: query (3s), rendering (2s), metadata (5s) - longer timeouts for stability
*   **LoadingModal Component**: Modal dialog with progress indicators, elapsed time counter, and cancel button for long-running operations.
*   **API Service Enhancement**: All API methods (`apiService.ts`) support AbortController for cancellable requests with centralized abort controller management.
*   **Web Worker Integration**: 
    *   `chartWorker.ts` handles heavy chart specification generation off the main thread
    *   `chartWorkerService.ts` manages worker communication with timeout and error handling
    *   Graceful fallback to synchronous generation when worker unavailable (with 100ms delay to ensure modal appears)
*   **Data Size Management**: 
    *   Removed automatic 10K row limit for queries with 2 continuous dimensions
    *   Data size issues are handled separately through smart data management strategies
    *   Performance warnings and validation for large datasets (>50K rows)

## 5. Chart Specification Generation
*   The `observable-plot-generator` directory is responsible for generating Observable Plot specifications for charts.
*   It uses a strategy pattern to:
    *   Classify fields (`FieldClassifier`).
    *   Determine faceting (`FacetingManager`).
    *   Select the appropriate chart type (TickStrip, Bar, Line, Scatter) based on the provided fields. 
        * rules for charts:
            * A continuous dimension only (no measures) creates a tick-strip chart showing distribution of values
            * single measure on one dimension creates a bar chart with a single bar in the right horizontal/vertical direction
            * A measure on X and a measure on Y axis creates a scatter plot with a single point (aggregated values)
            * A continous dimension on one axis and a measure on the other creates a line chart
            * A continous dimension on both axes creates a scatter plot (we still need to find a solution for large datasets)
            * more rules will follow soon
    *   When only discrete dimensions are present (no measures or continuous dimensions), an AG Grid Community table view is rendered instead of a chart with different layouts based on axis positioning:
        *   Y-axis only: Vertical column showing unique values
        *   X-axis only: Horizontal row showing unique values  
        *   Both axes: Grid layout where X values become columns, Y values become rows, and cells show "Abc" where combinations exist
        *   Multiple dimensions on same axis: Hierarchical grouping with leftmost dimension as outer grouping
    *   Fields have the following attributes:
        *   type: discrete (e.g. a category) and continous (numerical)
        *   flavour: dimension (cannot aggregate) and measures (must be aggregated)
        *   Dimensions can be discrete (category or also numerical, but then every unique number is a "category") and continous (raw numerical data series)
        *   Measures can be discrete and continous
        *   Discrete measures have less aggregations (count, countd, min, max), where min/max are alphapetical
        *   Continous measures have more aggregations (additionally avg, median, sum)
        *   Continous dimensions cannot be of type string
    *   Chart types need a certain set of type of fields on their axes (FieldClassifier)
    *   Faceting is on top of basic charts
        *   Faceting is triggered by discrete dimensions on one of the axis. The first discrete dimention determines the category for some basic charts (e.g. bar). Further dimensions define the hierarchical faceting.
        *   Discrete dimensions on X axis causes horizontal faceting, Y axis vertical. On both axes a 2-dimensional facet matrix is generated.
        *   Multiple measures on the same axis create multiple charts of the same type (X->horizontal, Y-> vertical). Faceting is on top.
