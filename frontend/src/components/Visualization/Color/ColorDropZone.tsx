import React from 'react';
import { Chip, Box } from '@mui/material';
import { Field, DragSource } from '../../../types';
import { PropertyDropZone } from '../Properties';
import { getFieldDisplayName } from '../../../utils/fieldUtils';
import styles from './ColorDropZone.module.css';

interface ColorDropZoneProps {
  colorField: Field | null;
  onDrop: (field: Field, source: DragSource) => void;
  onRemove: () => void;
}

const ColorDropZone: React.FC<ColorDropZoneProps> = ({
  colorField,
  onDrop,
  onRemove,
}) => {
  const handleDrop = (e: React.DragEvent) => {
    try {
      const fieldData = e.dataTransfer.getData('application/json');
      if (fieldData) {
        const parsedData = JSON.parse(fieldData);
        const { field, source } = parsedData;
        
        if (field) {
          // Replace existing field with the new one
          onDrop(field, source as DragSource);
        }
      }
    } catch (error) {
      console.error('Error handling drop:', error);
    }
  };

  // Get chip styling based on field flavour
  const getChipStyles = () => {
    if (!colorField) return {};
    
    if (colorField.flavour === 'discrete') {
      return {
        backgroundColor: '#e3f2fd',
        border: '1px solid #1976d2',
      };
    } else if (colorField.flavour === 'continuous') {
      return {
        backgroundColor: '#e8f5e8',
        border: '1px solid #388e3c',
      };
    }
    return {};
  };

  return (
    <PropertyDropZone
      hasContent={colorField !== null}
      emptyMessage="Drag a field here to color by"
      onDrop={handleDrop}
    >
      {colorField && (
        <Box className={styles.chipContainer}>
          <Chip
            label={getFieldDisplayName(colorField)}
            onDelete={onRemove}
            size="small"
            className={styles.chip}
            sx={{
              ...getChipStyles(),
              '& .MuiChip-label': {
                fontSize: '12px',
                fontWeight: 500,
              },
            }}
          />
        </Box>
      )}
    </PropertyDropZone>
  );
};

export default ColorDropZone;

