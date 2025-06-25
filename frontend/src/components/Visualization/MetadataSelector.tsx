import React from 'react';
import { Box, FormControl, InputLabel, Select, MenuItem, CircularProgress, Alert, Paper, Typography } from '@mui/material';
import { Database, Table } from '../../types';

interface MetadataSelectorProps {
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

const MetadataSelector: React.FC<MetadataSelectorProps> = ({
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
    <Paper sx={{ p: 2, borderRadius: 0, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
        <Typography variant="h6">Visualization</Typography>
        {connectionType === 'clickhouse' && (
          <FormControl sx={{ minWidth: 200 }}>
            <InputLabel>Database</InputLabel>
            <Select 
              value={selectedDatabase} 
              label="Database" 
              onChange={(e) => onDatabaseSelect(e.target.value as string)}
            >
              {databases.map(db => (
                <MenuItem key={db.name} value={db.name}>
                  {db.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
        <FormControl sx={{ minWidth: 200 }} disabled={tables.length === 0}>
          <InputLabel>Table</InputLabel>
          <Select 
            value={selectedTable} 
            label="Table" 
            onChange={(e) => onTableSelect(e.target.value as string)}
          >
            {tables.map(tbl => (
              <MenuItem key={tbl.name} value={tbl.name}>
                {tbl.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        {isLoadingMetadata && <CircularProgress size={24} />}
        {metadataError && <Alert severity="error">{metadataError}</Alert>}
      </Box>
    </Paper>
  );
};

export default MetadataSelector;
