import React, { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Tabs, Tab, Box } from '@mui/material';
import './App.css';

const DataSourceSelectionPage = lazy(() => import('./pages/DataSourceSelectionPage'));
const VisualizationPage = lazy(() => import('./pages/VisualizationPage'));

function AppContent() {
  const location = useLocation();
  const navigate = useNavigate();
  const currentTab = location.pathname.startsWith('/visualize') ? 1 : 0;

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    navigate(newValue === 1 ? '/visualize' : '/');
  };

  return (
    <div className="App">
      {/* Main content area */}
      <Box sx={{ flexGrow: 1, overflow: 'hidden' }}>
        <Suspense fallback={null}>
          <Routes>
            <Route path="/" element={<DataSourceSelectionPage />} />
            <Route path="/visualize" element={<VisualizationPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </Box>

      {/* Bottom tabs */}
      <Box sx={{ borderTop: 1, borderColor: 'divider', flexShrink: 0}}>
        <Tabs
          value={currentTab}
          onChange={handleTabChange}
          variant="standard"
          indicatorColor="secondary"
          textColor="secondary"
          aria-label="Data Slicer navigation"
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
    <Router>
      <AppContent />
    </Router>
  );
}

export default App;
