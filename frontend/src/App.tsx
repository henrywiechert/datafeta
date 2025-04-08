import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import DataSourceSelectionPage from './pages/DataSourceSelectionPage';
import VisualizationPage from './pages/VisualizationPage';
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
          <Link to="/visualize">Visualize</Link>
        </nav>

        <Routes>
          <Route path="/" element={<DataSourceSelectionPage />} />
          <Route path="/visualize" element={<VisualizationPage />} />
          {/* Add other routes as needed */}
        </Routes>
      </div>
    </Router>
  );
}

export default App;
