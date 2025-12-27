import React, { useMemo, useState } from 'react';
import {
  Box,
  Divider,
  IconButton,
  MenuItem,
  Popover,
  Tooltip,
  Typography,
} from '@mui/material';
import PaletteIcon from '@mui/icons-material/Palette';
import CheckIcon from '@mui/icons-material/Check';
import ColorBiasControl from './ColorBiasControl';
import {
  ColorScheme,
  categoricalSchemes,
  sequentialSchemes,
  divergingSchemes,
} from '../../../config/colorSchemes';
import styles from './ColorSchemeSelector.module.css';

interface ColorPalettePopoverProps {
  /** When fieldFlavour is null, the palette acts as a manual color picker */
  fieldFlavour: 'discrete' | 'continuous' | null;

  /** Scheme state (used when fieldFlavour !== null) */
  currentSchemeId?: string;
  onSchemeChange?: (schemeId: string) => void;

  /** Bias state (only used/shown when fieldFlavour === 'continuous') */
  colorBias?: number;
  onBiasChange?: (bias: number) => void;

  /** Manual color picker (used when fieldFlavour === null) */
  manualColor?: string;
  onManualColorChange?: (color: string) => void;
}

// A small set of predefined brand / utility colors (duplicated from ManualColorSelector for now)
const PREDEFINED_COLORS: string[] = [
  '#4e79a7',
  '#f28e2c',
  '#e15759',
  '#76b7b2',
  '#59a14f',
  '#edc949',
  '#af7aa1',
  '#ff9da7',
  '#9c755f',
  '#bab0ab',
];

const ColorPalettePopover: React.FC<ColorPalettePopoverProps> = ({
  fieldFlavour,
  currentSchemeId,
  onSchemeChange,
  colorBias,
  onBiasChange,
  manualColor,
  onManualColorChange,
}) => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);

  const handleOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const schemeGroups = useMemo((): { label: string; schemes: ColorScheme[] }[] => {
    if (fieldFlavour === 'discrete') {
      return [{ label: 'Categorical', schemes: categoricalSchemes }];
    }
    if (fieldFlavour === 'continuous') {
      return [
        { label: 'Sequential', schemes: sequentialSchemes },
        { label: 'Diverging', schemes: divergingSchemes },
      ];
    }
    return [];
  }, [fieldFlavour]);

  return (
    <>
      <Tooltip title={fieldFlavour ? 'Change color scheme' : 'Pick a fixed color'}>
        <IconButton
          size="small"
          onClick={handleOpen}
          sx={{
            width: 28,
            height: 28,
            color: '#1976d2',
            '&:hover': { backgroundColor: 'rgba(25, 118, 210, 0.04)' },
          }}
        >
          <PaletteIcon fontSize="small" sx={{ color: manualColor || '#1976d2' }} />
        </IconButton>
      </Tooltip>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        PaperProps={{ sx: { p: 1, width: 320 } }}
      >
        {/* No field: manual color picker */}
        {fieldFlavour === null ? (
          <Box sx={{ p: 0.5 }}>
            <Typography variant="caption" sx={{ display: 'block', mb: 0.75, fontWeight: 600, color: '#666' }}>
              Color
            </Typography>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(5, 1fr)',
                gap: '6px',
              }}
            >
              {PREDEFINED_COLORS.map((c) => (
                <Box
                  key={c}
                  onClick={() => {
                    onManualColorChange?.(c);
                    handleClose();
                  }}
                  sx={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    backgroundColor: c,
                    border: c === manualColor ? '2px solid rgba(25,118,210,0.9)' : '1px solid rgba(0,0,0,0.2)',
                    cursor: onManualColorChange ? 'pointer' : 'default',
                    '&:hover': {
                      transform: onManualColorChange ? 'scale(1.15)' : undefined,
                      boxShadow: onManualColorChange ? '0 2px 4px rgba(0,0,0,0.2)' : undefined,
                    },
                    transition: 'all 0.15s ease',
                  }}
                />
              ))}
            </Box>
          </Box>
        ) : (
          <>
            {/* Scheme chooser */}
            {schemeGroups.map((group, groupIdx) => (
              <Box key={group.label}>
                {groupIdx > 0 && <Divider sx={{ my: 1 }} />}
                <Box className={styles.groupHeader}>
                  <Typography variant="caption" className={styles.groupLabel}>
                    {group.label}
                  </Typography>
                </Box>
                {group.schemes.map((scheme) => (
                  <MenuItem
                    key={scheme.id}
                    onClick={() => {
                      onSchemeChange?.(scheme.id);
                      // Keep popover open; user might also adjust bias.
                    }}
                    selected={scheme.id === currentSchemeId}
                    className={styles.menuItem}
                    disabled={!onSchemeChange}
                  >
                    <Box className={styles.schemeOption}>
                      <Box className={styles.schemeInfo}>
                        <Box className={styles.schemeName}>
                          {scheme.name}
                          {scheme.id === currentSchemeId && (
                            <CheckIcon fontSize="small" sx={{ ml: 0.5, color: '#1976d2' }} />
                          )}
                        </Box>
                        <Box className={styles.swatches}>
                          {scheme.colors.slice(0, 8).map((color, idx) => (
                            <Box key={idx} className={styles.swatch} sx={{ backgroundColor: color }} />
                          ))}
                        </Box>
                      </Box>
                    </Box>
                  </MenuItem>
                ))}
              </Box>
            ))}

            {/* Bias (only for continuous) */}
            {fieldFlavour === 'continuous' && typeof colorBias === 'number' && onBiasChange && (
              <>
                <Divider sx={{ my: 1 }} />
                <Typography variant="caption" sx={{ display: 'block', px: 1, pb: 0.25, fontWeight: 600, color: '#666' }}>
                  Bias
                </Typography>
                <ColorBiasControl colorBias={colorBias} onChange={onBiasChange} />
              </>
            )}
          </>
        )}
      </Popover>
    </>
  );
};

export default ColorPalettePopover;


