// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { ConnectionProvider } from './contexts/ConnectionContext';
import { DataSourceProvider } from './contexts/DataSourceContext';
import { AppConfigProvider } from './contexts/AppConfigContext';
import { initializeTabSession } from './utils/tabSession';

// Initialize tab-level session management (generates tab ID, sets up cleanup)
initializeTabSession();

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
// Provider hierarchy:
// 1. AppConfigProvider  - app-wide configuration
// 2. DataSourceProvider - session-scoped metadata (databases, tables, fields)
// 3. ConnectionProvider - connection state (depends on DataSourceContext;
//    signals query-state reset via resetBus to the per-sheet VisualizationProvider
//    created inside VisualizationPage with key={activeSheet?.id}).
root.render(
  <React.StrictMode>
    <AppConfigProvider>
      <DataSourceProvider>
        <ConnectionProvider>
          <App />
        </ConnectionProvider>
      </DataSourceProvider>
    </AppConfigProvider>
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
