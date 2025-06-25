import React from 'react';
import { FormControl, Select, MenuItem, CircularProgress, Typography } from '@mui/material';
import { Database, Table } from '../../types';
import styles from './CompactMetadataSelector.module.css';

interface CompactMetadataSelectorProps {
  connectionType: string;
  selectedDatabase: string;
  selectedTable: string;
  databases: Database[];
  tables: Table[];
  isLoadingMetadata: boolean;
  metadataError: string | null;
  onDatabaseSelect: (database: string) => void;
  onTableSelect: (table: string) => void;
}

const CompactMetadataSelector: React.FC<CompactMetadataSelectorProps> = ({
  connectionType,
  selectedDatabase,
  selectedTable,
  databases,
  tables,
  isLoadingMetadata,
  metadataError,
  onDatabaseSelect,
  onTableSelect
}) => {
  return (
    <div className={styles.metadataSelector}>
      {connectionType === 'clickhouse' && (
        <div className={styles.row}>
          <div className={styles.label}>Database:</div>
          <FormControl size="small" className={styles.selector}>
            <Select 
              value={selectedDatabase}
              size="small"
              onChange={(e) => onDatabaseSelect(e.target.value as string)}
              fullWidth
              displayEmpty
            >
              <MenuItem value="" disabled>Select Database</MenuItem>
              {databases.map(db => (
                <MenuItem key={db.name} value={db.name}>
                  {db.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </div>
      )}
      
      <div className={styles.row}>
        <div className={styles.label}>Table:</div>
        <FormControl size="small" className={styles.selector} disabled={tables.length === 0}>
          <Select 
            value={selectedTable}
            size="small"
            onChange={(e) => onTableSelect(e.target.value as string)}
            fullWidth
            displayEmpty
          >
            <MenuItem value="" disabled>Select Table</MenuItem>
            {tables.map(tbl => (
              <MenuItem key={tbl.name} value={tbl.name}>
                {tbl.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        {isLoadingMetadata && (
          <CircularProgress size={16} className={styles.spinner} />
        )}
      </div>
      
      {metadataError && (
        <Typography variant="caption" className={styles.error}>
          {metadataError}
        </Typography>
      )}
    </div>
  );
};

export default CompactMetadataSelector;
