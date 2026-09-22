// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { Box, Chip, CircularProgress, Fade, Typography, TextField, IconButton, Tooltip, Collapse } from '@mui/material';
import Autocomplete from '@mui/material/Autocomplete';
import RefreshIcon from '@mui/icons-material/Refresh';
import AddIcon from '@mui/icons-material/Add';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd';
import DatasetIcon from '@mui/icons-material/Dataset';
import TuneIcon from '@mui/icons-material/Tune';
import { Database, Table, Field } from '../../../types';
import { DatabaseMirrorPlan, UnionTableRef } from '../../../utils/schemaValidation';
import JoinTableSelector from './JoinTableSelector';
import ClickHousePatternDialog from './ClickHousePatternDialog';
import TableAddPicker from './TableAddPicker';
import SelectedTablesList from './SelectedTablesList';
import SectionHeader from '../Properties/SectionHeader';
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
      {/*
        No `disablePortal`: the Data Source card clips to its radius with
        `overflow: hidden`, so an in-tree popup is cut off at the card's bottom
        edge — the open list looked hidden behind the Fields card below it.
        Portaling to the body lets it overlay the panel. The listbox styles are
        global for the same reason (CompactAutocomplete.module.css).
      */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Autocomplete
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
  /** Batched: bulk adds must not dispatch once per table. */
  onAddUnionTables?: (tables: UnionTableRef[]) => void;
  onRemoveUnionTables?: (tables: UnionTableRef[]) => void;
  tablesCache?: Record<string, Table[]>;  // Cache of tables by database
  onLoadTablesForDatabase?: (database: string) => void;  // Load tables for a specific database
  // Hive Parquet partition loading
  loadedPartitions?: Set<string>;  // Partitions that have been loaded
  isLoadingPartition?: boolean;
  onLoadPartition?: (partitionName: string, setAsPrimary?: boolean) => Promise<void>;
  // Add files to existing CSV/Parquet connection
  onAddFiles?: (files: File[]) => Promise<void>;
  // DB-row actions (ClickHouse)
  onDatabaseSwitch?: (database: string) => void;
  isSwitchingDatabase?: boolean;
}

const DATA_SOURCE_EXPANDED_KEY = 'fieldsPanel.dataSource.expanded';

