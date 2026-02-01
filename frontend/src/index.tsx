import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { ConnectionProvider } from './contexts/ConnectionContext';
import { VisualizationProvider } from './contexts/VisualizationContext';
import { DataSourceProvider } from './contexts/DataSourceContext';
import { initializeTabSession } from './utils/tabSession';

// Initialize tab-level session management (generates tab ID, sets up cleanup)
initializeTabSession();

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
// Provider hierarchy:
// 1. DataSourceProvider - session-scoped metadata (databases, tables, fields)
// 2. VisualizationProvider - per-sheet visualization state (outer instance for ConnectionContext)
// 3. ConnectionProvider - connection state (depends on both DataSourceContext and VisualizationContext)
// Note: App.tsx has its own DataSourceProvider which is redundant but harmless (nested providers)
// Note: VisualizationPage.tsx creates per-sheet VisualizationProviders with key={activeSheet?.id}
root.render(
  <React.StrictMode>
    <DataSourceProvider>
      <VisualizationProvider>
        <ConnectionProvider>
          <App />
        </ConnectionProvider>
      </VisualizationProvider>
    </DataSourceProvider>
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
