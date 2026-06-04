// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
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
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import ColorBiasControl from './ColorBiasControl';
import {
  ColorScheme,
  categoricalSchemes,
  sequentialSchemes,
  divergingSchemes,
  PREDEFINED_COLORS,
} from '../../../config/colorSchemes';

interface ColorPalettePopoverProps {
  /** When fieldFlavour is null, the palette acts as a manual color picker */
  fieldFlavour: 'discrete' | 'continuous' | null;

  /** Scheme state (used when fieldFlavour !== null) */
  currentSchemeId?: string;
  onSchemeChange?: (schemeId: string) => void;

  /** Bias state (only used/shown when fieldFlavour === 'continuous') */
  colorBias?: number;
  onBiasChange?: (bias: number) => void;

  /** Reverse gradient (only used/shown when fieldFlavour === 'continuous') */
  colorReversed?: boolean;
  onReverseChange?: (reversed: boolean) => void;

  /** Manual color picker (used when fieldFlavour === null) */
  manualColor?: string;
  onManualColorChange?: (color: string) => void;
}

const ColorPalettePopover: React.FC<ColorPalettePopoverProps> = ({
  fieldFlavour,
  currentSchemeId,
  onSchemeChange,
  colorBias,
  onBiasChange,
  colorReversed = false,
  onReverseChange,
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

  const paperSx = useMemo(() => {
    const isManualOnly = fieldFlavour === null;
    return {
      p: 0.5,
      // Manual picker should be compact; schemes need more room.
      width: isManualOnly ? 'fit-content' : 280,
      maxWidth: 'calc(100vw - 16px)',
      borderRadius: 1,
    } as const;
  }, [fieldFlavour]);

  return (
    <>
      <Tooltip
        title={fieldFlavour ? 'Change color scheme' : 'Pick a fixed color'}
        enterDelay={500}
        leaveDelay={100}
      >
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
        // Open "inward" (to the left) so it doesn't run off the right edge of the panel
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{
          sx: paperSx,
        }}
      >
        {/* No field: manual color picker */}
        {fieldFlavour === null ? (
          <Box sx={{ p: 0.25 }}>
            <Typography variant="caption" sx={{ display: 'block', mb: 0.5, fontWeight: 600, color: '#666' }}>
              Color
            </Typography>
            <Box
              sx={{
                display: 'grid',
                // Use fixed-size columns so spacing is controlled by `gap` (avoid huge 1fr cell spacing)
                gridTemplateColumns: 'repeat(5, 28px)',
                gap: '6px',
                justifyContent: 'start',
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
                {groupIdx > 0 && <Divider sx={{ my: 0.5 }} />}
                <Box sx={{ px: 1, py: 0.5, backgroundColor: '#f5f5f5' }}>
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 600,
                      color: '#666',
                      textTransform: 'uppercase',
                      fontSize: '10px',
                      letterSpacing: '0.5px',
                    }}
                  >
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
                    disabled={!onSchemeChange}
                    sx={{
                      py: 0.5,
                      px: 1,
                      '&.Mui-selected': {
                        backgroundColor: 'rgba(25,118,210,0.08)',
                      },
                    }}
                  >
                    <Box sx={{ width: '100%' }}>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', fontSize: 12, fontWeight: 500, color: '#212121' }}>
                          {scheme.name}
                          {scheme.id === currentSchemeId && (
                            <CheckIcon fontSize="small" sx={{ ml: 0.5, color: '#1976d2' }} />
                          )}
                        </Box>
                        <Box sx={{ display: 'flex', gap: '2px' }}>
                          {scheme.colors.slice(0, 8).map((color, idx) => (
                            <Box
                              key={idx}
                              sx={{
                                width: 16,
                                height: 10,
                                borderRadius: 2,
                                backgroundColor: color,
                                border: '1px solid rgba(0, 0, 0, 0.1)',
                              }}
                            />
                          ))}
                        </Box>
                      </Box>
                    </Box>
                  </MenuItem>
                ))}
              </Box>
            ))}

            {/* Gradient controls (only for continuous) */}
            {fieldFlavour === 'continuous' && onReverseChange && (
              <>
                <Divider sx={{ my: 0.5 }} />
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    px: 1,
                    pb: 0.25,
                  }}
                >
                  <Typography variant="caption" sx={{ fontWeight: 600, color: '#666' }}>
                    Gradient
                  </Typography>
                  <Tooltip title="Reverse palette">
                    <IconButton
                      size="small"
                      onClick={() => onReverseChange(!colorReversed)}
                      aria-label="Reverse palette"
                      sx={{
                        color: colorReversed ? '#1976d2' : '#757575',
                        '&:hover': { backgroundColor: 'rgba(25, 118, 210, 0.08)' },
                      }}
                    >
                      <SwapHorizIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
                {typeof colorBias === 'number' && onBiasChange && (
                  <>
                    <Typography variant="caption" sx={{ display: 'block', px: 1, pb: 0.25, fontWeight: 600, color: '#666' }}>
                      Bias
                    </Typography>
                    <ColorBiasControl colorBias={colorBias} onChange={onBiasChange} />
                  </>
                )}
              </>
            )}
          </>
        )}
      </Popover>
    </>
  );
};

export default ColorPalettePopover;


