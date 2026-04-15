import React, { useMemo, useState } from 'react';
import {
  Box,
  Divider,
  IconButton,
  MenuItem,
  Popover,
  Slider,
  Tooltip,
  Typography,
} from '@mui/material';
import GridViewIcon from '@mui/icons-material/GridView';
import CheckIcon from '@mui/icons-material/Check';
import { PropertyDropZone } from '../Properties/PropertyDropZone';
import { Field } from '../../../types';
import FieldChip from '../FieldChip';
import { parseDragData } from './overrideUtils';
import { categoricalSchemes, getSchemeById } from '../../../config/colorSchemes';
import { resolveSingleEncodingDropField } from '../../../utils/singleEncodingZone';

interface BackgroundFieldControlProps {
  field: Field | null;
  colorScheme: string;
  opacity: number;
  onDrop: (field: Field) => void;
  onRemove: (fieldIds: string[]) => void;
  onSchemeChange: (schemeId: string) => void;
  onOpacityChange: (opacity: number) => void;
}

const BackgroundFieldControl: React.FC<BackgroundFieldControlProps> = ({
  field,
  colorScheme,
  opacity,
  onDrop,
  onRemove,
  onSchemeChange,
  onOpacityChange,
}) => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);

  const handleOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    const { field: droppedField, source } = parseDragData(e);
    if (droppedField) {
      const fieldToSet = resolveSingleEncodingDropField({
        field: droppedField,
        source,
        zoneSource: 'BACKGROUND_ZONE',
        requiredFlavour: 'discrete',
      });
      if (!fieldToSet) {
        console.warn('Background field must be discrete (categorical). Continuous fields are not supported.');
        return;
      }
      onDrop(fieldToSet);
    }
  };

  // Get the first color from the current scheme for the icon preview
  const iconColor = useMemo(() => {
    const scheme = getSchemeById(colorScheme);
    return scheme?.colors[0] || '#4e79a7';
  }, [colorScheme]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'auto minmax(0, 1fr)',
          alignItems: 'center',
          gap: 0.5,
        }}
      >
        <Tooltip
          title="Facet background settings"
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
            <GridViewIcon fontSize="small" sx={{ color: field ? iconColor : '#1976d2' }} />
          </IconButton>
        </Tooltip>

        <Popover
          open={open}
          anchorEl={anchorEl}
          onClose={handleClose}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          PaperProps={{
            sx: {
              p: 0.5,
              width: 280,
              maxWidth: 'calc(100vw - 16px)',
              borderRadius: 1,
            },
          }}
        >
          {/* Categorical schemes only */}
          <Box>
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
                Color Scheme
              </Typography>
            </Box>
            {categoricalSchemes.map((scheme) => (
              <MenuItem
                key={scheme.id}
                onClick={() => onSchemeChange(scheme.id)}
                selected={scheme.id === colorScheme}
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
                      {scheme.id === colorScheme && (
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
                            // Show with current opacity to preview the pastel effect
                            opacity: opacity,
                          }}
                        />
                      ))}
                    </Box>
                  </Box>
                </Box>
              </MenuItem>
            ))}
          </Box>

          {/* Opacity slider */}
          <Divider sx={{ my: 0.5 }} />
          <Box sx={{ px: 1, py: 0.5 }}>
            <Typography
              variant="caption"
              sx={{
                fontWeight: 600,
                color: '#666',
                display: 'block',
                mb: 0.5,
              }}
            >
              Opacity: {Math.round(opacity * 100)}%
            </Typography>
            <Slider
              value={opacity}
              onChange={(_, value) => onOpacityChange(value as number)}
              min={0.05}
              max={0.35}
              step={0.01}
              size="small"
              sx={{
                mx: 0.5,
                width: 'calc(100% - 8px)',
                '& .MuiSlider-thumb': {
                  width: 14,
                  height: 14,
                },
              }}
            />
            <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#999' }}>
              <span>Very light</span>
              <span>Stronger</span>
            </Box>
          </Box>
        </Popover>

        <Box sx={{ minWidth: 0 }}>
          <PropertyDropZone
            hasContent={field !== null}
            emptyMessage="Background (discrete only)"
            variant="plain"
            onDrop={handleDrop}
          >
            {field && (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                  minWidth: 0,
                  width: '100%',
                }}
              >
                <FieldChip
                  field={field}
                  source="BACKGROUND_ZONE"
                  onUpdate={(updated) => {
                    const f = Array.isArray(updated) ? updated[0] : updated;
                    // Re-validate on update
                    if (f.flavour !== 'discrete') {
                      console.warn('Background field must be discrete.');
                      return;
                    }
                    onDrop(f);
                  }}
                  onRemoveFromZone={(fieldIds) => onRemove(fieldIds)}
                />
              </Box>
            )}
          </PropertyDropZone>
        </Box>
      </Box>
    </Box>
  );
};

export default BackgroundFieldControl;
