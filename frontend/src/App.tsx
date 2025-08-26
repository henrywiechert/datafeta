import React, { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Tabs, Tab, Box, CssBaseline } from '@mui/material';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { VisualizationProvider } from './contexts/VisualizationContext';
import './App.css';

const DataSourceSelectionPage = lazy(() => import('./pages/DataSourceSelectionPage'));
const VisualizationPage = lazy(() => import('./pages/VisualizationPage'));

// Create a MUI theme to standardize fonts and input appearance
const theme = createTheme({
  shape: { borderRadius: 8 },
  typography: {
    fontFamily: `Montserrat, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', Arial, sans-serif`,
    button: {
      textTransform: 'none',
      fontWeight: 600,
    }
  },
  palette: {
    primary: {
      main: '#007bff',
    },
  },
  components: {
    MuiTextField: {
      defaultProps: { size: 'small', variant: 'outlined' },
    },
    MuiFormControl: {
      defaultProps: { size: 'small', variant: 'outlined' },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          '& .MuiOutlinedInput-notchedOutline': { 
            borderWidth: 1,
            borderColor: 'rgba(0, 0, 0, 0.23)',
          },
          '&:hover .MuiOutlinedInput-notchedOutline': { 
            borderWidth: 1,
            borderColor: 'rgba(0, 0, 0, 0.5)',
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderWidth: 1.5,
            borderColor: '#007bff',
          },
        },
        input: {
          fontFamily: `Montserrat, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', Arial, sans-serif`,
        },
      },
    },
  },
});

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
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <VisualizationProvider>
        <Router>
          <AppContent />
        </Router>
      </VisualizationProvider>
    </ThemeProvider>
  );
}

export default App;
