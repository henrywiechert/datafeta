// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { useMemo, useEffect, useRef, useCallback, useState } from 'react';
import { Button, Collapse } from '@mui/material';
import FieldsSearch from './FieldsSearch';
import FieldCategory from './FieldCategory';
import SectionHeader from '../Properties/SectionHeader';
import VirtualColumnManager from '../../VirtualColumns/VirtualColumnManager';
import BinConfigDialog, { FieldStats } from '../../VirtualColumns/BinConfigDialog';
import { Field, VirtualColumnDefinition } from '../../../types';
import { useFieldsPanelDrag } from '../../../hooks/useFieldsPanelDrag';
import styles from './FieldsPanel.module.css';
import { useSelectionStore } from '../../../stores/selectionStore';
import { fetchFieldStats } from '../../../apiService';

interface FieldsPanelProps {
  availableFields: Field[];
  fieldsSearch: string;
  onFieldsSearchChange: (search: string) => void;
  onFieldUpdate: (fields: Field | Field[]) => void;
  onRemoveFromAxis: (fieldId: string) => void;
  onRemoveMultipleFromAxis?: (fieldIds: string[]) => void;
  onRemoveFromFilter?: (fieldIds: string[]) => void;
  onRemoveFromColor?: (fieldIds: string[]) => void;
  onRemoveFromSize?: (fieldIds: string[]) => void;
  onRemoveFromLabel?: (fieldIds: string[]) => void;
  onRemoveFromTooltip?: (fieldIds: string[]) => void;
  onRemoveFromMeasureGroup?: (fieldIds: string[]) => void;
  onRemoveFromBackground?: (fieldIds: string[]) => void;
  onRemoveFromShape?: (fieldIds: string[]) => void;
  /**
   * Names the table the "Create Bins..." action fetches column statistics
   * from. Everything else about picking a data source now lives in the
   * Data Source card beside this one — see VisualizationPage.
   */
  selectedDatabase: string;
  selectedTable: string;
  // Virtual columns props
  virtualColumns?: VirtualColumnDefinition[];
  onAddVirtualColumn?: (column: VirtualColumnDefinition) => void;
  onUpdateVirtualColumn?: (index: number, column: VirtualColumnDefinition) => void;
  onRemoveVirtualColumn?: (index: number) => void;
}

const FIELDS_EXPANDED_KEY = 'fieldsPanel.fields.expanded';

