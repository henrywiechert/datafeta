import React from 'react';
import { Box, Typography } from '@mui/material';
import { PropertyDropZone } from '../Properties/PropertyDropZone';
import ManualColorSelector from '../Color/ManualColorSelector';
import ColorSchemeSelector from '../Color/ColorSchemeSelector';
import ColorBiasControl from '../Color/ColorBiasControl';
import { Field } from '../../../types';
import FieldChip from '../FieldChip';
import { parseDragData } from './overrideUtils';

interface ColorFieldControlProps {
  field: Field | null;
  colorScheme: string;
  colorBias: number;
  manualColor: string;
  onDrop: (field: Field) => void;
  onRemove: (fieldIds: string[]) => void;
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
                <FieldChip
                  field={field}
                  source="COLOR_ZONE"
                  onUpdate={(updated) => {
                    const f = Array.isArray(updated) ? updated[0] : updated;
                    onDrop(f);
                  }}
                  onRemoveFromZone={(fieldIds) => onRemove(fieldIds)}
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

