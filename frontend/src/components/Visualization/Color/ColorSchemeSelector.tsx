import React, { useState } from 'react';
import {
  Button,
  Menu,
  MenuItem,
  Box,
  Typography,
  Divider,
  Tooltip,
  IconButton,
} from '@mui/material';
import PaletteIcon from '@mui/icons-material/Palette';
import CheckIcon from '@mui/icons-material/Check';
import {
  ColorScheme,
  categoricalSchemes,
  sequentialSchemes,
  divergingSchemes,
} from '../../../config/colorSchemes';
import styles from './ColorSchemeSelector.module.css';

interface ColorSchemeSelectorProps {
  currentSchemeId: string;
  fieldFlavour: 'discrete' | 'continuous' | null;
  onSchemeChange: (schemeId: string) => void;
  variant?: 'text' | 'icon';
}

const ColorSchemeSelector: React.FC<ColorSchemeSelectorProps> = ({
  currentSchemeId,
  fieldFlavour,
  onSchemeChange,
  variant = 'text',
}) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleSchemeSelect = (schemeId: string) => {
    onSchemeChange(schemeId);
    handleClose();
  };

  // Determine which schemes to show based on field flavour
  const getRelevantSchemes = (): { label: string; schemes: ColorScheme[] }[] => {
    if (fieldFlavour === 'discrete') {
      return [
        { label: 'Categorical', schemes: categoricalSchemes },
      ];
    } else if (fieldFlavour === 'continuous') {
      return [
        { label: 'Sequential', schemes: sequentialSchemes },
        { label: 'Diverging', schemes: divergingSchemes },
      ];
    }
    // Show all if no field selected
    return [
      { label: 'Categorical', schemes: categoricalSchemes },
      { label: 'Sequential', schemes: sequentialSchemes },
      { label: 'Diverging', schemes: divergingSchemes },
    ];
  };

  const renderColorSwatches = (colors: string[]) => {
    return (
      <Box className={styles.swatches}>
        {colors.slice(0, 8).map((color, idx) => (
          <Box
            key={idx}
            className={styles.swatch}
            sx={{ backgroundColor: color }}
          />
        ))}
      </Box>
    );
  };

  const schemeGroups = getRelevantSchemes();

  return (
    <>
      <Tooltip title="Change color scheme">
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
            <PaletteIcon fontSize="small" />
          </IconButton>
        ) : (
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
              '&:hover': {
                backgroundColor: 'rgba(25, 118, 210, 0.04)',
              },
            }}
          >
            Scheme
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
            maxHeight: 400,
            width: 280,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          },
        }}
      >
        {schemeGroups.map((group, groupIdx) => (
          <Box key={group.label}>
            {groupIdx > 0 && <Divider />}
            <Box className={styles.groupHeader}>
              <Typography variant="caption" className={styles.groupLabel}>
                {group.label}
              </Typography>
            </Box>
            {group.schemes.map((scheme) => (
              <MenuItem
                key={scheme.id}
                onClick={() => handleSchemeSelect(scheme.id)}
                selected={scheme.id === currentSchemeId}
                className={styles.menuItem}
              >
                <Box className={styles.schemeOption}>
                  <Box className={styles.schemeInfo}>
                    <Box className={styles.schemeName}>
                      {scheme.name}
                      {scheme.id === currentSchemeId && (
                        <CheckIcon
                          fontSize="small"
                          sx={{ ml: 0.5, color: '#1976d2' }}
                        />
                      )}
                    </Box>
                    {renderColorSwatches(scheme.colors)}
                  </Box>
                </Box>
              </MenuItem>
            ))}
          </Box>
        ))}
      </Menu>
    </>
  );
};

export default ColorSchemeSelector;