const FieldsPanel: React.FC<FieldsPanelProps> = ({
  availableFields,
  fieldsSearch,
  onFieldsSearchChange,
  onFieldUpdate,
  onRemoveFromAxis,
  onRemoveMultipleFromAxis,
  onRemoveFromFilter,
  onRemoveFromColor,
  onRemoveFromSize,
  onRemoveFromLabel,
  onRemoveFromTooltip,
  onRemoveFromMeasureGroup,
  onRemoveFromBackground,
  onRemoveFromShape,
  selectedDatabase,
  selectedTable,
  // Virtual columns props
  virtualColumns = [],
  onAddVirtualColumn,
  onUpdateVirtualColumn,
  onRemoveVirtualColumn
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [useRegex, setUseRegex] = useState(false);
  const [fieldsExpanded, setFieldsExpanded] = useState(() => {
    const stored = localStorage.getItem(FIELDS_EXPANDED_KEY);
    return stored === null ? true : stored === 'true';
  });

  useEffect(() => {
    localStorage.setItem(FIELDS_EXPANDED_KEY, String(fieldsExpanded));
  }, [fieldsExpanded]);
  
  // State for bin config dialog
  const [binDialogOpen, setBinDialogOpen] = useState(false);
  const [binDialogField, setBinDialogField] = useState<Field | null>(null);
  const [binDialogStats, setBinDialogStats] = useState<FieldStats | null>(null);
  
  // Get clearSelection action (stable reference, never causes re-render)
  const clearSelection = useSelectionStore((s: any) => s.clearSelection);
  
  // Use our custom hook for drag and drop functionality
  const {
    isDragOver,
    handleDragOver,
    handleDragLeave,
    handleDrop
  } = useFieldsPanelDrag(
    onRemoveFromAxis,
    onRemoveMultipleFromAxis,
    onRemoveFromFilter,
    onRemoveFromColor,
    onRemoveFromSize,
    onRemoveFromLabel,
    onRemoveFromTooltip,
    onRemoveFromMeasureGroup,
    onRemoveFromBackground,
    onRemoveFromShape
  );
  
  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        clearSelection();
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [clearSelection]);
  
  // Handle clicks on empty space to clear selection
  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    // Only clear if clicking directly on the container or fields list
    if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains(styles.fieldsList)) {
      clearSelection();
    }
  }, [clearSelection]);

  // Handle "Create Bins..." menu action
  const handleCreateBins = useCallback(async (field: Field) => {
    setBinDialogField(field);
    setBinDialogStats(null);
    setBinDialogOpen(true);
    
    // Fetch field statistics for the dialog
    try {
      const stats = await fetchFieldStats(
        selectedTable,
        field.columnName,
        selectedDatabase || undefined
      );
      setBinDialogStats(stats);
    } catch (error) {
      console.error('Failed to fetch field stats for binning:', error);
      // Dialog will show loading state; user can still manually enter bin width
    }
  }, [selectedTable, selectedDatabase]);

  // Handle saving binned field
  const handleSaveBinnedField = useCallback((virtualColumn: VirtualColumnDefinition) => {
    if (onAddVirtualColumn) {
      onAddVirtualColumn(virtualColumn);
    }
    setBinDialogOpen(false);
    setBinDialogField(null);
    setBinDialogStats(null);
  }, [onAddVirtualColumn]);

  // Handle canceling bin dialog
  const handleCancelBinDialog = useCallback(() => {
    setBinDialogOpen(false);
    setBinDialogField(null);
    setBinDialogStats(null);
  }, []);

  const { compiledSearchRegex, regexError, normalizedSearchTerm } = useMemo(() => {
    const trimmedSearch = fieldsSearch.trim();

    if (!trimmedSearch) {
      return {
        compiledSearchRegex: null as RegExp | null,
        regexError: null as string | null,
        normalizedSearchTerm: '',
      };
    }

    if (!useRegex) {
      return {
        compiledSearchRegex: null as RegExp | null,
        regexError: null as string | null,
        normalizedSearchTerm: trimmedSearch.toLowerCase(),
      };
    }

    try {
      return {
        compiledSearchRegex: new RegExp(trimmedSearch),
        regexError: null,
        normalizedSearchTerm: '',
      };
    } catch (error: any) {
      return {
        compiledSearchRegex: null as RegExp | null,
        regexError: error?.message || 'Invalid regex',
        normalizedSearchTerm: '',
      };
    }
  }, [fieldsSearch, useRegex]);

  // Create filter function that works with search term
  const filterBySearch = useMemo(() => (field: Field) => {
    if (!fieldsSearch.trim()) {
      return true;
    }

    const searchTargets = [
      field.columnName,
      field.displayAlias,
      field.aggregation,
      field.dataType,
    ].filter((value): value is string => Boolean(value));

    if (useRegex) {
      if (!compiledSearchRegex || regexError) {
        return true;
      }

      return searchTargets.some((value) => compiledSearchRegex.test(value));
    }

    return searchTargets.some((value) => value.toLowerCase().includes(normalizedSearchTerm));
  }, [compiledSearchRegex, fieldsSearch, normalizedSearchTerm, regexError, useRegex]);

  // Memoized filtered fields for better performance
  const filteredDimensions = useMemo(() => (
    availableFields
      .filter(field => field.type === 'dimension')
      .filter(filterBySearch)
      .sort((a, b) => a.columnName.localeCompare(b.columnName))
  ), [availableFields, filterBySearch]);

  const filteredMeasures = useMemo(() => (
    availableFields
      .filter(field => field.type === 'measure')
      .filter(filterBySearch)
      .sort((a, b) => a.columnName.localeCompare(b.columnName))
  ), [availableFields, filterBySearch]);

  return (
    <div ref={containerRef} className={styles.container} onClick={handleContainerClick}>
      <div className={`${styles.fieldsSection} ${fieldsExpanded ? '' : styles.fieldsSectionCollapsed}`}>
      {/* Title row and search, above the field lists */}
      <div className={styles.header}>
        <SectionHeader
          title="Fields"
          expanded={fieldsExpanded}
          onToggle={() => setFieldsExpanded((current) => !current)}
          controls="fields-panel-content"
          actions={
            fieldsExpanded && (
              <Button
                size="small"
                variant="text"
                color="primary"
                className={`${styles.regexToggle} ${useRegex ? styles.toggleActive : ''}`}
                sx={{ fontSize: '0.68rem', minHeight: 22, lineHeight: 1.1 }}
                aria-pressed={useRegex}
                onClick={() => setUseRegex((current) => !current)}
              >
                Regex
              </Button>
            )
          }
        />
        {fieldsExpanded && (
          <div className={styles.headerSearch}>
            <FieldsSearch
              value={fieldsSearch}
              onChange={onFieldsSearchChange}
              error={useRegex && !!regexError}
              helperText={useRegex ? regexError || '' : ''}
            />
          </div>
        )}
      </div>
      <Collapse in={fieldsExpanded} timeout={200} className={styles.fieldsCollapse}>
      <div
        id="fields-panel-content"
        className={`${styles.fieldsList} ${isDragOver ? styles.dragOver : styles.normal}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Virtual Columns at the top of Fields */}
        {onAddVirtualColumn && onUpdateVirtualColumn && onRemoveVirtualColumn && (
          <VirtualColumnManager
            virtualColumns={virtualColumns}
            availableColumns={availableFields.map(f => f.columnName)}
            onAdd={onAddVirtualColumn}
            onEdit={onUpdateVirtualColumn}
            onDelete={onRemoveVirtualColumn}
          />
        )}
        
        {/* Use FieldCategory component to eliminate duplication */}
        <FieldCategory 
          title="Dimensions"
          fields={filteredDimensions}
          onUpdate={onFieldUpdate}
          onCreateBins={onAddVirtualColumn ? handleCreateBins : undefined}
        />
        
        <FieldCategory 
          title="Measures"
          fields={filteredMeasures}
          onUpdate={onFieldUpdate}
          onCreateBins={onAddVirtualColumn ? handleCreateBins : undefined}
        />
      </div>
      </Collapse>
      </div>
      
      {/* Bin Config Dialog */}
      {binDialogField && (
        <BinConfigDialog
          open={binDialogOpen}
          sourceField={binDialogField.columnName}
          fieldStats={binDialogStats}
          existingNames={[
            ...availableFields.map(f => f.columnName),
            ...virtualColumns.map(vc => vc.name),
          ]}
          onSave={handleSaveBinnedField}
          onCancel={handleCancelBinDialog}
        />
      )}
    </div>
  );
};

// Memoize FieldsPanel to prevent unnecessary re-renders
// PERFORMANCE NOTE: Callbacks (onFieldUpdate, onRemoveFromAxis, etc.) are NOT compared
// because they are now stable thanks to refs pattern in useDragDrop and useFieldOperations.
// This prevents FieldsPanel from re-rendering when chart state changes.
export default React.memo(FieldsPanel, (prevProps, nextProps) => {
  // Only re-render if actual data changes - callbacks are stable
  return (
    prevProps.availableFields === nextProps.availableFields &&
    prevProps.fieldsSearch === nextProps.fieldsSearch &&
    prevProps.selectedDatabase === nextProps.selectedDatabase &&
    prevProps.selectedTable === nextProps.selectedTable &&
    prevProps.virtualColumns === nextProps.virtualColumns
    // Callbacks NOT compared - they are now stable (see useDragDrop.ts, useFieldOperations.ts)
    // The metadata/JOIN/UNION/partition props moved out with the Data Source
    // card, which is memo-free, so they no longer need a clause here.
  );
});
