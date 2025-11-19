import React, { useMemo } from 'react';
import { Typography, Accordion, AccordionSummary, AccordionDetails } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FieldsSearch from './FieldsSearch';
import FieldCategory from './FieldCategory';
import CompactMetadataSelector from './CompactMetadataSelector';
import VirtualColumnManager from '../VirtualColumns/VirtualColumnManager';
import { Field, Database, Table, VirtualColumnDefinition } from '../../types';
import { useFieldsPanelDrag } from '../../hooks/useFieldsPanelDrag';
import styles from './FieldsPanel.module.css';

interface FieldsPanelProps {
  availableFields: Field[];
  fieldsSearch: string;
  onFieldsSearchChange: (search: string) => void;
  onFieldUpdate: (field: Field) => void;
  onRemoveFromAxis: (fieldId: string) => void;
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
  // Multi-table union props
  suggestedUnionableTables?: string[];
  unionTables?: string[];
  onToggleUnionTable?: (tableName: string) => void;
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
  suggestedUnionableTables,
  unionTables,
  onToggleUnionTable,
  // Virtual columns props
  virtualColumns = [],
  onAddVirtualColumn,
  onUpdateVirtualColumn,
  onRemoveVirtualColumn
}) => {
  // Use our custom hook for drag and drop functionality
  const {
    isDragOver,
    handleDragOver,
    handleDragLeave,
    handleDrop
  } = useFieldsPanelDrag(onRemoveFromAxis);

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
  ), [availableFields, filterBySearch]);

  const filteredMeasures = useMemo(() => (
    availableFields
      .filter(field => field.type === 'measure')
      .filter(filterBySearch)
  ), [availableFields, filterBySearch]);

  return (
    <div className={styles.container} style={{ border: '1px solid #ddd', borderRadius: 6, padding: 0 }}>
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
        suggestedUnionableTables={suggestedUnionableTables}
        unionTables={unionTables}
        onToggleUnionTable={onToggleUnionTable}
      />
      
      {/* Virtual Columns Manager */}
      {onAddVirtualColumn && onUpdateVirtualColumn && onRemoveVirtualColumn && (
        <Accordion 
          defaultExpanded={false}
          sx={{ 
            boxShadow: 'none',
            '&:before': { display: 'none' },
            borderTop: '1px solid #e0e0e0'
          }}
        >
          <AccordionSummary 
            expandIcon={<ExpandMoreIcon />}
            sx={{ 
              minHeight: 40,
              '&.Mui-expanded': { minHeight: 40 },
              '& .MuiAccordionSummary-content': { margin: '8px 0' }
            }}
          >
            <Typography variant="subtitle2" fontWeight="bold" fontSize="0.85rem">
              Virtual Columns
            </Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ p: 1, maxHeight: 300, overflow: 'auto' }}>
            <VirtualColumnManager
              virtualColumns={virtualColumns}
              availableColumns={availableFields.map(f => f.columnName)}
              onAdd={onAddVirtualColumn}
              onEdit={onUpdateVirtualColumn}
              onDelete={onRemoveVirtualColumn}
            />
          </AccordionDetails>
        </Accordion>
      )}
      
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

// Custom comparison to prevent re-renders when filter configurations change
// Only re-render if fields, search, database/table selection, or virtual columns actually change
const arePropsEqual = (prev: FieldsPanelProps, next: FieldsPanelProps) => {
  return (
    prev.availableFields === next.availableFields &&
    prev.fieldsSearch === next.fieldsSearch &&
    prev.selectedDatabase === next.selectedDatabase &&
    prev.selectedTable === next.selectedTable &&
    prev.isLoadingMetadata === next.isLoadingMetadata &&
    prev.metadataError === next.metadataError &&
    prev.virtualColumns === next.virtualColumns &&
    prev.joinedTables === next.joinedTables &&
    prev.unionTables === next.unionTables
  );
};

export default React.memo(FieldsPanel, arePropsEqual);
