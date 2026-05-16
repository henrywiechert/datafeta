// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { Box, CircularProgress, Typography, TextField, IconButton, Tooltip } from '@mui/material';
import Autocomplete from '@mui/material/Autocomplete';
import RefreshIcon from '@mui/icons-material/Refresh';
import AddIcon from '@mui/icons-material/Add';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { Database, Table, Field } from '../../../types';
import JoinTableSelector from './JoinTableSelector';
import TableAddPicker from './TableAddPicker';
import SelectedTablesList from './SelectedTablesList';
import styles from './CompactMetadataSelector.module.css';
import {
  compactAutocompleteClassName,
  compactAutocompleteListboxProps,
  sourcePickerFieldLabelSx,
} from './sourcePickerShared';

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
      <Typography variant="subtitle2" sx={sourcePickerFieldLabelSx}>
        {label}
      </Typography>
      <Box sx={{ flex: 1, minWidth: 0 }}>
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
          className={compactAutocompleteClassName}
          ListboxProps={compactAutocompleteListboxProps}
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
  // Hive Parquet partition loading
  loadedPartitions?: Set<string>;  // Partitions that have been loaded
  isLoadingPartition?: boolean;
  onLoadPartition?: (partitionName: string, setAsPrimary?: boolean) => Promise<void>;
  // Add files to existing CSV/Parquet connection
  onAddFiles?: (files: File[]) => Promise<void>;
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
  loadedPartitions = new Set(),
  isLoadingPartition = false,
  onLoadPartition,
  onAddFiles,
}) => {
  const addFilesInputRef = React.useRef<HTMLInputElement>(null);
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

  const handleApplyPatternSelection = React.useCallback(
    (resolvedTables: Array<{ database: string; table_name: string }>) => {
      let needsPrimary = !selectedTable;

      resolvedTables.forEach((tableRef) => {
        if (needsPrimary) {
          onDatabaseSelect(tableRef.database);
          onTableSelect(tableRef.table_name);
          needsPrimary = false;
          return;
        }

        onAddUnionTable?.(tableRef.database, tableRef.table_name);
      });
    },
    [selectedTable, onAddUnionTable, onDatabaseSelect, onTableSelect]
  );

  const handleRemovePrimary = React.useCallback(() => {
    // Clear primary (this also resets JOIN/UNION in DataSourceContext via setSelectedTable)
    onTableSelect('');
  }, [onTableSelect]);

  // CSV/Hive Parquet multi-table: available tables for UNION (excludes primary and already-added)
  const csvUnionableOptions = React.useMemo(() => {
    if (connectionType !== 'csv' && connectionType !== 'hive_parquet') return [];
    return tableOptions.filter(
      (t) =>
        t !== selectedTable &&
        !unionTables.some((ut) => ut.table_name === t) &&
        // For hive_parquet, only show loaded partitions as unionable
        (connectionType !== 'hive_parquet' || loadedPartitions.has(t))
    );
  }, [connectionType, tableOptions, selectedTable, unionTables, loadedPartitions]);

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

  // Whether to show the UNION picker (multiple tables available)
  // For CSV: when multiple files are uploaded
  // For Hive Parquet: when multiple partitions are loaded
  const showUnionPicker = (
    (connectionType === 'csv' && tables.length > 1 && !!selectedTable) ||
    (connectionType === 'hive_parquet' && loadedPartitions.size > 1 && !!selectedTable)
  );

  // Handle table selection for Hive Parquet (triggers partition loading)
  // Option A UX: If primary exists, subsequent selections ADD as UNION instead of replacing
  const handleHiveTableSelect = React.useCallback(async (table: string) => {
    if (!table) {
      onTableSelect('');
      return;
    }
    
    // Check if we already have a primary table selected
    const hasPrimary = !!selectedTable;
    
    // Don't add if it's the same as primary or already in union tables
    if (hasPrimary && (table === selectedTable || unionTables.some(ut => ut.table_name === table))) {
      return;
    }
    
    // If partition not loaded yet, trigger loading
    if (!loadedPartitions.has(table) && onLoadPartition) {
      try {
        // setAsPrimary = true only if no primary exists yet
        await onLoadPartition(table, !hasPrimary);
        return;
      } catch (err) {
        console.error('Failed to load partition:', err);
        return;
      }
    }
    
    // Partition already loaded
    if (hasPrimary) {
      // Add as UNION table
      if (onAddUnionTable) {
        onAddUnionTable('', table);
      }
    } else {
      // Set as primary
      onTableSelect(table);
    }
  }, [loadedPartitions, onLoadPartition, onTableSelect, selectedTable, unionTables, onAddUnionTable]);

  // Determine the actual table select handler based on connection type
  const effectiveTableSelect = connectionType === 'hive_parquet' ? handleHiveTableSelect : onTableSelect;

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
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
          {connectionType === 'csv' && onAddFiles && (
            <>
              <input
                ref={addFilesInputRef}
                type="file"
                accept=".csv,.parquet"
                multiple
                style={{ display: 'none' }}
                onChange={(e) => {
                  const files = e.target.files ? Array.from(e.target.files) : [];
                  if (files.length > 0) {
                    onAddFiles(files);
                  }
                  // Reset so the same file can be re-selected if needed
                  e.target.value = '';
                }}
              />
              <Tooltip title="Add more files to this connection" placement="left">
                <span>
                  <IconButton
                    size="small"
                    aria-label="Add more files"
                    onClick={() => addFilesInputRef.current?.click()}
                    disabled={isLoadingMetadata}
                    sx={{ width: 20, height: 20 }}
                  >
                    <UploadFileIcon fontSize="inherit" />
                  </IconButton>
                </span>
              </Tooltip>
            </>
          )}
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
            onApplyPatternSelection={handleApplyPatternSelection}
          />

          <SelectedTablesList
            primaryDatabase={selectedDatabase}
            primaryTable={selectedTable}
            unionTables={unionTables}
            joinedTables={joinedTables}
            availableFields={availableFields}
            onRemovePrimary={handleRemovePrimary}
            onRemoveUnionTable={(db, t) => onRemoveUnionTable?.(db, t)}
            onRemoveJoinedTable={onToggleJoinedTable}
          />
        </>
      ) : (
        <>
          {/* Primary table selector (CSV, Kaggle, Hive Parquet, …) */}
          {/* For Hive Parquet: once primary is set, this becomes "Add Partition" selector */}
          <FilterableSelect
            label={connectionType === 'hive_parquet' 
              ? (selectedTable ? 'Add' : 'Partition') 
              : 'Table'}
            placeholder={connectionType === 'hive_parquet' 
              ? (selectedTable ? 'Add partition (UNION)' : 'Select Partition') 
              : 'Search Table'}
            options={connectionType === 'hive_parquet' 
              ? tableOptions.filter(t => t !== selectedTable && !unionTables.some(ut => ut.table_name === t))
              : tableOptions}
            value={connectionType === 'hive_parquet' && selectedTable ? '' : selectedTable}
            onChange={(value) => {
              // Strip checkmark indicator if present (for Hive Parquet)
              const cleanValue = value.replace(' ✓', '');
              effectiveTableSelect(cleanValue);
            }}
            loading={isLoadingMetadata || isLoadingPartition}
            disabled={tables.length === 0 || isLoadingPartition}
            allowEmpty
          />

          {connectionType === 'hive_parquet' && isLoadingPartition && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.75,
                mt: 0.5,
                py: 0.5,
                px: 0.75,
                bgcolor: 'action.hover',
                borderRadius: 1,
                border: '1px solid',
                borderColor: 'divider',
              }}
            >
              <CircularProgress size={14} />
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Uploading partition files…
              </Typography>
            </Box>
          )}

          {/* Show selected tables list for Hive Parquet when primary is set */}
          {connectionType === 'hive_parquet' && selectedTable && (
            <SelectedTablesList
              primaryDatabase=""
              primaryTable={selectedTable}
              unionTables={unionTables}
              joinedTables={joinedTables}
              availableFields={availableFields}
              onRemovePrimary={handleRemovePrimary}
              onRemoveUnionTable={(db, t) => onRemoveUnionTable?.(db, t)}
              onRemoveJoinedTable={onToggleJoinedTable}
            />
          )}

          {/* UNION picker for CSV only — Hive Parquet uses the main dropdown for adding */}
          {connectionType === 'csv' && showUnionPicker && (
            <>
              <Box className={styles.field} sx={{ mt: 0.25 }}>
                <Typography variant="subtitle2" sx={sourcePickerFieldLabelSx}>
                  Union
                </Typography>
                <Box sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Autocomplete
                      disablePortal
                      size="small"
                      value={csvStagedTable || null}
                      options={csvUnionableOptions}
                      onChange={(_, v) => setCsvStagedTable(v ?? '')}
                      autoHighlight
                      isOptionEqualToValue={(o, v) => o === v}
                      className={compactAutocompleteClassName}
                      ListboxProps={compactAutocompleteListboxProps}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          placeholder="Add table (UNION ALL)"
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
                      noOptionsText="No more tables"
                    />
                  </Box>
                  <Tooltip title={csvStagedTable ? 'Add as UNION ALL' : 'Select a table first'} placement="right">
                    <span>
                      <IconButton
                        size="small"
                        onClick={handleCsvAdd}
                        disabled={!csvStagedTable}
                        sx={{ width: 26, height: 26, p: 0.25 }}
                        aria-label="Add table as UNION ALL"
                      >
                        <AddIcon sx={{ fontSize: 18 }} />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Box>
              </Box>

              {/* Show selected tables list when there are union tables */}
              {(unionTables.length > 0) && (
                <SelectedTablesList
                  primaryDatabase=""
                  primaryTable={selectedTable}
                  unionTables={unionTables}
                  joinedTables={joinedTables}
                  availableFields={availableFields}
                  onRemovePrimary={handleRemovePrimary}
                  onRemoveUnionTable={(db, t) => onRemoveUnionTable?.(db, t)}
                  onRemoveJoinedTable={onToggleJoinedTable}
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
