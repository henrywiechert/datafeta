import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, useLocation, useNavigate } from 'react-router-dom';
import { Tabs, Tab, Box } from '@mui/material';
import DataSourceSelectionPage from './pages/DataSourceSelectionPage';
import VisualizationPage from './pages/VisualizationPage';
import { VisualizationProvider } from './contexts/VisualizationContext';
import './App.css';

function AppContent() {
  const location = useLocation();
  const navigate = useNavigate();
  const [tabValue, setTabValue] = useState(0);

  // Update tab value based on current route
  useEffect(() => {
    if (location.pathname === '/') {
      setTabValue(0);
    } else if (location.pathname === '/visualize') {
      setTabValue(1);
    }
  }, [location.pathname]);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
    if (newValue === 0) {
      navigate('/');
    } else if (newValue === 1) {
      navigate('/visualize');
    }
  };

  const renderCurrentPage = () => {
    if (location.pathname === '/visualize') {
      return <VisualizationPage />;
    }
    return <DataSourceSelectionPage />;
  };

  return (
    <div 
      className="App" 
      style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        height: '100vh',
        padding: 0,
        margin: 0,
        overflow: 'hidden'
      }}
    >
      {/* Main content area */}
      <Box sx={{ flexGrow: 1, overflow: 'hidden' }}>
        {renderCurrentPage()}
      </Box>

      {/* Bottom tabs */}
      <Box sx={{ borderTop: 1, borderColor: 'divider', flexShrink: 0}}>
        <Tabs
          value={tabValue}
          onChange={handleTabChange}
          variant="standard"
          indicatorColor="secondary"
          textColor="secondary"
          className="compact-tabs"
        >
          <Tab label="Data Sources" />
          <Tab label="Visualization" />
        </Tabs>
      </Box>
    </div>
  );
}

function App() {
  return (
    <VisualizationProvider>
      <Router>
        <AppContent />
      </Router>
    </VisualizationProvider>
  );
}

export default App;
