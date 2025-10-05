import React, { useState } from 'react';
import { Box, Typography, Chip } from '@mui/material';
import { Field, DragSource } from '../../../types';
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
  const [isOver, setIsOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOver(false);

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
    <Box
      className={`${styles.dropZone} ${isOver ? styles.dragOver : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {colorField ? (
        <Chip
          label={colorField.columnName}
          onDelete={onRemove}
          sx={getChipStyles()}
        />
      ) : (
        <Typography className={styles.emptyMessage}>
          Drag a field here to color by
        </Typography>
      )}
    </Box>
  );
};

export default ColorDropZone;

