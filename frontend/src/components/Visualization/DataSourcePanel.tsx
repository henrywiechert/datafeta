import React from 'react';
import {
  Paper,
  Typography,
  SelectChangeEvent
} from '@mui/material';
import MetadataSelectors from './MetadataSelectors';
import ColumnList from './ColumnList';
import { Database, Table, Column } from '../../types';
import styles from './DataSourcePanel.module.css';

interface DataSourcePanelProps {
  connectionType?: string;
  databases: Database[];
  tables: Table[];
  columns: Column[];
  selectedDatabase: string;
  selectedTable: string;
  onDatabaseSelect: (event: SelectChangeEvent<string>) => void;
  onTableSelect: (event: SelectChangeEvent<string>) => void;
  isLoading: boolean;
  error: string | null;
}

function DataSourcePanel({
  connectionType,
  databases,
  tables,
  columns,
  selectedDatabase,
  selectedTable,
  onDatabaseSelect,
  onTableSelect,
  isLoading,
  error
}: DataSourcePanelProps) {

  // Determine if the "No columns found" message should be shown
  const showNoColumnsMessage = !!selectedTable; // Show only if a table is selected

  return (
    // The outer Box controlling width/flex is in VisualizationPage.tsx
    <Paper elevation={2} className={styles.panelPaper}>
      <Typography variant="h6" gutterBottom>Data Source Details</Typography>

      <MetadataSelectors
        connectionType={connectionType}
        databases={databases}
        tables={tables}
        selectedDatabase={selectedDatabase}
        selectedTable={selectedTable}
        onDatabaseSelect={onDatabaseSelect}
        onTableSelect={onTableSelect}
        isLoading={isLoading}
        error={error}
      />

      <ColumnList
        columns={columns}
        isLoading={isLoading} // Pass loading state
        showNoColumnsMessage={showNoColumnsMessage}
      />
    </Paper>
  );
}

export default DataSourcePanel; 