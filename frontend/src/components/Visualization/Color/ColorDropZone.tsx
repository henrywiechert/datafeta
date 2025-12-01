import React from 'react';
import { Chip, Box } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
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
        
        // Handle unified payload format (always arrays) and legacy format
        let fields = parsedData.fields;
        const source = parsedData.source;
        
        // Backward compatibility: normalize legacy single-field format
        if (!fields && parsedData.field) {
          fields = [parsedData.field];
        }
        
        // For color zone, only take the first field (single field only)
        if (fields && fields.length > 0) {
          onDrop(fields[0], source as DragSource);
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
            deleteIcon={<CloseIcon />}
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

