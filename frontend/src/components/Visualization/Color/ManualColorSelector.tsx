import React, { useState } from 'react';
import { Button, Menu, Box, Tooltip, IconButton } from '@mui/material';
import PaletteIcon from '@mui/icons-material/Palette';
import { PREDEFINED_COLORS } from '../../../config/colorSchemes';

interface ManualColorSelectorProps {
  value: string;
  onChange: (color: string) => void;
  variant?: 'text' | 'icon';
}

const ManualColorSelector: React.FC<ManualColorSelectorProps> = ({ value, onChange, variant = 'text' }) => {
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
        {variant === 'icon' ? (
          <IconButton
            size="small"
            onClick={handleClick}
            sx={{
              width: 28,
              height: 28,
              color: '#1976d2',
              '&:hover': { backgroundColor: 'rgba(25, 118, 210, 0.04)' },
            }}
          >
            <PaletteIcon fontSize="small" sx={{ color: value }} />
          </IconButton>
        ) : (
          <Button
            size="small"
            onClick={handleClick}
            startIcon={<PaletteIcon fontSize="small" sx={{ color: value }} />}
            sx={{
              fontSize: '12px',
              padding: '2px 8px',
              textTransform: 'none',
              minWidth: 'auto',
              color: '#1976d2',
              '&:hover': {
                backgroundColor: 'rgba(25, 118, 210, 0.04)',
              },
            }}
          >
            Color
          </Button>
        )}
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
            padding: '8px',
          },
        }}
      >
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: '6px',
          }}
        >
          {PREDEFINED_COLORS.map((color) => (
            <Box
              key={color}
              onClick={() => handleSelect(color)}
              sx={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                backgroundColor: color,
                border: '1px solid rgba(0,0,0,0.2)',
                cursor: 'pointer',
                '&:hover': {
                  transform: 'scale(1.15)',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                },
                transition: 'all 0.15s ease',
              }}
            />
          ))}
        </Box>
      </Menu>
    </>
  );
};

export default ManualColorSelector;
