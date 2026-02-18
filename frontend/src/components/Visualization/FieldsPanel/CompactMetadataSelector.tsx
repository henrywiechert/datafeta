import React from 'react';
import { Box, CircularProgress, Typography, TextField, IconButton, Tooltip } from '@mui/material';
import Autocomplete from '@mui/material/Autocomplete';
import RefreshIcon from '@mui/icons-material/Refresh';
import AddIcon from '@mui/icons-material/Add';
import { Database, Table, Field } from '../../../types';
import JoinTableSelector from './JoinTableSelector';
import TableAddPicker from './TableAddPicker';
import SelectedTablesList from './SelectedTablesList';
import styles from './CompactMetadataSelector.module.css';
import compactStyles from './CompactAutocomplete.module.css';

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
        sx={{ 
          fontWeight: 500, 
          fontSize: '0.7rem', 
          minWidth: '36px', 
          textAlign: 'right', 
          paddingRight: '2px', 
          color: 'rgba(0,0,0,0.55)',
          display: 'flex',
          alignItems: 'center',
          height: '26px',
          lineHeight: 1
        }}
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
        className={compactStyles.compact}
        ListboxProps={{ className: 'compactListbox' }}
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
  onRefreshMetadata?: () => void;
  availableFields?: Field[]; // Add the availableFields property
  // Multi-table support - JOIN mode
  suggestedJoinableTables?: string[];
  joinedTables?: string[];
  onToggleJoinedTable?: (tableName: string) => void;
  // Multi-table support - UNION mode (cross-database)
  unionTables?: Array<{database: string, table_name: string}>;
  onAddUnionTable?: (database: string, tableName: string) => void;
  onRemoveUnionTable?: (database: string, tableName: string) => void;
  tablesCache?: Record<string, Table[]>;  // Cache of tables by database
  onLoadTablesForDatabase?: (database: string) => void;  // Load tables for a specific database
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
  onRefreshMetadata,
  availableFields = [],
  suggestedJoinableTables = [],
  joinedTables = [],
  onToggleJoinedTable,
  unionTables = [],
  onAddUnionTable,
  onRemoveUnionTable,
  tablesCache = {},
  onLoadTablesForDatabase,
}) => {
  const databaseOptions = React.useMemo(
    () => databases.map((db) => db.name).sort(),
    [databases]
  );

  const tableOptions = React.useMemo(
    () => tables.map((tbl) => tbl.name).sort(),
    [tables]
  );

  const handleAddTable = React.useCallback(
    (payload: { database: string; table: string }) => {
      // First add becomes primary (staged selection): mutate real selection only on Add.
      if (!selectedTable) {
        onDatabaseSelect(payload.database);
        onTableSelect(payload.table);
        return;
      }
      // Subsequent adds are UNION secondaries.
      if (onAddUnionTable) onAddUnionTable(payload.database, payload.table);
    },
    [selectedTable, onAddUnionTable, onDatabaseSelect, onTableSelect]
  );

  const handleRemovePrimary = React.useCallback(() => {
    // Clear primary (this also resets JOIN/UNION in DataSourceContext via setSelectedTable)
    onTableSelect('');
  }, [onTableSelect]);

  // CSV multi-table: available tables for UNION (excludes primary and already-added)
  const csvUnionableOptions = React.useMemo(() => {
    if (connectionType !== 'csv') return [];
    return tableOptions.filter(
      (t) =>
        t !== selectedTable &&
        !unionTables.some((ut) => ut.table_name === t)
    );
  }, [connectionType, tableOptions, selectedTable, unionTables]);

  const [csvStagedTable, setCsvStagedTable] = React.useState('');

  // Reset staged table when primary changes
  React.useEffect(() => {
    setCsvStagedTable('');
  }, [selectedTable]);

  const handleCsvAdd = React.useCallback(() => {
    if (!csvStagedTable) return;
    if (onAddUnionTable) onAddUnionTable('', csvStagedTable);
    setCsvStagedTable('');
  }, [csvStagedTable, onAddUnionTable]);

  // Whether to show the CSV UNION picker (multiple tables available)
  const showCsvUnionPicker = connectionType === 'csv' && tables.length > 1 && !!selectedTable;

  return (
    <div className={styles.metadataSelector}>
      <Box className={styles.headerRow}>
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
        <Tooltip title="Refresh metadata" placement="left">
          <span>
            <IconButton
              size="small"
              aria-label="Refresh metadata"
              onClick={onRefreshMetadata}
              disabled={isLoadingMetadata}
              sx={{ width: 20, height: 20 }}
            >
              <RefreshIcon fontSize="inherit" />
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      {connectionType === 'clickhouse' ? (
        <>
          <TableAddPicker
            databases={databaseOptions}
            tablesCache={tablesCache}
            onLoadTablesForDatabase={onLoadTablesForDatabase}
            primaryDatabase={selectedDatabase}
            primaryTable={selectedTable}
            unionTables={unionTables}
            onAdd={handleAddTable}
          />

          <SelectedTablesList
            primaryDatabase={selectedDatabase}
            primaryTable={selectedTable}
            unionTables={unionTables}
            onRemovePrimary={handleRemovePrimary}
            onRemoveUnionTable={(db, t) => onRemoveUnionTable?.(db, t)}
          />
        </>
      ) : (
        <>
          {/* Primary table selector (CSV, Kaggle, …) */}
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

          {/* CSV UNION picker — shown when multiple uploaded files are available */}
          {showCsvUnionPicker && (
            <>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 32px', gap: 0.5, alignItems: 'center', mt: 0.5 }}>
                <Autocomplete
                  disablePortal
                  size="small"
                  value={csvStagedTable || null}
                  options={csvUnionableOptions}
                  onChange={(_, v) => setCsvStagedTable(v ?? '')}
                  isOptionEqualToValue={(o, v) => o === v}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      placeholder="Add table (UNION)"
                      size="small"
                      InputProps={{
                        ...params.InputProps,
                        endAdornment: (
                          <>
                            {isLoadingMetadata ? <CircularProgress color="inherit" size={12} /> : null}
                            {params.InputProps.endAdornment}
                          </>
                        ),
                      }}
                    />
                  )}
                  sx={{
                    '& .MuiInputBase-root': { fontSize: '0.9rem', height: 30 },
                    '& .MuiOutlinedInput-input': { padding: '4px 4px !important' },
                    '& .MuiOutlinedInput-notchedOutline': { padding: '0 0px', visibility: 'hidden' },
                  }}
                  ListboxProps={{
                    sx: {
                      padding: '2px 0',
                      '& .MuiAutocomplete-option': { fontSize: '0.9rem', padding: '1px 8px', lineHeight: 1.2 },
                    },
                  }}
                  noOptionsText="No more tables"
                />
                <Tooltip title={csvStagedTable ? 'Add as UNION ALL' : 'Select a table first'} placement="right">
                  <span>
                    <IconButton
                      size="small"
                      onClick={handleCsvAdd}
                      disabled={!csvStagedTable}
                      sx={{ width: 28, height: 28 }}
                      aria-label="Add table as UNION ALL"
                    >
                      <AddIcon />
                    </IconButton>
                  </span>
                </Tooltip>
              </Box>

              {/* Show selected tables list when there are union tables */}
              {(unionTables.length > 0) && (
                <SelectedTablesList
                  primaryDatabase=""
                  primaryTable={selectedTable}
                  unionTables={unionTables}
                  onRemovePrimary={handleRemovePrimary}
                  onRemoveUnionTable={(db, t) => onRemoveUnionTable?.(db, t)}
                />
              )}
            </>
          )}
        </>
      )}
      
      {/* Show joinable tables selector (for ClickHouse and Kaggle) */}
      {(connectionType === 'clickhouse' || connectionType === 'kaggle') && selectedTable && onToggleJoinedTable && (
        <JoinTableSelector
          primaryTable={selectedTable}
          suggestedJoinableTables={suggestedJoinableTables}
          joinedTables={joinedTables}
          onToggleJoin={onToggleJoinedTable}
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
