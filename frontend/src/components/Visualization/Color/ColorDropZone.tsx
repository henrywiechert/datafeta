import React from 'react';
import { Box } from '@mui/material';
import { Field, DragSource } from '../../../types';
import { PropertyDropZone } from '../Properties';
import FieldChip from '../FieldChip';
import styles from './ColorDropZone.module.css';

interface ColorDropZoneProps {
  colorField: Field | null;
  onDrop: (field: Field, source: DragSource) => void;
  onRemove: (fieldIds: string[]) => void;
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

  return (
    <PropertyDropZone
      hasContent={colorField !== null}
      emptyMessage="Drag a field here to color by"
      onDrop={handleDrop}
    >
      {colorField && (
        <Box className={styles.chipContainer}>
          <FieldChip
            field={colorField}
            source="COLOR_ZONE"
            onUpdate={(updated) => {
              const f = Array.isArray(updated) ? updated[0] : updated;
              onDrop(f, 'COLOR_ZONE');
            }}
            onRemoveFromZone={(fieldIds) => onRemove(fieldIds)}
          />
        </Box>
      )}
    </PropertyDropZone>
  );
};

export default ColorDropZone;

