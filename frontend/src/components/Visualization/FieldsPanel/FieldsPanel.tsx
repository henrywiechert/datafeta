// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { useMemo, useEffect, useRef, useCallback, useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import FieldsSearch from './FieldsSearch';
import FieldCategory from './FieldCategory';
import CompactMetadataSelector from './CompactMetadataSelector';
import VirtualColumnManager from '../../VirtualColumns/VirtualColumnManager';
import BinConfigDialog, { FieldStats } from '../../VirtualColumns/BinConfigDialog';
import { Field, Database, Table, VirtualColumnDefinition } from '../../../types';
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
  // New props for metadata selection
  connectionType: string;
  selectedDatabase: string;
  selectedTable: string;
  databases: Database[];
  tables: Table[];
  isLoadingMetadata: boolean;
  metadataError: string | null;
  onDatabaseSelect: (database: string) => void;
  onTableSelect: (table: string) => void;
  onRefreshMetadata?: () => void;
  // Multi-table join props
  suggestedJoinableTables?: string[];
  joinedTables?: string[];
  onToggleJoinedTable?: (tableName: string) => void;
  // Multi-table union props (cross-database)
  unionTables?: Array<{database: string, table_name: string}>;
  onAddUnionTable?: (database: string, tableName: string) => void;
  onRemoveUnionTable?: (database: string, tableName: string) => void;
  tablesCache?: Record<string, Table[]>;
  onLoadTablesForDatabase?: (database: string) => void;
  // Hive Parquet partition loading
  loadedPartitions?: Set<string>;
  isLoadingPartition?: boolean;
  onLoadPartition?: (partitionName: string, setAsPrimary?: boolean) => Promise<void>;
  // Add files to existing CSV/Parquet connection
  onAddFiles?: (files: File[]) => Promise<void>;
  // Virtual columns props
  virtualColumns?: VirtualColumnDefinition[];
  onAddVirtualColumn?: (column: VirtualColumnDefinition) => void;
  onUpdateVirtualColumn?: (index: number, column: VirtualColumnDefinition) => void;
  onRemoveVirtualColumn?: (index: number) => void;
}

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
  // New props for metadata selection
  connectionType,
  selectedDatabase,
  selectedTable,
  databases,
  tables,
  isLoadingMetadata,
  metadataError,
  onDatabaseSelect,
  onTableSelect,
  onRefreshMetadata,
  // Multi-table join props
  suggestedJoinableTables,
  joinedTables,
  onToggleJoinedTable,
  // Multi-table union props
  unionTables,
  onAddUnionTable,
  onRemoveUnionTable,
  tablesCache,
  onLoadTablesForDatabase,
  // Hive Parquet partition loading
  loadedPartitions,
  isLoadingPartition,
  onLoadPartition,
  // Add files to existing CSV/Parquet connection
  onAddFiles,
  // Virtual columns props
  virtualColumns = [],
  onAddVirtualColumn,
  onUpdateVirtualColumn,
  onRemoveVirtualColumn
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [useRegex, setUseRegex] = useState(false);
  
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
    <div ref={containerRef} className={styles.container} onClick={handleContainerClick} style={{ border: '1px solid #ddd', borderRadius: 6, padding: 0 }}>
      {/* Metadata selector at the top */}
      <CompactMetadataSelector
        connectionType={connectionType}
        selectedDatabase={selectedDatabase}
        selectedTable={selectedTable}
        databases={databases}
        tables={tables}
        isLoadingMetadata={isLoadingMetadata}
        metadataError={metadataError}
        onDatabaseSelect={onDatabaseSelect}
        onTableSelect={onTableSelect}
        onRefreshMetadata={onRefreshMetadata}
        availableFields={availableFields}
        suggestedJoinableTables={suggestedJoinableTables}
        joinedTables={joinedTables}
        onToggleJoinedTable={onToggleJoinedTable}
        unionTables={unionTables}
        onAddUnionTable={onAddUnionTable}
        onRemoveUnionTable={onRemoveUnionTable}
        tablesCache={tablesCache}
        onLoadTablesForDatabase={onLoadTablesForDatabase}
        loadedPartitions={loadedPartitions}
        isLoadingPartition={isLoadingPartition}
        onLoadPartition={onLoadPartition}
        onAddFiles={onAddFiles}
      />
      
      {/* Fields search below metadata */}
      <div className={styles.header}>
        <Box className={styles.headerTitleRow}>
          <Typography
              variant="subtitle2"
              fontWeight="bold"
              align="left"
              fontSize="0.85rem"
              gutterBottom
          >
              Fields
          </Typography>
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
        </Box>
        <FieldsSearch
          value={fieldsSearch}
          onChange={onFieldsSearchChange}
          error={useRegex && !!regexError}
          helperText={useRegex ? regexError || '' : ''}
        />
      </div>
      <div 
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
    prevProps.connectionType === nextProps.connectionType &&
    prevProps.selectedDatabase === nextProps.selectedDatabase &&
    prevProps.selectedTable === nextProps.selectedTable &&
    prevProps.databases === nextProps.databases &&
    prevProps.tables === nextProps.tables &&
    prevProps.isLoadingMetadata === nextProps.isLoadingMetadata &&
    prevProps.metadataError === nextProps.metadataError &&
    // Multi-table props must trigger rerender so JOIN/UNION UIs update correctly
    prevProps.suggestedJoinableTables === nextProps.suggestedJoinableTables &&
    prevProps.joinedTables === nextProps.joinedTables &&
    prevProps.unionTables === nextProps.unionTables &&
    prevProps.tablesCache === nextProps.tablesCache &&
    prevProps.virtualColumns === nextProps.virtualColumns &&
    // Hive Parquet partition loading props
    prevProps.loadedPartitions === nextProps.loadedPartitions &&
    prevProps.isLoadingPartition === nextProps.isLoadingPartition
    // Callbacks NOT compared - they are now stable (see useDragDrop.ts, useFieldOperations.ts)
  );
});
