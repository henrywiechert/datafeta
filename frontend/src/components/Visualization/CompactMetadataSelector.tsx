import React from 'react';
import { Box, CircularProgress, Typography, TextField } from '@mui/material';
import Autocomplete from '@mui/material/Autocomplete';
import { Database, Table, Field } from '../../types';
import JoinTableSelector from './JoinTableSelector';
import UnionTableSelector from './UnionTableSelector';
import styles from './CompactMetadataSelector.module.css';

type FilterableSelectProps = {
  label: string;
  placeholder: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
  loading?: boolean;
  disabled?: boolean;
  allowEmpty?: boolean;
};

const FilterableSelect: React.FC<FilterableSelectProps> = ({
  label,
  placeholder,
  options,
  value,
  onChange,
  loading = false,
  disabled = false,
  allowEmpty = true,
}) => {
  const handleChange = (_: unknown, newValue: string | null) => {
    if (!allowEmpty && !newValue) return;
    onChange(newValue ?? '');
  };

  return (
    <Box className={styles.field}>
      <Typography
        variant="subtitle2"
        className={styles.categoryTitle}
        sx={{ fontWeight: 'normal', minWidth: '40px', paddingRight: '0px' }}
      >
        {label}
      </Typography>
      <Autocomplete
        disablePortal
        size="small"
        value={value || null}
        options={options}
        onChange={handleChange}
        disabled={disabled}
        disableClearable={!allowEmpty}
        autoHighlight
        isOptionEqualToValue={(option, optionValue) => option === optionValue}
        sx={{
          flexGrow: 1,
          '& .MuiInputBase-input': { fontSize: '0.8rem', padding: '4px 8px' },
        }}
        ListboxProps={{ style: { maxHeight: 240 } }}
        renderInput={(params) => (
          <TextField
            {...params}
            placeholder={placeholder}
            size="small"
            InputProps={{
              ...params.InputProps,
              endAdornment: (
                <>
                  {loading ? <CircularProgress color="inherit" size={12} /> : null}
                  {params.InputProps.endAdornment}
                </>
              ),
            }}
          />
        )}
        noOptionsText="No matches"
      />
    </Box>
  );
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
  // Multi-table support - JOIN mode
  suggestedJoinableTables?: string[];
  joinedTables?: string[];
  onToggleJoinedTable?: (tableName: string) => void;
  // Multi-table support - UNION mode
  suggestedUnionableTables?: string[];
  unionTables?: string[];
  onToggleUnionTable?: (tableName: string) => void;
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
  availableFields = [],
  suggestedJoinableTables = [],
  joinedTables = [],
  onToggleJoinedTable,
  suggestedUnionableTables = [],
  unionTables = [],
  onToggleUnionTable,
}) => {
  const databaseOptions = React.useMemo(
    () => databases.map((db) => db.name).sort(),
    [databases]
  );

  const tableOptions = React.useMemo(
    () => tables.map((tbl) => tbl.name).sort(),
    [tables]
  );

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
        <FilterableSelect
          label="DB"
          placeholder="Search DB"
          options={databaseOptions}
          value={selectedDatabase}
          onChange={onDatabaseSelect}
        />
      )}

      <FilterableSelect
        label="Table"
        placeholder="Search Table"
        options={tableOptions}
        value={selectedTable}
        onChange={onTableSelect}
        loading={isLoadingMetadata}
        disabled={tables.length === 0}
        allowEmpty
      />
      
      {/* Show joinable tables selector (only for ClickHouse) */}
      {connectionType === 'clickhouse' && selectedTable && onToggleJoinedTable && (
        <JoinTableSelector
          primaryTable={selectedTable}
          suggestedJoinableTables={suggestedJoinableTables}
          joinedTables={joinedTables}
          onToggleJoin={onToggleJoinedTable}
        />
      )}
      
      {/* Show unionable tables selector (only for ClickHouse) */}
      {connectionType === 'clickhouse' && selectedTable && onToggleUnionTable && (
        <UnionTableSelector
          primaryTable={selectedTable}
          suggestedUnionableTables={suggestedUnionableTables}
          unionTables={unionTables}
          onToggleUnion={onToggleUnionTable}
        />
      )}
      
      {metadataError && (
        <Typography variant="caption" className={styles.error}>
          {metadataError}
        </Typography>
      )}
    </div>
  );
};

export default CompactMetadataSelector;
