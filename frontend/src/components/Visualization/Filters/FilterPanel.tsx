import React from 'react';
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
          onClick={onApplyFilters}
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
        filterConfigurations={filterConfigurations}
        filterMetadata={filterMetadata}
        onDrop={onDrop}
        onRemove={onRemove}
        onConfigChange={onConfigChange}
        onRefetchValues={onRefetchValues}
      />
    </PropertySection>
  );
};

export default FilterPanel;


