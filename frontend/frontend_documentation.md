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

## 4. Chart Specification Generation
*   The `spec-generator` directory, specifically `specGeneratorV2.ts`, is responsible for generating Vega-Lite specifications for charts.
*   It uses a strategy pattern to:
    *   Classify fields (`FieldClassifier`).
    *   Determine faceting (`FacetingManager`).
    *   Select the appropriate chart type (Bar, Line, Scatter) based on the provided fields. 