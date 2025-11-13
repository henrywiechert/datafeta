import React, { useState } from 'react';
import { Button, Menu, MenuItem, Box, Tooltip } from '@mui/material';
import PaletteIcon from '@mui/icons-material/Palette';

interface ManualColorSelectorProps {
  value: string;
  onChange: (color: string) => void;
}

// A small set of predefined brand / utility colors
const PREDEFINED_COLORS: string[] = [
  '#1976d2', // primary blue
  '#2e7d32', // green
  '#ed6c02', // orange
  '#d32f2f', // red
  '#6a1b9a', // purple
  '#00838f', // teal
  '#455a64', // blue gray
];

const ManualColorSelector: React.FC<ManualColorSelectorProps> = ({ value, onChange }) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleSelect = (color: string) => {
    onChange(color);
    handleClose();
  };

  return (
    <>
      <Tooltip title="Pick a fixed color">
        <Button
          size="small"
          onClick={handleClick}
          startIcon={<PaletteIcon fontSize="small" />}
          sx={{
            fontSize: '12px',
            padding: '2px 8px',
            textTransform: 'none',
            minWidth: 'auto',
            color: '#1976d2',
            '&:before': {
              content: '""',
              display: 'inline-block',
              width: 12,
              height: 12,
              borderRadius: '50%',
              backgroundColor: value,
              border: '1px solid rgba(0,0,0,0.2)',
              marginRight: 0.5,
            },
            '&:hover': {
              backgroundColor: 'rgba(25, 118, 210, 0.04)',
            },
          }}
        >
          Color
        </Button>
      </Tooltip>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
        PaperProps={{
          sx: {
            maxHeight: 320,
            width: 200,
          },
        }}
      >
        {PREDEFINED_COLORS.map((color) => (
          <MenuItem
            key={color}
            onClick={() => handleSelect(color)}
          >
            <Box
              sx={{
                width: 18,
                height: 18,
                borderRadius: '50%',
                backgroundColor: color,
                border: '1px solid rgba(0,0,0,0.2)',
                mr: 1.5,
              }}
            />
            <Box component="span" sx={{ fontFamily: 'monospace', fontSize: 12 }}>
              {color}
            </Box>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
};

export default ManualColorSelector;
