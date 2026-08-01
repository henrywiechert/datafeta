// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { Button, Tooltip } from '@mui/material';
import FilterListIcon from '@mui/icons-material/FilterList';
import {
  Field,
  DragSource,
  FilterConfig,
  FilterMetadata,
  DiscreteValueListMode,
} from '../../../types';
import { PropertySection } from '../Properties';
import FilterDropZone from './FilterDropZone';
import type { FilterValueListFetchOptions } from '../../../hooks/useFilterMetadata';
import styles from './FilterPanel.module.css';

interface FilterPanelProps {
  filterFields: Field[];
  filterConfigurations: Record<string, FilterConfig>;
  filterMetadata: Record<string, FilterMetadata>;
  onDrop: (field: Field, source: DragSource) => void;
  onRemove: (fieldId: string) => void;
  onConfigChange: (fieldId: string, config: FilterConfig) => void;
  onApplyFilters: () => void;
  /** True when draft filter configs differ from applied (chart) configs. */
  hasPendingApply?: boolean;
  onRefetchValues: (
    fieldId: string,
    regexPattern?: string,
    options?: FilterValueListFetchOptions,
  ) => Promise<void>;
  onValueListModeChange?: (fieldId: string, mode: DiscreteValueListMode) => void;
  // Global filter operations
  onMarkAsGlobal?: (fieldId: string) => void;
  onUnmarkGlobal?: (fieldId: string) => void;
  /** Set of field IDs that are in global (session) scope */
  globalFilterIds?: Set<string>;
  /** Set of field IDs that are disabled on this sheet */
  disabledFilterIds?: Set<string>;
  onToggleFilterDisabled?: (fieldId: string) => void;
}

/**
 * Pure view over the draft filter layer (context filterConfigurations).
 * Config edits write through immediately; Apply commits draft → applied for the chart.
 */
const FilterPanel: React.FC<FilterPanelProps> = ({
  filterFields,
  filterConfigurations,
  filterMetadata,
  onDrop,
  onRemove,
  onConfigChange,
  onApplyFilters,
  hasPendingApply = false,
  onRefetchValues,
  onValueListModeChange,
  onMarkAsGlobal,
  onUnmarkGlobal,
  globalFilterIds,
  disabledFilterIds,
  onToggleFilterDisabled,
}) => {
  const hasActiveFilters = filterFields.length > 0;

  return (
    <PropertySection
      title="Filters"
      icon={<FilterListIcon fontSize="small" />}
      defaultExpanded={true}
      storageKey="filterPanel.expanded"
      headerActions={
        hasActiveFilters ? (
          <Tooltip
            title={
              hasPendingApply
                ? 'Filter changes are not applied to the chart yet'
                : 'No pending filter changes'
            }
            enterDelay={400}
          >
            <span>
              <Button
                size="small"
                variant={hasPendingApply ? 'contained' : 'text'}
                disabled={!hasPendingApply}
                onClick={onApplyFilters}
                className={`${styles.applyButton} ${
                  hasPendingApply ? styles.applyButtonPending : ''
                }`}
              >
                {hasPendingApply ? <span className={styles.applyPendingDot} /> : null}
                Apply
              </Button>
            </span>
          </Tooltip>
        ) : null
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
        onValueListModeChange={onValueListModeChange}
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
