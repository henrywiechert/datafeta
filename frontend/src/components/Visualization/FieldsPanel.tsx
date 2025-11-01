import React, { useMemo } from 'react';
import { Typography } from '@mui/material';
import FieldsSearch from './FieldsSearch';
import FieldCategory from './FieldCategory';
import CompactMetadataSelector from './CompactMetadataSelector';
import { Field, Database, Table } from '../../types';
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
  onToggleUnionTable
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

export default FieldsPanel;
