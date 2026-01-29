import React, { useRef, useState } from 'react';
import { IconButton, Menu, MenuItem, ListItemIcon, ListItemText, Tooltip, Divider, CircularProgress } from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import CloudIcon from '@mui/icons-material/Cloud';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import { SavedConfiguration } from '../types';

interface SaveLoadMenuProps {
  onSave: () => void;
  onLoad: (config: SavedConfiguration) => void;
  onOpenGallery?: () => void;
  onQuickSave?: () => Promise<void>;
}

export default function SaveLoadMenu({ onSave, onLoad, onOpenGallery, onQuickSave }: SaveLoadMenuProps) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [isQuickSaving, setIsQuickSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const open = Boolean(anchorEl);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleOpenGallery = () => {
    handleClose();
    onOpenGallery?.();
  };

  const handleQuickSave = async () => {
    if (!onQuickSave) return;
    setIsQuickSaving(true);
    try {
      await onQuickSave();
    } finally {
      setIsQuickSaving(false);
      handleClose();
    }
  };

  const handleSave = () => {
    handleClose();
    onSave();
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
            <MenuItem onClick={handleOpenGallery}>
              <ListItemIcon>
                <CloudIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Saved Configurations...</ListItemText>
            </MenuItem>
            <MenuItem onClick={handleQuickSave} disabled={isQuickSaving}>
              <ListItemIcon>
                {isQuickSaving ? (
                  <CircularProgress size={20} />
                ) : (
                  <CloudUploadIcon fontSize="small" />
                )}
              </ListItemIcon>
              <ListItemText>Quick Save to Server</ListItemText>
            </MenuItem>
            <Divider sx={{ my: 0.5 }} />
          </>
        )}
        
        {/* File Export/Import Section */}
        <MenuItem onClick={handleSave}>
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

