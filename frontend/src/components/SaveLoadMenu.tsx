import React, { useRef, useState } from 'react';
import { IconButton, Menu, MenuItem, ListItemIcon, ListItemText, Tooltip } from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { SavedConfiguration } from '../types';

interface SaveLoadMenuProps {
  onSave: () => void;
  onLoad: (config: SavedConfiguration) => void;
}

export default function SaveLoadMenu({ onSave, onLoad }: SaveLoadMenuProps) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const open = Boolean(anchorEl);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
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
        <MenuItem onClick={handleSave}>
          <ListItemIcon>
            <SaveIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Save Configuration</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleLoadClick}>
          <ListItemIcon>
            <FolderOpenIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Load Configuration</ListItemText>
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

