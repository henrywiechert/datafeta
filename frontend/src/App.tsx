import React, { lazy, Suspense, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Tabs, Tab, Box, IconButton, Tooltip, Menu, MenuItem, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { SheetProvider, useSheetContext } from './contexts/SheetContext';
import './App.css';

const DataSourceSelectionPage = lazy(() => import('./pages/DataSourceSelectionPage'));
const VisualizationPage = lazy(() => import('./pages/VisualizationPage'));

function AppContent() {
  const location = useLocation();
  const navigate = useNavigate();
  const isDataSourcePage = location.pathname === '/';
  const isVisualizationPage = location.pathname.startsWith('/visualize');
  
  const { state, setActiveSheet, addSheet, renameSheet, duplicateSheet, removeSheet } = useSheetContext();
  
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

  // Determine current tab value
  const currentTab = isDataSourcePage ? 'datasources' : state.activeSheetId;

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
    </div>
  );
}

function App() {
  return (
    <Router>
      <SheetProvider>
        <AppContent />
      </SheetProvider>
    </Router>
  );
}

export default App;
