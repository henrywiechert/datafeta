# Frontend Documentation

The frontend is a React-based data analysis application that provides an intuitive interface for connecting to data sources, exploring data, and creating interactive visualizations.

## Application Overview

### Core Components
- **UI Framework**: React with TypeScript and Material-UI
- **Chart Library**: Observable Plot for dynamic visualization generation
- **State Management**: Context-based architecture with global state providers
- **API Integration**: Comprehensive service layer for backend communication

### Main Features
- **Data Source Connection**: Support for database connections and file uploads
- **Interactive Visualization**: Dynamic chart generation with intelligent field classification
- **Multi-Chart Faceting**: Advanced faceting capabilities for complex data exploration
- **Responsive Design**: Adaptive layouts for various screen sizes
- **Loading Management**: Comprehensive loading states with timeout handling

## Application Structure

The application is built with React and consists of two main pages:

1. **Data Source Selection Page**: Interface for connecting to databases or uploading files
2. **Visualization Page**: Interactive data exploration and chart generation interface

### Key Directories
- `src/components/` - React components including visualization components
- `src/contexts/` - Global state management (Connection and Visualization contexts)
- `src/services/` - API communication layer
- `src/observable-plot-generator/` - Chart generation engine
- `src/utils/` - Utility functions including field classification

## Architecture Details

### State Management
- **ConnectionContext**: Manages data source connections and metadata
- **VisualizationContext**: Handles field selection, query results, and chart state

### Chart Generation Pipeline
1. Field classification and analysis
2. Chart type selection based on field characteristics
3. Faceting determination for multi-dimensional data
4. Observable Plot specification generation
5. Responsive rendering with CSS Grid layouts

## Detailed Documentation

- [Observable Plot Charts](./observable-plot.md) - Chart generation and Observable Plot implementation
- [Faceting System](./faceting.md) - Multi-chart faceting and layout details
- [Field Classification](./fields.md) - Field types, flavours, and classification logic
- [API Communication](./api.md) - Frontend-backend API interaction and query handling

## Development

### Available Scripts
- `npm start` - Run development server
- `npm test` - Run test suite
- `npm run build` - Build for production

### Key Technologies
- React 18 with TypeScript
- Material-UI for component library
- Observable Plot for chart generation
- AG Grid Community for table views