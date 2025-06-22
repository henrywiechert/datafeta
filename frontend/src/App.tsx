import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import DataSourceSelectionPage from './pages/DataSourceSelectionPage';
import VisualizationPage from './pages/VisualizationPage';
import VisualizationPageNew from './pages/VisualizationPageNew';
import VisualizationPageLibrary from './pages/VisualizationPageLibrary';
import './App.css';

function App() {
  // For now, App component only sets up the routing
  // State management for connection will likely need to be lifted
  // or handled via context/global state later.

  return (
    <Router>
      <div className="App">
        {/* Basic Navigation (can be improved) */}
        <nav style={{ marginBottom: '20px', borderBottom: '1px solid #ccc', paddingBottom: '10px' }}>
          <Link to="/" style={{ marginRight: '15px' }}>Data Sources</Link>
          <Link to="/visualize" style={{ marginRight: '15px' }}>Original</Link>
          <Link to="/visualize-new" style={{ marginRight: '15px' }}>Custom Layout</Link>
          <Link to="/visualize-library">Library (react-resizable-panels)</Link>
        </nav>

        <Routes>
          <Route path="/" element={<DataSourceSelectionPage />} />
          <Route path="/visualize" element={<VisualizationPage />} />
          <Route path="/visualize-new" element={<VisualizationPageNew />} />
          <Route path="/visualize-library" element={<VisualizationPageLibrary />} />
          {/* Add other routes as needed */}
        </Routes>
      </div>
    </Router>
  );
}

export default App;