/** How long the "could not add these" badge stays up. */
const SKIP_NOTICE_MS = 6000;

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
  onAddUnionTables,
  onRemoveUnionTables,
  tablesCache = {},
  onLoadTablesForDatabase,
  loadedPartitions = new Set(),
  isLoadingPartition = false,
  onLoadPartition,
  onAddFiles,
  onDatabaseSwitch,
  isSwitchingDatabase,
}) => {
  const addFilesInputRef = React.useRef<HTMLInputElement>(null);
  const [isPatternDialogOpen, setIsPatternDialogOpen] = React.useState(false);
  const [relationshipEditorOpen, setRelationshipEditorOpen] = React.useState(false);
  const [expanded, setExpanded] = React.useState(() => {
    const stored = localStorage.getItem(DATA_SOURCE_EXPANDED_KEY);
    return stored === null ? true : stored === 'true';
  });

  React.useEffect(() => {
    localStorage.setItem(DATA_SOURCE_EXPANDED_KEY, String(expanded));
  }, [expanded]);

  const extraTableCount = joinedTables.length + unionTables.length;
  const supportsJoins =
    connectionType === 'clickhouse' ||
    connectionType === 'kaggle' ||
    connectionType === 'sqlite';
  const collapsedHint = selectedTable
    ? `${selectedDatabase ? `${selectedDatabase}.` : ''}${selectedTable}${extraTableCount > 0 ? ` +${extraTableCount}` : ''}`
    : '';

  const handleToggleExpanded = React.useCallback(() => {
    setExpanded((current) => !current);
  }, []);

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
      const secondaries = [...resolvedTables];

      // Without a primary yet, the first match becomes it.
      if (!selectedTable) {
        const primary = secondaries.shift();
        if (!primary) return;
        onDatabaseSelect(primary.database);
        onTableSelect(primary.table_name);
      }

      if (secondaries.length === 0) return;
      // One dispatch for the whole match set — see the ADD_UNION_TABLES note in
      // the DataSource reducer.
      if (onAddUnionTables) {
        onAddUnionTables(secondaries);
        return;
      }
      secondaries.forEach((ref) => onAddUnionTable?.(ref.database, ref.table_name));
    },
    [selectedTable, onAddUnionTable, onAddUnionTables, onDatabaseSelect, onTableSelect]
  );

  /**
   * What a database add could not bring over. Tables that DID land need no
   * announcement — they appear in Selected Tables — so this is raised only
   * when something was left behind, and it clears itself.
   */
  const [skipNotice, setSkipNotice] = React.useState<
    { key: number; label: string; detail: string } | null
  >(null);

  const handleAddDatabase = React.useCallback(
    (database: string, plan: DatabaseMirrorPlan) => {
      if (plan.toAdd.length === 0) return;
      onAddUnionTables?.(plan.toAdd);

      const parts: string[] = [];
      if (plan.missing.length > 0) {
        parts.push(
          `${plan.missing.length} table${plan.missing.length === 1 ? '' : 's'} not in ${database}`,
        );
      }
      if (plan.droppedOverLimit.length > 0) {
        parts.push(`${plan.droppedOverLimit.length} over the union limit`);
      }
      setSkipNotice(
        parts.length === 0
          ? null
          : {
              // Re-notifying with identical text must restart the timer.
              key: Date.now(),
              label: parts.join(' \u00b7 '),
              detail: [...plan.missing, ...plan.droppedOverLimit.map((t) => t.table_name)].join(', '),
            },
      );
    },
    [onAddUnionTables]
  );

  const handleRemoveDatabase = React.useCallback(
    (_database: string, tables: UnionTableRef[]) => {
      if (tables.length === 0) return;
      onRemoveUnionTables?.(tables);
    },
    [onRemoveUnionTables]
  );

  // Self-dismissing: the notice reports history, not state, so it must not
  // outlive the moment. Nothing is lost if it goes unread — the tables it
  // names are simply absent from Selected Tables.
  React.useEffect(() => {
    if (!skipNotice) return;
    const timer = window.setTimeout(() => setSkipNotice(null), SKIP_NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [skipNotice]);

  // A new selection makes the old notice meaningless.
  React.useEffect(() => {
    setSkipNotice(null);
  }, [selectedDatabase, selectedTable]);

  const handleRemovePrimary = React.useCallback(() => {
    // Clear primary (this also resets JOIN/UNION in DataSourceContext via setSelectedTable)
    onTableSelect('');
  }, [onTableSelect]);

  // Sources whose tables are all in one uploaded artifact and can be UNIONed
  // by name alone (no database qualifier).
  const supportsFileStyleUnion = connectionType === 'csv' || connectionType === 'sqlite';

  // CSV/SQLite/Hive Parquet multi-table: available tables for UNION (excludes primary and already-added)
  const csvUnionableOptions = React.useMemo(() => {
    if (connectionType !== 'csv' && connectionType !== 'sqlite' && connectionType !== 'hive_parquet') return [];
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
  // For SQLite: when the database file holds more than one table
  // For Hive Parquet: when multiple partitions are loaded
  const showUnionPicker = (
    (supportsFileStyleUnion && tables.length > 1 && !!selectedTable) ||
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
      <SectionHeader
        title="Data Source"
        icon={<DatasetIcon fontSize="small" />}
        hint={collapsedHint}
        expanded={expanded}
        onToggle={handleToggleExpanded}
        controls="data-source-content"
        actions={
          <>
          {connectionType === 'csv' && onAddFiles && (
            <>
              <input
                ref={addFilesInputRef}
                type="file"
                accept=".csv,.parquet,.json,.ndjson,.jsonl"
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
          {connectionType === 'clickhouse' && (
            <Tooltip title="Add tables by pattern" placement="left">
              <IconButton
                size="small"
                aria-label="Add tables by pattern"
                onClick={() => setIsPatternDialogOpen(true)}
                sx={{ width: 20, height: 20 }}
              >
                <PlaylistAddIcon fontSize="inherit" />
              </IconButton>
            </Tooltip>
          )}
          {supportsJoins && selectedTable && onToggleJoinedTable && (
            <Tooltip title="Manage relationships" placement="left">
              <IconButton
                size="small"
                aria-label="Manage relationships"
                onClick={() => setRelationshipEditorOpen(true)}
                sx={{ width: 20, height: 20 }}
              >
                <TuneIcon fontSize="inherit" />
              </IconButton>
            </Tooltip>
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
          </>
        }
      />

      <Collapse in={expanded} timeout={200}>
        <div id="data-source-content" className={styles.content}>

      {connectionType === 'clickhouse' ? (
        <>
          <TableAddPicker
            databases={databaseOptions}
            tablesCache={tablesCache}
            onLoadTablesForDatabase={onLoadTablesForDatabase}
            primaryDatabase={selectedDatabase}
            primaryTable={selectedTable}
            unionTables={unionTables}
            joinedTables={joinedTables}
            onAdd={handleAddTable}
            onDatabaseSwitch={onDatabaseSwitch}
            onAddDatabase={onAddUnionTables ? handleAddDatabase : undefined}
            isSwitchingDatabase={isSwitchingDatabase}
          />

          <Fade in={!!skipNotice} appear timeout={{ enter: 0, exit: 400 }} unmountOnExit>
            <Box sx={{ mt: 0.5 }}>
              <Chip
                size="small"
                variant="outlined"
                color="warning"
                role="status"
                label={skipNotice?.label ?? ''}
                title={skipNotice?.detail || undefined}
                sx={{
                  height: 18,
                  maxWidth: '100%',
                  '& .MuiChip-label': { px: 0.75, fontSize: '0.68rem' },
                }}
              />
            </Box>
          </Fade>

          <SelectedTablesList
            primaryDatabase={selectedDatabase}
            primaryTable={selectedTable}
            unionTables={unionTables}
            joinedTables={joinedTables}
            availableFields={availableFields}
            onRemovePrimary={handleRemovePrimary}
            onRemoveUnionTable={(db, t) => onRemoveUnionTable?.(db, t)}
            onRemoveJoinedTable={onToggleJoinedTable}
            onRemoveDatabase={onRemoveUnionTables ? handleRemoveDatabase : undefined}
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

          {/* UNION picker for CSV/SQLite — Hive Parquet uses the main dropdown for adding */}
          {supportsFileStyleUnion && showUnionPicker && (
            <>
              <Box className={styles.field} sx={{ mt: 0.25 }}>
                <Typography variant="subtitle2" sx={sourcePickerFieldLabelSx}>
                  Union
                </Typography>
                <Box sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Autocomplete
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
      
      {/* Show joinable tables selector (for ClickHouse, Kaggle and SQLite) */}
      {supportsJoins && selectedTable && onToggleJoinedTable && (
        <JoinTableSelector
          primaryTable={selectedTable}
          suggestedJoinableTables={suggestedJoinableTables}
          joinedTables={joinedTables}
          onToggleJoin={onToggleJoinedTable}
          editorOpen={relationshipEditorOpen}
          onEditorOpenChange={setRelationshipEditorOpen}
        />
      )}
      
      {metadataError && (
        <Typography variant="caption" className={styles.error}>
          {metadataError}
        </Typography>
      )}
        </div>
      </Collapse>

      {connectionType === 'clickhouse' && (
        <ClickHousePatternDialog
          open={isPatternDialogOpen}
          primaryDatabase={selectedDatabase}
          primaryTable={selectedTable}
          unionTables={unionTables}
          onClose={() => setIsPatternDialogOpen(false)}
          onApply={handleApplyPatternSelection}
        />
      )}
    </div>
  );
};

export default CompactMetadataSelector;
