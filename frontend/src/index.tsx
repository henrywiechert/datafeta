import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { ConnectionProvider } from './contexts/ConnectionContext';
import { VisualizationProvider } from './contexts/VisualizationContext';
import { initializeTabSession } from './utils/tabSession';

// Initialize tab-level session management (generates tab ID, sets up cleanup)
initializeTabSession();

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <VisualizationProvider>
      <ConnectionProvider>
        <App />
      </ConnectionProvider>
    </VisualizationProvider>
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
