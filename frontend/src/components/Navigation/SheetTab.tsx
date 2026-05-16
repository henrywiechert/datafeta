// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { useState } from 'react';
import {
  Tab,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  IconButton,
} from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { useSheetContext } from '../../contexts/SheetContext';

interface SheetTabProps {
  sheetId: string;
  label: string;
  value: string;
}

export default function SheetTab({ sheetId, label, value }: SheetTabProps) {
  const { state, renameSheet, duplicateSheet, removeSheet } = useSheetContext();
  
  const [contextMenu, setContextMenu] = useState<{
    mouseX: number;
    mouseY: number;
  } | null>(null);
  
  const [renameDialog, setRenameDialog] = useState(false);
  const [newName, setNewName] = useState('');

  const handleContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({
      mouseX: event.clientX - 2,
      mouseY: event.clientY - 4,
    });
  };

  const handleCloseContextMenu = () => {
    setContextMenu(null);
  };

  const handleRenameClick = () => {
    setNewName(label);
    setRenameDialog(true);
    handleCloseContextMenu();
  };

  const handleRenameConfirm = () => {
    if (newName.trim()) {
      renameSheet(sheetId, newName.trim());
    }
    setRenameDialog(false);
    setNewName('');
  };

  const handleDuplicateClick = () => {
    duplicateSheet(sheetId);
    handleCloseContextMenu();
  };

  const handleDeleteClick = () => {
    if (state.sheets.length > 1) {
      removeSheet(sheetId);
    }
    handleCloseContextMenu();
  };

  return (
    <>
      <Tab
        label={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <span>{label}</span>
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                handleContextMenu(e);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              sx={{ ml: 0.5, p: 0.25 }}
            >
              <MoreVertIcon fontSize="small" />
            </IconButton>
          </Box>
        }
        value={value}
        sx={{
          '&.Mui-selected': {
            fontWeight: 600,
          },
          textTransform: 'none',
        }}
      />

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
      <Dialog open={renameDialog} onClose={() => setRenameDialog(false)} maxWidth="sm" fullWidth>
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
          <Button onClick={() => setRenameDialog(false)}>Cancel</Button>
          <Button onClick={handleRenameConfirm} variant="contained" disabled={!newName.trim()}>
            Rename
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
