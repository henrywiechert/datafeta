import React, { useState } from 'react';
import {
  Box,
  Tabs,
  Tab,
  IconButton,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Tooltip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { useSheetContext } from '../../contexts/SheetContext';

export default function SheetTabs() {
  const { state, activeSheet, addSheet, removeSheet, renameSheet, setActiveSheet, duplicateSheet } = useSheetContext();
  
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

  const handleContextMenu = (event: React.MouseEvent, sheetId: string) => {
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

  const handleRenameCancel = () => {
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

  const handleTabChange = (_event: React.SyntheticEvent, newValue: string) => {
    setActiveSheet(newValue);
  };

  const handleAddSheet = () => {
    addSheet();
  };

  return (
    <>
      <Box
        sx={{
          borderTop: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
          display: 'flex',
          alignItems: 'center',
          px: 1,
          minHeight: 48,
        }}
      >
        <Tabs
          value={state.activeSheetId}
          onChange={handleTabChange}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ flexGrow: 1, minHeight: 48 }}
        >
          {state.sheets.map((sheet) => (
            <Tab
              key={sheet.id}
              value={sheet.id}
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <span>{sheet.name}</span>
                  <IconButton
                    size="small"
                    onClick={(e) => handleContextMenu(e, sheet.id)}
                    onMouseDown={(e) => e.stopPropagation()}
                    sx={{ ml: 0.5, p: 0.25 }}
                  >
                    <MoreVertIcon fontSize="small" />
                  </IconButton>
                </Box>
              }
              sx={{ 
                minHeight: 48, 
                textTransform: 'none',
                '&.Mui-selected': {
                  fontWeight: 600,
                },
              }}
            />
          ))}
        </Tabs>
        <Tooltip title="Add new sheet">
          <IconButton 
            onClick={handleAddSheet} 
            size="small" 
            sx={{ ml: 1 }}
            color="primary"
          >
            <AddIcon />
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
        onClose={handleRenameCancel}
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
          <Button onClick={handleRenameCancel}>
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
    </>
  );
}
