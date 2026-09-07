// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { useRef, useState } from 'react';
import { IconButton, Menu, MenuItem, ListItemIcon, ListItemText, Tooltip, Divider, CircularProgress, Typography } from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import CloudIcon from '@mui/icons-material/Cloud';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import SaveAsIcon from '@mui/icons-material/SaveAs';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import { SavedConfiguration } from '../types';

interface SaveLoadMenuProps {
  /** Export the configuration to a local JSON file. */
  onExportFile: () => void;
  onLoad: (config: SavedConfiguration) => void;
  onOpenGallery?: () => void;
  /** Update the open snapshot in place (or prompt for a name if none is open). */
  onSave?: () => Promise<void>;
  /** Always create a new snapshot under a new name. */
  onSaveAs?: () => void;
  serverStorageReadable?: boolean;
  serverStorageWritable?: boolean;
}

export default function SaveLoadMenu({
  onExportFile,
  onLoad,
  onOpenGallery,
  onSave,
  onSaveAs,
  serverStorageReadable = true,
  serverStorageWritable = true,
}: SaveLoadMenuProps) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const open = Boolean(anchorEl);
  const shortcutHint = /Mac|iPod|iPhone|iPad/.test(navigator.platform) ? '⌘S' : 'Ctrl+S';

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleOpenGallery = () => {
    if (!serverStorageReadable) return;
    handleClose();
    onOpenGallery?.();
  };

  const handleSave = async () => {
    if (!onSave) return;
    setIsSaving(true);
    try {
      await onSave();
    } finally {
      setIsSaving(false);
      handleClose();
    }
  };

  const handleSaveAs = () => {
    handleClose();
    onSaveAs?.();
  };

  const handleExportFile = () => {
    handleClose();
    onExportFile();
  };

  const handleLoadClick = () => {
    handleClose();
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const config = JSON.parse(text);
      onLoad(config);
    } catch (error) {
      console.error('Failed to load configuration:', error);
      alert('Failed to load configuration: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }

    // Reset input so the same file can be loaded again
    event.target.value = '';
  };

  const hasServerStorage = Boolean(onOpenGallery);
  const canOpenGallery = hasServerStorage && serverStorageReadable;
  const canSave = hasServerStorage && serverStorageWritable && Boolean(onSave);
  const canSaveAs = hasServerStorage && serverStorageWritable && Boolean(onSaveAs);

  return (
    <>
      <Tooltip title="Save/Load Configuration">
        <IconButton
          onClick={handleClick}
          size="small"
          sx={{ ml: 1 }}
          aria-label="save load menu"
          aria-controls={open ? 'save-load-menu' : undefined}
          aria-haspopup="true"
          aria-expanded={open ? 'true' : undefined}
        >
          <MoreVertIcon />
        </IconButton>
      </Tooltip>
      <Menu
        id="save-load-menu"
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        MenuListProps={{
          'aria-labelledby': 'save-load-button',
        }}
      >
        {/* Server Storage Section */}
        {hasServerStorage && (
          <>
            {canSave && (
              <MenuItem onClick={handleSave} disabled={isSaving}>
                <ListItemIcon>
                  {isSaving ? (
                    <CircularProgress size={20} />
                  ) : (
                    <CloudUploadIcon fontSize="small" />
                  )}
                </ListItemIcon>
                <ListItemText>Save</ListItemText>
                <Typography variant="caption" color="text.secondary" sx={{ ml: 2 }}>
                  {shortcutHint}
                </Typography>
              </MenuItem>
            )}
            {canSaveAs && (
              <MenuItem onClick={handleSaveAs} disabled={isSaving}>
                <ListItemIcon>
                  <SaveAsIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>Save As...</ListItemText>
              </MenuItem>
            )}
            <MenuItem onClick={handleOpenGallery} disabled={!canOpenGallery}>
              <ListItemIcon>
                <CloudIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Saved Configurations...</ListItemText>
            </MenuItem>
            <Divider sx={{ my: 0.5 }} />
          </>
        )}

        {/* File Export/Import Section */}
        <MenuItem onClick={handleExportFile}>
          <ListItemIcon>
            <FileDownloadIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>{hasServerStorage ? 'Export to File...' : 'Save Configuration'}</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleLoadClick}>
          <ListItemIcon>
            <FileUploadIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>{hasServerStorage ? 'Import from File...' : 'Load Configuration'}</ListItemText>
        </MenuItem>
      </Menu>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
    </>
  );
}

