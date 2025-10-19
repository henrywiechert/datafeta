import React, { lazy, Suspense, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Tabs, Tab, Box, IconButton, Tooltip, Menu, MenuItem, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { SheetProvider, useSheetContext } from './contexts/SheetContext';
import { DataSourceProvider, useDataSource } from './contexts/DataSourceContext';
import { useConnection } from './contexts/ConnectionContext';
import SaveLoadMenu from './components/SaveLoadMenu';
import ConnectionRestoreDialog from './components/ConnectionRestoreDialog';
import { 
  exportConfiguration, 
  downloadConfigFile, 
  validateConfiguration,
  reconstructConnectionDetails 
} from './services/configurationService';
import { SavedConfiguration, SavedConnectionMetadata } from './types';
import './App.css';

const DataSourceSelectionPage = lazy(() => import('./pages/DataSourceSelectionPage'));
const VisualizationPage = lazy(() => import('./pages/VisualizationPage'));

function AppContent() {
  const location = useLocation();
  const navigate = useNavigate();
  const isDataSourcePage = location.pathname === '/';
  const isVisualizationPage = location.pathname.startsWith('/visualize');
  
  const { state, setActiveSheet, addSheet, renameSheet, duplicateSheet, removeSheet, dispatch: sheetDispatch } = useSheetContext();
  const { dataSource, setSelectedDatabase, setSelectedTable, setDatabases, setTables, setAvailableFields } = useDataSource();
  const { connectionDetails, connect } = useConnection();
  
  const [contextMenu, setContextMenu] = useState<{
    mouseX: number;
    mouseY: number;
    sheetId: string;
  } | null>(null);
  
  const [renameDialog, setRenameDialog] = useState<{
    open: boolean;
    sheetId: string;
    currentName: string;
  }>({ open: false, sheetId: '', currentName: '' });
  
  const [newName, setNewName] = useState('');
  
  // State for configuration restore
  const [pendingConfig, setPendingConfig] = useState<SavedConfiguration | null>(null);
  const [showConnectionRestore, setShowConnectionRestore] = useState(false);
  const [connectionMetadata, setConnectionMetadata] = useState<SavedConnectionMetadata | null>(null);

  const handleTabChange = (event: React.SyntheticEvent, newValue: string) => {
    if (newValue === 'datasources') {
      navigate('/');
    } else {
      // It's a sheet ID
      setActiveSheet(newValue);
      // Only navigate if we're not already on the visualization page
      if (!isVisualizationPage) {
        navigate('/visualize');
      }
    }
  };

  const handleAddSheet = (event: React.MouseEvent) => {
    event.stopPropagation();
    addSheet();
    if (!isVisualizationPage) {
      navigate('/visualize');
    }
  };

  const handleContextMenu = (event: React.MouseEvent, sheetId: string, sheetName: string) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({
      mouseX: event.clientX - 2,
      mouseY: event.clientY - 4,
      sheetId,
    });
  };

  const handleCloseContextMenu = () => {
    setContextMenu(null);
  };

  const handleRenameClick = () => {
    if (contextMenu) {
      const sheet = state.sheets.find(s => s.id === contextMenu.sheetId);
      if (sheet) {
        setNewName(sheet.name);
        setRenameDialog({
          open: true,
          sheetId: contextMenu.sheetId,
          currentName: sheet.name,
        });
      }
    }
    handleCloseContextMenu();
  };

  const handleRenameConfirm = () => {
    if (newName.trim() && renameDialog.sheetId) {
      renameSheet(renameDialog.sheetId, newName.trim());
    }
    setRenameDialog({ open: false, sheetId: '', currentName: '' });
    setNewName('');
  };

  const handleDuplicateClick = () => {
    if (contextMenu) {
      duplicateSheet(contextMenu.sheetId);
    }
    handleCloseContextMenu();
  };

  const handleDeleteClick = () => {
    if (contextMenu && state.sheets.length > 1) {
      removeSheet(contextMenu.sheetId);
    }
    handleCloseContextMenu();
  };

  // Save/Load Configuration Handlers
  const handleSaveConfiguration = () => {
    try {
      const config = exportConfiguration(
        state.sheets,
        state.activeSheetId,
        state.nextSheetNumber,
        connectionDetails,
        dataSource.selectedDatabase,
        dataSource.selectedTable
      );
      downloadConfigFile(config);
    } catch (error) {
      console.error('Failed to save configuration:', error);
      alert('Failed to save configuration: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  const handleLoadConfiguration = async (rawConfig: any) => {
    try {
      // Validate the configuration
      const config = validateConfiguration(rawConfig);
      
      // If there's connection metadata, show the connection restore dialog
      if (config.connection) {
        setPendingConfig(config);
        setConnectionMetadata(config.connection);
        setShowConnectionRestore(true);
      } else {
        // No connection, just restore sheets and data source selection
        restoreConfigurationState(config);
      }
    } catch (error) {
      console.error('Failed to load configuration:', error);
      alert('Failed to load configuration: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  const handleConnectionRestore = async (password: string, file?: File) => {
    if (!connectionMetadata || !pendingConfig) return;

    try {
      // Reconstruct connection details with password
      const details = reconstructConnectionDetails(connectionMetadata, password);
      
      // Attempt to connect
      await connect(details, file);
      
      // If connection successful, restore the rest of the configuration
      setShowConnectionRestore(false);
      restoreConfigurationState(pendingConfig);
      
      // Navigate to visualization page if not already there
      if (!isVisualizationPage) {
        navigate('/visualize');
      }
    } catch (error) {
      // Error is handled by the ConnectionRestoreDialog
      throw error;
    }
  };

  const handleConnectionRestoreCancel = () => {
    setShowConnectionRestore(false);
    setPendingConfig(null);
    setConnectionMetadata(null);
  };

  const handleConnectionRestoreSkip = () => {
    if (pendingConfig) {
      setShowConnectionRestore(false);
      restoreConfigurationState(pendingConfig);
    }
  };

  const restoreConfigurationState = (config: SavedConfiguration) => {
    try {
      // Restore sheets
      sheetDispatch({ type: 'LOAD_SHEETS', payload: config.sheets });
      
      // Restore active sheet if specified
      if (config.activeSheetId) {
        setActiveSheet(config.activeSheetId);
      }
      
      // Navigate to visualization page first if we have sheets
      // This ensures the visualization page hooks are mounted before we restore data source
      if (config.sheets.length > 0 && !isVisualizationPage) {
        navigate('/visualize');
      }
      
      // Restore data source selection after navigation
      // Give React time to mount the visualization page and its hooks
      if (config.dataSource && connectionDetails?.type !== 'csv') {
        // For ClickHouse: restore database and table selection
        // Use requestAnimationFrame to wait for next render cycle
        requestAnimationFrame(() => {
          setTimeout(() => {
            // Clear metadata arrays first to ensure useEffects trigger fetches
            setDatabases([]);
            setTables([]);
            setAvailableFields([]);
            
            // Then set the restored database and table
            // The useEffects in useVisualizationState will detect these changes
            // and fetch the appropriate metadata (databases -> tables -> columns)
            if (config.dataSource!.selectedDatabase) {
              setSelectedDatabase(config.dataSource!.selectedDatabase);
            }
            if (config.dataSource!.selectedTable) {
              setSelectedTable(config.dataSource!.selectedTable);
            }
          }, 0);
        });
      }
      // For CSV: Don't restore anything - let the natural useEffect flow handle it
      // The fetchTables will auto-detect and select the single table
      
      setPendingConfig(null);
      setConnectionMetadata(null);
    } catch (error) {
      console.error('Failed to restore configuration state:', error);
      alert('Failed to restore configuration: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  // Determine current tab value
  const currentTab = isDataSourcePage ? 'datasources' : state.activeSheetId;

  return (
    <div className="App">
      {/* Top bar with Save/Load menu */}
      <Box sx={{ 
        position: 'absolute',
        top: 8,
        right: 8,
        zIndex: 1000,
      }}>
        <SaveLoadMenu 
          onSave={handleSaveConfiguration}
          onLoad={handleLoadConfiguration}
        />
      </Box>

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

      {/* Bottom tabs - Data Sources + Sheet Tabs */}
      <Box sx={{ 
        borderTop: 1, 
        borderColor: 'divider', 
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        bgcolor: 'background.paper'
      }}>
        <Tabs
          value={currentTab}
          onChange={handleTabChange}
          variant="scrollable"
          scrollButtons="auto"
          indicatorColor="secondary"
          textColor="secondary"
          aria-label="Data Slicer navigation"
          className="compact-tabs"
          sx={{ flexGrow: 0 }}
        >
          <Tab label="Data Sources" value="datasources" sx={{ textTransform: 'none' }} />
          {state.sheets.map((sheet) => (
            <Tab
              key={sheet.id}
              value={sheet.id}
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <span>{sheet.name}</span>
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleContextMenu(e, sheet.id, sheet.name);
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    sx={{ ml: 0.5, p: 0.25 }}
                  >
                    <MoreVertIcon fontSize="small" />
                  </IconButton>
                </Box>
              }
              sx={{
                '&.Mui-selected': {
                  fontWeight: 600,
                },
                textTransform: 'none',
              }}
            />
          ))}
        </Tabs>
        <Tooltip title="Add new sheet">
          <IconButton 
            onClick={handleAddSheet} 
            size="small" 
            sx={{ 
              ml: 0.5,
              minWidth: 40,
              height: 40,
              borderRadius: 1,
            }}
            color="primary"
          >
            <AddIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Context Menu */}
      <Menu
        open={contextMenu !== null}
        onClose={handleCloseContextMenu}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu !== null
            ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
            : undefined
        }
      >
        <MenuItem onClick={handleRenameClick}>Rename</MenuItem>
        <MenuItem onClick={handleDuplicateClick}>Duplicate</MenuItem>
        <MenuItem
          onClick={handleDeleteClick}
          disabled={state.sheets.length === 1}
        >
          Delete {state.sheets.length === 1 && '(Last sheet)'}
        </MenuItem>
      </Menu>

      {/* Rename Dialog */}
      <Dialog 
        open={renameDialog.open} 
        onClose={() => setRenameDialog({ open: false, sheetId: '', currentName: '' })}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Rename Sheet</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Sheet Name"
            fullWidth
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleRenameConfirm();
              }
            }}
            placeholder="Enter sheet name"
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameDialog({ open: false, sheetId: '', currentName: '' })}>
            Cancel
          </Button>
          <Button 
            onClick={handleRenameConfirm} 
            variant="contained"
            disabled={!newName.trim()}
          >
            Rename
          </Button>
        </DialogActions>
      </Dialog>

      {/* Connection Restore Dialog */}
      <ConnectionRestoreDialog
        open={showConnectionRestore}
        connectionMetadata={connectionMetadata}
        onConnect={handleConnectionRestore}
        onCancel={handleConnectionRestoreCancel}
        onSkip={handleConnectionRestoreSkip}
      />
    </div>
  );
}

function App() {
  return (
    <Router>
      <DataSourceProvider>
        <SheetProvider>
          <AppContent />
        </SheetProvider>
      </DataSourceProvider>
    </Router>
  );
}

export default App;
