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
  // Global filter operations
  onMarkAsGlobal?: (fieldId: string) => void;
  onUnmarkGlobal?: (fieldId: string) => void;
  /** Set of field IDs that are in global (session) scope */
  globalFilterIds?: Set<string>;
  /** Set of field IDs that are disabled on this sheet */
  disabledFilterIds?: Set<string>;
  onToggleFilterDisabled?: (fieldId: string) => void;
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
  onMarkAsGlobal,
  onUnmarkGlobal,
  globalFilterIds,
  disabledFilterIds,
  onToggleFilterDisabled,
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
        hasActiveFilters ? (
          <Button
            size="small"
            onClick={handleApply}
            sx={{ minWidth: 0, px: 1, py: 0.25, fontSize: '0.75rem' }}
          >
            Apply
          </Button>
        ) : null
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
        onMarkAsGlobal={onMarkAsGlobal}
        onUnmarkGlobal={onUnmarkGlobal}
        globalFilterIds={globalFilterIds}
        disabledFilterIds={disabledFilterIds}
        onToggleFilterDisabled={onToggleFilterDisabled}
      />
    </PropertySection>
  );
};

export default FilterPanel;


