import React from 'react';
import { Chip, Box } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { Field, DragSource } from '../../../types';
import { PropertyDropZone } from '../Properties';
import { getFieldDisplayName } from '../../../utils/fieldUtils';
// import styles from './SizeDropZone.module.css';

interface SizeDropZoneProps {
  sizeField: Field | null;
  onDrop: (field: Field, source: DragSource) => void;
  onRemove: () => void;
}

const SizeDropZone: React.FC<SizeDropZoneProps> = ({
  sizeField,
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
        
        // For size zone, only take the first field (single field only)
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
    if (!sizeField) return {};
    
    if (sizeField.flavour === 'discrete') {
      return {
        backgroundColor: '#e3f2fd',
        border: '1px solid #1976d2',
      };
    } else if (sizeField.flavour === 'continuous') {
      return {
        backgroundColor: '#e8f5e8',
        border: '1px solid #388e3c',
      };
    }
    return {};
  };

  return (
    <PropertyDropZone
      hasContent={sizeField !== null}
      emptyMessage="Drag a field here to size by"
      onDrop={handleDrop}
    >
      {sizeField && (
        <Box sx={{
          display: 'flex',
          alignItems: 'center',
          padding: '4px 8px',
          border: '1px solid #e0e0e0',
          borderRadius: '4px',
          backgroundColor: '#fafafa'
        }}>
          <Chip
            label={getFieldDisplayName(sizeField)}
            onDelete={onRemove}
            deleteIcon={<CloseIcon />}
            size="small"
            sx={{
              ...getChipStyles(),
              flex: 1,
              justifyContent: 'space-between',
              maxWidth: '100%',
              '& .MuiChip-label': {
                fontSize: '12px',
                fontWeight: 500,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              },
              '&:hover': {
                backgroundColor: '#f5f5f5',
              }
            }}
          />
        </Box>
      )}
    </PropertyDropZone>
  );
};

export default SizeDropZone;