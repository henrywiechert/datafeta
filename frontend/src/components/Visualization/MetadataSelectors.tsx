import React from 'react';
import {
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  CircularProgress,
  Alert,
  SelectChangeEvent
} from '@mui/material';
import { Database, Table } from '../../types';
import styles from './MetadataSelectors.module.css';

interface MetadataSelectorsProps {
  connectionType?: string;
  databases: Database[];
  tables: Table[];
  selectedDatabase: string;
  selectedTable: string;
  onDatabaseSelect: (event: SelectChangeEvent<string>) => void;
  onTableSelect: (event: SelectChangeEvent<string>) => void;
  isLoading: boolean;
  error: string | null;
}

function MetadataSelectors({
  connectionType,
  databases,
  tables,
  selectedDatabase,
  selectedTable,
  onDatabaseSelect,
  onTableSelect,
  isLoading,
  error,
}: MetadataSelectorsProps) {
  return (
    <>
      {/* DB Selector (ClickHouse only) */}
      {connectionType === 'clickhouse' && (
        <FormControl fullWidth className={styles.formControl}>
          <InputLabel id="db-select-label">Database</InputLabel>
          <Select
            id="db-select"
            labelId="db-select-label"
            label="Database"
            value={selectedDatabase}
            onChange={onDatabaseSelect}
            disabled={isLoading || databases.length === 0}
          >
            <MenuItem value="" disabled>-- Select Database --</MenuItem>
            {databases.map(db => <MenuItem key={db.name} value={db.name}>{db.name}</MenuItem>)}
          </Select>
        </FormControl>
      )}

      {/* Table Selector (ClickHouse or CSV) */}
      {(connectionType === 'clickhouse' || connectionType === 'csv') && (
        <FormControl fullWidth className={styles.formControl}>
          <InputLabel id="tbl-select-label">Table</InputLabel>
          <Select
            id="tbl-select"
            labelId="tbl-select-label"
            label="Table"
            value={selectedTable}
            onChange={onTableSelect}
            disabled={isLoading || (connectionType === 'clickhouse' && !selectedDatabase) || tables.length === 0}
          >
            <MenuItem value="" disabled>{tables.length === 0 && !isLoading ? (connectionType === 'clickhouse' ? 'Select DB first' : 'No table found') : '-- Select Table --'}</MenuItem>
            {tables.map(tbl => <MenuItem key={tbl.name} value={tbl.name}>{tbl.name}</MenuItem>)}
          </Select>
        </FormControl>
      )}

      {/* Loading/Error */}
      {isLoading && <Box className={styles.loadingBox}><CircularProgress size={24} /></Box>}
      {error && <Alert severity="error" className={styles.errorAlert}>{error}</Alert>}
    </>
  );
}

export default MetadataSelectors; 