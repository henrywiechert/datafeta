import React, { useState, useEffect } from 'react';
import { Button } from '@mui/material';
import FilterListIcon from '@mui/icons-material/FilterList';
import { Field, DragSource, FilterConfig, FilterMetadata } from '../../../types';
import { PropertySection } from '../Properties';
import FilterDropZone from './FilterDropZone';

interface FilterPanelProps {
  filterFields: Field[];
  filterConfigurations: Record<string, FilterConfig>;
  filterMetadata: Record<string, FilterMetadata>;
  onDrop: (field: Field, source: DragSource) => void;
  onRemove: (fieldId: string) => void;
  onConfigChange: (fieldId: string, config: FilterConfig) => void;
  onApplyFilters: () => void;
  onRefetchValues: (fieldId: string, regexPattern?: string) => Promise<void>;
}

const FilterPanel: React.FC<FilterPanelProps> = ({
  filterFields,
  filterConfigurations,
  filterMetadata,
  onDrop,
  onRemove,
  onConfigChange,
  onApplyFilters,
  onRefetchValues,
}) => {
  // Keep local state for pending filter changes - only update Context on Apply
  const [localConfigurations, setLocalConfigurations] = useState(filterConfigurations);

  // Sync local state when filterConfigurations changes (e.g., from Apply or undo/redo)
  useEffect(() => {
    setLocalConfigurations(filterConfigurations);
  }, [filterConfigurations]);

  const handleLocalConfigChange = (fieldId: string, config: FilterConfig) => {
    setLocalConfigurations(prev => ({
      ...prev,
      [fieldId]: config,
    }));
  };

  const handleApply = () => {
    // Batch update all changes to Context
    Object.entries(localConfigurations).forEach(([fieldId, config]) => {
      if (JSON.stringify(config) !== JSON.stringify(filterConfigurations[fieldId])) {
        onConfigChange(fieldId, config);
      }
    });
    onApplyFilters();
  };

  const hasActiveFilters = filterFields.length > 0;

  return (
    <PropertySection
      title="Filters"
      icon={<FilterListIcon fontSize="small" />}
      defaultExpanded={true}
      storageKey="filterPanel.expanded"
      headerActions={
        <Button
          variant="contained"
          size="small"
          onClick={handleApply}
          disabled={!hasActiveFilters}
          sx={{
            fontSize: '12px',
            padding: '4px 10px',
            textTransform: 'none',
          }}
        >
          Apply
        </Button>
      }
    >
      <FilterDropZone
        fields={filterFields}
        filterConfigurations={localConfigurations}
        filterMetadata={filterMetadata}
        onDrop={onDrop}
        onRemove={onRemove}
        onConfigChange={handleLocalConfigChange}
        onRefetchValues={onRefetchValues}
      />
    </PropertySection>
  );
};

export default FilterPanel;


