import React, { useState } from 'react';
import { Box, Typography } from '@mui/material';
import { Field, DragSource, FilterConfig, FilterMetadata, FilterScope } from '../../../types';
import { readDragPayload } from '../../../utils/dragDataStore';
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
  // Global filter operations
  onMarkAsGlobal?: (fieldId: string) => void;
  onUnmarkGlobal?: (fieldId: string) => void;
  /** Set of field IDs that are in global (session) scope */
  globalFilterIds?: Set<string>;
}

const FilterDropZone: React.FC<FilterDropZoneProps> = ({
  fields,
  filterConfigurations,
  filterMetadata,
  onDrop,
  onRemove,
  onConfigChange,
  onRefetchValues,
  onMarkAsGlobal,
  onUnmarkGlobal,
  globalFilterIds,
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
      const data = readDragPayload(e.nativeEvent.dataTransfer ?? undefined);
      if (!data) return;
      
      const fieldsToAdd = data.fields;
      const source = data.source;
      
      if (!fieldsToAdd || fieldsToAdd.length === 0) {
        return;
      }
      
      // Add each field that's not already in the filter zone
      fieldsToAdd.forEach((field: Field) => {
        const alreadyExists = fields.some(f => f.id === field.id);
        if (!alreadyExists) {
          onDrop(field, source);
        }
      });
    } catch (error) {
      console.error('Error parsing drag data:', error);
    }
  };
  
  // Handle scope change: call the appropriate global filter operation
  const handleScopeChange = (fieldId: string, newScope: FilterScope) => {
    if (newScope === 'session') {
      // Mark as global: move to DataSourceContext
      if (onMarkAsGlobal) {
        onMarkAsGlobal(fieldId);
      }
    } else {
      // Unmark global: copy to all sheets, remove from DataSourceContext
      if (onUnmarkGlobal) {
        onUnmarkGlobal(fieldId);
      }
    }
  };
  
  // Get the scope of a filter: check if it's in the global filter set
  const getFilterScope = (fieldId: string): FilterScope => {
    // If globalFilterIds is provided, use it to determine scope
    if (globalFilterIds) {
      return globalFilterIds.has(fieldId) ? 'session' : 'sheet';
    }
    // Fallback to config scope (for backward compatibility)
    return filterConfigurations[fieldId]?.scope || 'sheet';
  };
  
  // Check if scope change is enabled (we have the handlers)
  const isScopeChangeEnabled = Boolean(onMarkAsGlobal && onUnmarkGlobal);

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
              filterScope={getFilterScope(field.id)}
              onScopeChange={isScopeChangeEnabled ? (newScope) => handleScopeChange(field.id, newScope) : undefined}
            />
          ))}
        </Box>
      )}
    </Box>
  );
};

export default FilterDropZone;


