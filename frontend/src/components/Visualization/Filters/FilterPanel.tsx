import React from 'react';
import { Box, Typography, Button } from '@mui/material';
import FilterListIcon from '@mui/icons-material/FilterList';
import { Field, DragSource, FilterConfig, FilterMetadata } from '../../../types';
import FilterDropZone from './FilterDropZone';
import styles from './FilterPanel.module.css';

interface FilterPanelProps {
  filterFields: Field[];
  filterConfigurations: Record<string, FilterConfig>;
  filterMetadata: Record<string, FilterMetadata>;
  onDrop: (field: Field, source: DragSource) => void;
  onRemove: (fieldId: string) => void;
  onConfigChange: (fieldId: string, config: FilterConfig) => void;
  onApplyFilters: () => void;
}

const FilterPanel: React.FC<FilterPanelProps> = ({
  filterFields,
  filterConfigurations,
  filterMetadata,
  onDrop,
  onRemove,
  onConfigChange,
  onApplyFilters,
}) => {
  // Check if there are any active filters
  const hasActiveFilters = filterFields.length > 0;

  return (
    <Box className={styles.container}>
      {/* Header */}
      <Box className={styles.header}>
        <Box className={styles.titleContainer}>
          <FilterListIcon fontSize="small" />
          <Typography variant="h6" className={styles.title}>
            Filters
          </Typography>
        </Box>
        <Button
          variant="contained"
          size="small"
          onClick={onApplyFilters}
          disabled={!hasActiveFilters}
          className={styles.applyButton}
        >
          Apply Filters
        </Button>
      </Box>

      {/* Drop Zone */}
      <Box className={styles.content}>
        <FilterDropZone
          fields={filterFields}
          filterConfigurations={filterConfigurations}
          filterMetadata={filterMetadata}
          onDrop={onDrop}
          onRemove={onRemove}
          onConfigChange={onConfigChange}
        />

        {hasActiveFilters && (
          <Typography variant="caption" color="textSecondary" className={styles.hint}>
            Configure filters above and click "Apply Filters" to update the visualization
          </Typography>
        )}
      </Box>
    </Box>
  );
};

export default FilterPanel;


