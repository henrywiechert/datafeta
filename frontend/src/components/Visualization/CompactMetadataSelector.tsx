import React from 'react';
import { FormControl, Select, MenuItem, CircularProgress, Typography } from '@mui/material';
import { Database, Table, Field } from '../../types';
import styles from './CompactMetadataSelector.module.css';

// Define custom styles for the MUI components
const selectProps = {
  sx: {
    '& .MuiSelect-select': {
      padding: '2px 8px',
      fontSize: '0.75rem',
      height: '18px',
    }
  },
  MenuProps: {
    PaperProps: {
      style: {
        maxHeight: 200,
      },
    },
    sx: {
      '& .MuiMenuItem-root': {
        minHeight: '24px',
        fontSize: '0.75rem',
        padding: '2px 8px',
      }
    }
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
        sx={{ marginBottom: 0.2 }}
      >
        Data Source
      </Typography>
      {connectionType === 'clickhouse' && (
        <div className={styles.field}>
          <Typography variant="subtitle2" className={styles.categoryTitle} sx={{ fontWeight: 'normal', minWidth: '40px', paddingRight: '0px' }}>
            DB
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
              <MenuItem value="" disabled sx={{ fontSize: '0.75rem', minHeight: '24px' }}>Select DB</MenuItem>
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
        <Typography variant="subtitle2" className={styles.categoryTitle} sx={{ fontWeight: 'normal', minWidth: '40px', paddingRight: '0px' }}>
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
            <MenuItem value="" disabled sx={{ fontSize: '0.75rem', minHeight: '24px' }}>Select Table</MenuItem>
            {tables.map(tbl => (
              <MenuItem key={tbl.name} value={tbl.name} className={styles.menuItem}>
                {tbl.name}
              </MenuItem>
            ))}
          </Select>
          {isLoadingMetadata && (
            <CircularProgress size={12} sx={{ position: 'absolute', right: 24, top: 6 }} />
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
