import React, { useState } from 'react';
import { Box, Typography } from '@mui/material';
import { Field, DragSource, FilterConfig, FilterMetadata } from '../../../types';
import FilterFieldChip from './FilterFieldChip';
import styles from './FilterDropZone.module.css';

interface FilterDropZoneProps {
  fields: Field[];
  filterConfigurations: Record<string, FilterConfig>;
  filterMetadata: Record<string, FilterMetadata>;
  onDrop: (field: Field, source: DragSource) => void;
  onRemove: (fieldId: string) => void;
  onConfigChange: (fieldId: string, config: FilterConfig) => void;
  onRefetchValues: (fieldId: string, regexPattern?: string) => Promise<void>;
}

const FilterDropZone: React.FC<FilterDropZoneProps> = ({
  fields,
  filterConfigurations,
  filterMetadata,
  onDrop,
  onRemove,
  onConfigChange,
  onRefetchValues,
}) => {
  const [isOver, setIsOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsOver(true);
  };

  const handleDragLeave = () => {
    setIsOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsOver(false);

    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      const { field, source } = data;
      
      // Check if field is already in filter zone
      const alreadyExists = fields.some(f => f.id === field.id);
      if (!alreadyExists) {
        onDrop(field, source);
      }
    } catch (error) {
      console.error('Error parsing drag data:', error);
    }
  };

  return (
    <Box
      className={`${styles.dropZone} ${isOver ? styles.isOver : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {fields.length === 0 ? (
        <Typography variant="body2" className={styles.placeholder}>
          Filters
        </Typography>
      ) : (
        <Box className={styles.fieldsList}>
          {fields.map((field) => (
            <FilterFieldChip
              key={field.id}
              field={field}
              filterConfig={filterConfigurations[field.id]}
              filterMetadata={filterMetadata[field.id]}
              onConfigChange={(config) => onConfigChange(field.id, config)}
              onRemove={() => onRemove(field.id)}
              onRefetchValues={(regexPattern) => onRefetchValues(field.id, regexPattern)}
            />
          ))}
        </Box>
      )}
    </Box>
  );
};

export default FilterDropZone;


