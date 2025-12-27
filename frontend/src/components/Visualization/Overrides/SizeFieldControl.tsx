import React from 'react';
import { Box, Typography } from '@mui/material';
import { PropertyDropZone } from '../Properties/PropertyDropZone';
import SizeRangeControl from '../Size/SizeRangeControl';
import { Field } from '../../../types';
import FieldChip from '../FieldChip';
import { parseDragData } from './overrideUtils';

interface SizeFieldControlProps {
  field: Field | null;
  sizeRange: [number, number];
  manualSize: number;
  onDrop: (field: Field) => void;
  onRemove: () => void;
  onSizeRangeChange: (range: [number, number]) => void;
  onManualSizeChange: (size: number) => void;
}

const SizeFieldControl: React.FC<SizeFieldControlProps> = ({
  field,
  sizeRange,
  manualSize,
  onDrop,
  onRemove,
  onSizeRangeChange,
  onManualSizeChange,
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
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Typography variant="caption" sx={{ minWidth: 50, fontSize: '0.7rem', fontWeight: 500 }}>
          Size
        </Typography>
        <Box sx={{ flex: 1, minWidth: 0 }}>
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
                  source="SIZE_ZONE"
                  onUpdate={(updated) => {
                    const f = Array.isArray(updated) ? updated[0] : updated;
                    onDrop(f);
                  }}
                  onRemoveFromZone={() => onRemove()}
                />
              </Box>
            )}
          </PropertyDropZone>
        </Box>
      </Box>
      <SizeRangeControl
        sizeField={field}
        sizeRange={sizeRange}
        manualSize={manualSize}
        onSizeRangeChange={onSizeRangeChange}
        onManualSizeChange={onManualSizeChange}
      />
    </Box>
  );
};

export default SizeFieldControl;

