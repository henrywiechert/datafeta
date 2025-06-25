import React from 'react';
import { FormControl, Select, MenuItem, CircularProgress, Typography, Box } from '@mui/material';
import { Database, Table, Field } from '../../types';
import styles from './CompactMetadataSelector.module.css';

// Define custom styles for the MUI components
const selectProps = {
  sx: {
    '& .MuiSelect-select': {
      padding: '4px 14px',
      fontSize: '0.85rem',
      height: '20px',
    }
  },
  MenuProps: {
    PaperProps: {
      style: {
        maxHeight: 250,
      },
    },
  }
};

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
  availableFields?: Field[]; // Add the availableFields property
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
  onTableSelect,
  availableFields = []
}) => {
  return (
    <div className={styles.metadataSelector}>
      <Typography 
        variant="subtitle2"
        fontWeight="bold"
        align="left"
        fontSize="0.85rem"
        gutterBottom
        sx={{ marginBottom: 0.5 }}
      >
        Data Source
      </Typography>
      {connectionType === 'clickhouse' && (
        <div className={styles.field}>
          <Typography variant="subtitle2" className={styles.categoryTitle} sx={{ fontWeight: 'normal' }}>
            Database
          </Typography>
          <FormControl size="small" fullWidth>
            <Select 
              value={selectedDatabase}
              size="small"
              onChange={(e) => onDatabaseSelect(e.target.value as string)}
              fullWidth
              displayEmpty
              className={styles.selectRoot}
              {...selectProps}
            >
              <MenuItem value="" disabled>Select Database</MenuItem>
              {databases.map(db => (
                <MenuItem key={db.name} value={db.name} className={styles.menuItem}>
                  {db.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </div>
      )}
      
      <div className={styles.field}>
        <Typography variant="subtitle2" className={styles.categoryTitle} sx={{ fontWeight: 'normal' }}>
          Table
        </Typography>
        <FormControl size="small" fullWidth disabled={tables.length === 0}>
          <Select 
            value={selectedTable}
            size="small"
            onChange={(e) => onTableSelect(e.target.value as string)}
            fullWidth
            displayEmpty
            className={styles.selectRoot}
            {...selectProps}
          >
            <MenuItem value="" disabled>Select Table</MenuItem>
            {tables.map(tbl => (
              <MenuItem key={tbl.name} value={tbl.name} className={styles.menuItem}>
                {tbl.name}
              </MenuItem>
            ))}
          </Select>
          {isLoadingMetadata && (
            <CircularProgress size={14} sx={{ position: 'absolute', right: 24, top: 7 }} />
          )}
        </FormControl>
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
