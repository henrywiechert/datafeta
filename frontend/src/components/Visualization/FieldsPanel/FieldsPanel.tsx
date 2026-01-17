import React, { useMemo, useEffect, useRef, useCallback } from 'react';
import { Typography } from '@mui/material';
import FieldsSearch from './FieldsSearch';
import FieldCategory from './FieldCategory';
import CompactMetadataSelector from './CompactMetadataSelector';
import VirtualColumnManager from '../../VirtualColumns/VirtualColumnManager';
import { Field, Database, Table, VirtualColumnDefinition } from '../../../types';
import { useFieldsPanelDrag } from '../../../hooks/useFieldsPanelDrag';
import styles from './FieldsPanel.module.css';
import { useSelectionStore } from '../../../stores/selectionStore';

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
  // Virtual columns props
  virtualColumns = [],
  onAddVirtualColumn,
  onUpdateVirtualColumn,
  onRemoveVirtualColumn
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
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
    onRemoveFromMeasureGroup
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

  // Create filter function that works with search term
  const filterBySearch = useMemo(() => (field: Field) => (
    field.columnName.toLowerCase().includes(fieldsSearch.toLowerCase()) ||
    (field.aggregation && field.aggregation.toLowerCase().includes(fieldsSearch.toLowerCase())) ||
    (field.dataType && field.dataType.toLowerCase().includes(fieldsSearch.toLowerCase()))
  ), [fieldsSearch]);

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
        availableFields={availableFields}
        suggestedJoinableTables={suggestedJoinableTables}
        joinedTables={joinedTables}
        onToggleJoinedTable={onToggleJoinedTable}
        unionTables={unionTables}
        onAddUnionTable={onAddUnionTable}
        onRemoveUnionTable={onRemoveUnionTable}
        tablesCache={tablesCache}
        onLoadTablesForDatabase={onLoadTablesForDatabase}
      />
      
      {/* Fields search below metadata */}
      <div className={styles.header}>
        <Typography
            variant="subtitle2"
            fontWeight="bold"
            align="left"
            fontSize="0.85rem"
            gutterBottom
        >
            Fields
        </Typography>
        <FieldsSearch value={fieldsSearch} onChange={onFieldsSearchChange} />
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
        />
        
        <FieldCategory 
          title="Measures"
          fields={filteredMeasures}
          onUpdate={onFieldUpdate}
        />
      </div>
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
    prevProps.virtualColumns === nextProps.virtualColumns
    // Callbacks NOT compared - they are now stable (see useDragDrop.ts, useFieldOperations.ts)
  );
});
