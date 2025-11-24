import React, { useState } from 'react';
import { 
  Box, 
  Typography, 
  Chip, 
  Tooltip, 
  IconButton,
  Collapse,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel
} from '@mui/material';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import AddIcon from '@mui/icons-material/Add';
import { Database, Table } from '../../types';
import styles from './UnionTableSelector.module.css';

interface UnionTableRef {
  database: string;
  table_name: string;
}

interface UnionTableSelectorProps {
  primaryTable: string;
  primaryDatabase: string;
  databases: Database[];
  allTables: { [database: string]: Table[] };  // Map of database -> tables
  unionTables: UnionTableRef[];
  onAddUnionTable: (database: string, tableName: string) => void;
  onRemoveUnionTable: (database: string, tableName: string) => void;
  onLoadTables?: (database: string) => void;  // Load tables for a database
}

const UnionTableSelector: React.FC<UnionTableSelectorProps> = ({
  primaryTable,
  primaryDatabase,
  databases,
  allTables,
  unionTables,
  onAddUnionTable,
  onRemoveUnionTable,
  onLoadTables,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [selectedDatabase, setSelectedDatabase] = useState<string>('');
  const [selectedTable, setSelectedTable] = useState<string>('');

  const handleDatabaseChange = (database: string) => {
    setSelectedDatabase(database);
    setSelectedTable('');
    // Load tables for this database if callback provided
    if (onLoadTables && !allTables[database]) {
      onLoadTables(database);
    }
  };

  const handleAddTable = () => {
    if (selectedDatabase && selectedTable) {
      onAddUnionTable(selectedDatabase, selectedTable);
      setSelectedTable('');
    }
  };

  const handleRemoveTable = (database: string, tableName: string) => {
    onRemoveUnionTable(database, tableName);
  };

  const availableTables = selectedDatabase ? (allTables[selectedDatabase] || []) : [];
  
  // Filter out primary table and already added tables
  const filteredTables = availableTables.filter(t => {
    if (selectedDatabase === primaryDatabase && t.name === primaryTable) return false;
    return !unionTables.some(ut => ut.database === selectedDatabase && ut.table_name === t.name);
  });

  return (
    <Box className={styles.container}>
      <Box className={styles.header}>
        <Typography 
          variant="subtitle2"
          fontWeight="bold"
          fontSize="0.85rem"
        >
          Combine Tables (UNION ALL)
        </Typography>
        <IconButton 
          size="small" 
          onClick={() => setExpanded(!expanded)}
          className={styles.expandButton}
        >
          {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        </IconButton>
      </Box>

      <Collapse in={expanded}>
        <Box className={styles.addTableSection}>
          <FormControl size="small" style={{ minWidth: 120, marginRight: 8 }}>
            <InputLabel>Database</InputLabel>
            <Select
              value={selectedDatabase}
              onChange={(e) => handleDatabaseChange(e.target.value)}
              label="Database"
            >
              {databases.map((db) => (
                <MenuItem key={db.name} value={db.name}>
                  {db.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" style={{ minWidth: 150, marginRight: 8 }} disabled={!selectedDatabase}>
            <InputLabel>Table</InputLabel>
            <Select
              value={selectedTable}
              onChange={(e) => setSelectedTable(e.target.value)}
              label="Table"
            >
              {filteredTables.map((table) => (
                <MenuItem key={table.name} value={table.name}>
                  {table.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Button
            size="small"
            variant="contained"
            onClick={handleAddTable}
            disabled={!selectedDatabase || !selectedTable}
            startIcon={<AddIcon />}
          >
            Add
          </Button>
        </Box>

        <Box className={styles.tableList}>
          {unionTables.map((unionTable, index) => {
            const displayLabel = `${unionTable.database}.${unionTable.table_name}`;
            
            return (
              <Tooltip 
                key={`${unionTable.database}.${unionTable.table_name}-${index}`}
                title={`Click to remove ${displayLabel} from union`}
                arrow
              >
                <Chip
                  label={displayLabel}
                  onClick={() => handleRemoveTable(unionTable.database, unionTable.table_name)}
                  icon={<RemoveCircleOutlineIcon />}
                  color="secondary"
                  variant="filled"
                  className={styles.tableChip}
                  size="small"
                />
              </Tooltip>
            );
          })}
        </Box>

        {unionTables.length > 0 && (
          <Box className={styles.unionInfo}>
            <Typography variant="caption" color="text.secondary">
              Combining {unionTables.length + 1} tables ({primaryDatabase}.{primaryTable} + {unionTables.length} more)
            </Typography>
          </Box>
        )}
      </Collapse>
    </Box>
  );
};

export default UnionTableSelector;
