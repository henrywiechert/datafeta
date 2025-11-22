import React from 'react';
import { Box, Typography, Chip, styled } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { PropertyDropZone } from '../Properties/PropertyDropZone';
import ManualColorSelector from '../Color/ManualColorSelector';
import ColorSchemeSelector from '../Color/ColorSchemeSelector';
import ColorBiasControl from '../Color/ColorBiasControl';
import { Field } from '../../../types';
import { getFieldDisplayName } from '../../../utils/fieldUtils';
import { getChipStyles, parseDragData } from './overrideUtils';

const TruncatedChip = styled(Chip)({
  minWidth: 0,
  display: 'inline-flex',
  alignItems: 'center',
  '& .MuiChip-label': {
    flexGrow: 1,
    textAlign: 'left',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  '& .MuiChip-deleteIcon': {
    flexShrink: 0,
  },
});

interface ColorFieldControlProps {
  field: Field | null;
  colorScheme: string;
  colorBias: number;
  manualColor: string;
  onDrop: (field: Field) => void;
  onRemove: () => void;
  onSchemeChange: (schemeId: string) => void;
  onColorChange: (color: string) => void;
  onBiasChange: (bias: number) => void;
}

const ColorFieldControl: React.FC<ColorFieldControlProps> = ({
  field,
  colorScheme,
  colorBias,
  manualColor,
  onDrop,
  onRemove,
  onSchemeChange,
  onColorChange,
  onBiasChange,
}) => {
  const handleDrop = (e: React.DragEvent) => {
    const { field: droppedField } = parseDragData(e);
    if (droppedField) {
      onDrop(droppedField);
    }
  };

  return (
    <Box sx={{ 
      display: 'flex', 
      flexDirection: 'column', 
      gap: 0.5, 
      mb: 0,
      p: 0.75,
      border: '1px solid #d0d0d0',
      borderRadius: '4px',
      backgroundColor: '#fafafa'
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
        <Typography variant="caption" sx={{ minWidth: 50, fontSize: '0.7rem', fontWeight: 500 }}>
          Color
        </Typography>
        <Box sx={{ flex: 1, minWidth: 60 }}>
          <PropertyDropZone
            hasContent={field !== null}
            emptyMessage="Drag field"
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
                <TruncatedChip
                  label={getFieldDisplayName(field)}
                  title={getFieldDisplayName(field)}
                  onDelete={onRemove}
                  deleteIcon={<CloseIcon />}
                  size="small"
                  sx={{
                    flex: 1,
                    height: 26,
                    fontSize: '0.75rem',
                    ...getChipStyles(field),
                  }}
                />
              </Box>
            )}
          </PropertyDropZone>
        </Box>
        {field && (
          <ColorSchemeSelector
            currentSchemeId={colorScheme}
            fieldFlavour={field.flavour}
            onSchemeChange={onSchemeChange}
          />
        )}
        {!field && (
          <ManualColorSelector
            value={manualColor}
            onChange={onColorChange}
          />
        )}
      </Box>
      {field && field.flavour === 'continuous' && (
        <ColorBiasControl
          colorBias={colorBias}
          onChange={onBiasChange}
        />
      )}
    </Box>
  );
};

export default ColorFieldControl;

