// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { useRef, useState } from 'react';
import { Button, Menu, MenuItem, ListItemIcon, ListItemText, Divider, CircularProgress, Typography } from '@mui/material';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import CloudIcon from '@mui/icons-material/Cloud';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import SaveAsIcon from '@mui/icons-material/SaveAs';
import NoteAddIcon from '@mui/icons-material/NoteAdd';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import ShareIcon from '@mui/icons-material/Share';
import { SavedConfiguration } from '../types';

function startFromScratch() {
  window.location.href = '/';
}

interface SaveLoadMenuProps {
  /** Export the configuration to a local JSON file. */
  onExportFile: () => void;
  onLoad: (config: SavedConfiguration) => void;
  onOpenGallery?: () => void;
  /** Update the open snapshot in place (or prompt for a name if none is open). */
  onSave?: () => Promise<void>;
  /** Always create a new snapshot under a new name. */
  onSaveAs?: () => void;
  /** Open the Share dialog for the open snapshot. */
  onShare?: () => void;
  /** Start from scratch by reloading the app. */
  onNew?: () => void;
  serverStorageReadable?: boolean;
  serverStorageWritable?: boolean;
}

export default function SaveLoadMenu({
  onExportFile,
  onLoad,
  onOpenGallery,
  onSave,
  onSaveAs,
  onShare,
  onNew = startFromScratch,
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

  const handleShare = () => {
    handleClose();
    onShare?.();
  };

  const handleNew = () => {
    handleClose();
    onNew();
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
      <Button
        onClick={handleClick}
        size="small"
        endIcon={<ArrowDropDownIcon fontSize="small" />}
        aria-label="File"
        aria-controls={open ? 'save-load-menu' : undefined}
        aria-haspopup="true"
        aria-expanded={open ? 'true' : undefined}
        id="save-load-button"
        sx={{
          textTransform: 'none',
          fontWeight: 600,
          minWidth: 0,
          px: 0.75,
          py: 0.125,
          fontSize: '0.8rem',
          lineHeight: 1.4,
          color: 'text.primary',
          '& .MuiButton-endIcon': { ml: 0.125, mr: -0.25 },
        }}
      >
        File
      </Button>
      <Menu
        id="save-load-menu"
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        MenuListProps={{
          'aria-labelledby': 'save-load-button',
        }}
      >
        <MenuItem onClick={handleNew}>
          <ListItemIcon>
            <NoteAddIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>New</ListItemText>
        </MenuItem>
        <Divider sx={{ my: 0.5 }} />

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
            {onShare && (
              <MenuItem onClick={handleShare}>
                <ListItemIcon>
                  <ShareIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>Share...</ListItemText>
              </MenuItem>
            )}
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

