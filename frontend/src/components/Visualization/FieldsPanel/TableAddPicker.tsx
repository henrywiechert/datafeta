// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { Box, CircularProgress, IconButton, TextField, Tooltip, Typography } from '@mui/material';
import Autocomplete from '@mui/material/Autocomplete';
import AddIcon from '@mui/icons-material/Add';
import LibraryAddIcon from '@mui/icons-material/LibraryAdd';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import {
  DatabaseMirrorPlan,
  planDatabaseMirror,
  planDatabaseSwitch,
  UnionTableRef,
} from '../../../utils/schemaValidation';
import {
  compactAutocompleteClassName,
  compactAutocompleteListboxProps,
  sourcePickerFieldLabelSx,
} from './sourcePickerShared';

export type AddTablePayload = { database: string; table: string };

interface TableAddPickerProps {
  databases: string[];
  tablesCache: Record<string, { name: string }[] | undefined>;
  onLoadTablesForDatabase?: (database: string) => void;

  // Current primary
  primaryDatabase: string;
  primaryTable: string;

  // Current secondaries
  unionTables: UnionTableRef[];
  joinedTables?: string[];

  onAdd: (payload: AddTablePayload) => void;
  /** Keep-tables switch: repoint the current selection at the staged database. */
  onDatabaseSwitch?: (database: string) => void;
  /** Mirror the current selection from the staged database as UNION secondaries. */
  onAddDatabase?: (database: string, plan: DatabaseMirrorPlan) => void;
  isSwitchingDatabase?: boolean;
}

const actionColumnSx = { width: 32, flexShrink: 0, display: 'flex', justifyContent: 'center' } as const;
const actionButtonSx = { width: 26, height: 26, p: 0.25 } as const;

const pluraliseTables = (count: number) => `${count} table${count === 1 ? '' : 's'}`;

/** "a, b and c", truncated so a wide database cannot blow out the tooltip. */
function joinNames(names: string[], limit = 3): string {
  if (names.length <= limit) return names.join(', ');
  return `${names.slice(0, limit).join(', ')} +${names.length - limit} more`;
}

const TableAddPicker: React.FC<TableAddPickerProps> = ({
  databases,
  tablesCache,
  onLoadTablesForDatabase,
  primaryDatabase,
  primaryTable,
  unionTables,
  joinedTables = [],
  onAdd,
  onDatabaseSwitch,
  onAddDatabase,
  isSwitchingDatabase = false,
}) => {
  const [stagedDatabase, setStagedDatabase] = React.useState<string>(primaryDatabase || '');
  const [stagedTable, setStagedTable] = React.useState<string>('');

  // Keep staged DB in sync with primary DB when primary changes (but do not auto-pick a table).
  // After a switch the primary IS the staged DB; after an add the primary is unchanged, so
  // staging stays put and the add button correctly reports "already selected".
  React.useEffect(() => {
    setStagedDatabase(primaryDatabase || '');
    setStagedTable('');
  }, [primaryDatabase, primaryTable]);

  const dbOptions = React.useMemo(() => [...databases].sort(), [databases]);

  const isLoadingTables =
    !!stagedDatabase && !!onLoadTablesForDatabase && tablesCache[stagedDatabase] === undefined;

  const rawTableOptions = React.useMemo(() => {
    if (!stagedDatabase) return [];
    const cached = tablesCache[stagedDatabase] || [];
    return cached.map((t) => t.name);
  }, [stagedDatabase, tablesCache]);

  const filteredTableOptions = React.useMemo(() => {
    const options = [...rawTableOptions].sort();
    return options.filter((t) => {
      // Prevent duplicates: primary table and already-unioned tables
      if (stagedDatabase === primaryDatabase && t === primaryTable) return false;
      return !unionTables.some((ut) => ut.database === stagedDatabase && ut.table_name === t);
    });
  }, [rawTableOptions, stagedDatabase, primaryDatabase, primaryTable, unionTables]);

  // Both DB-row actions resolve their exact outcome from the cached table list
  // before the click. Table lists are stable for a session, so a plan computed
  // here cannot go stale between resolve and apply.
  const mirrorPlan = React.useMemo(
    () =>
      planDatabaseMirror({
        targetDatabase: stagedDatabase,
        primaryDatabase,
        primaryTable,
        unionTables,
        targetTableNames: rawTableOptions,
      }),
    [stagedDatabase, primaryDatabase, primaryTable, unionTables, rawTableOptions],
  );

  const switchPlan = React.useMemo(
    () =>
      planDatabaseSwitch({
        targetDatabase: stagedDatabase,
        primaryDatabase,
        primaryTable,
        joinedTables,
        unionTables,
        targetTableNames: rawTableOptions,
      }),
    [stagedDatabase, primaryDatabase, primaryTable, joinedTables, unionTables, rawTableOptions],
  );

  const canAdd = !!stagedDatabase && !!stagedTable;

  const handleDatabaseChange = (_: unknown, value: string | null) => {
    // Staging only — the DB row's buttons are the sole way to commit anything.
    const nextDb = value ?? '';
    setStagedDatabase(nextDb);
    setStagedTable('');
    if (nextDb && onLoadTablesForDatabase) onLoadTablesForDatabase(nextDb);
  };

  const handleTableChange = (_: unknown, value: string | null) => {
    setStagedTable(value ?? '');
  };

  const handleAdd = () => {
    if (!canAdd) return;
    onAdd({ database: stagedDatabase, table: stagedTable });
    setStagedTable('');
  };

  // ── DB-row action states ───────────────────────────────────────────────

  const switchDisabledReason = (): string | null => {
    if (!stagedDatabase) return 'Select a database';
    if (isLoadingTables) return 'Loading tables…';
    switch (switchPlan.blocker) {
      case 'no-primary-table':
        return 'Select a table first';
      case 'same-database':
        return 'Already using this database';
      case 'cross-database-union':
        return 'Not supported for cross-database unions';
      case 'primary-table-missing':
        return `"${primaryTable}" is not in ${stagedDatabase}`;
      default:
        return null;
    }
  };

  const addDatabaseDisabledReason = (): string | null => {
    if (!stagedDatabase) return 'Select a database';
    if (isLoadingTables) return 'Loading tables…';
    if (isSwitchingDatabase) return 'Database switch in progress';
    if (!primaryTable) return 'Select a table first';
    if (mirrorPlan.toAdd.length > 0) return null;
    if (mirrorPlan.missing.length > 0 && mirrorPlan.alreadyPresent.length === 0) {
      return `${stagedDatabase} has none of the selected tables`;
    }
    return `${stagedDatabase} adds nothing — already selected`;
  };

  const switchBlocked = switchDisabledReason();
  const addDatabaseBlocked = addDatabaseDisabledReason();

  const switchTooltip = switchBlocked
    ?? [
      `Switch to ${stagedDatabase} — keeps ${joinNames(
        [primaryTable, ...unionTables.map((ut) => ut.table_name)].filter(Boolean),
      )}`,
      switchPlan.missingJoinedTables.length > 0
        ? `· joined ${joinNames(switchPlan.missingJoinedTables)} not in ${stagedDatabase}`
        : '',
    ]
      .filter(Boolean)
      .join(' ');

  const addDatabaseTooltip = addDatabaseBlocked
    ?? [
      `Add ${pluraliseTables(mirrorPlan.toAdd.length)} from ${stagedDatabase}`,
      mirrorPlan.missing.length > 0
        ? `· ${mirrorPlan.missing.length} not in ${stagedDatabase} (${joinNames(mirrorPlan.missing)})`
        : '',
      mirrorPlan.droppedOverLimit.length > 0
        ? `· ${mirrorPlan.droppedOverLimit.length} over the union limit`
        : '',
    ]
      .filter(Boolean)
      .join(' ');

  const handleSwitch = () => {
    if (switchBlocked || !onDatabaseSwitch) return;
    onDatabaseSwitch(stagedDatabase);
  };

  const handleAddDatabase = () => {
    if (addDatabaseBlocked || !onAddDatabase) return;
    onAddDatabase(stagedDatabase, mirrorPlan);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Typography variant="subtitle2" sx={sourcePickerFieldLabelSx}>
          DB
        </Typography>
        {/* Portals its popup (no `disablePortal`) — see CompactMetadataSelector:
            the Data Source card's `overflow: hidden` would clip the open list. */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Autocomplete
            size="small"
            value={stagedDatabase || null}
            options={dbOptions}
            onChange={handleDatabaseChange}
            disabled={dbOptions.length === 0 || isSwitchingDatabase}
            autoHighlight
            isOptionEqualToValue={(option, optionValue) => option === optionValue}
            className={compactAutocompleteClassName}
            ListboxProps={compactAutocompleteListboxProps}
            renderInput={(params) => (
              <TextField {...params} placeholder="Database" size="small" />
            )}
            noOptionsText="No matches"
          />
        </Box>
        {/* Inner slot: switch. Aligns with the Table row's spacer. */}
        <Box sx={actionColumnSx}>
          {isSwitchingDatabase ? (
            <CircularProgress size={14} />
          ) : onDatabaseSwitch ? (
            <Tooltip title={switchTooltip} placement="right">
              <span>
                <IconButton
                  size="small"
                  onClick={handleSwitch}
                  disabled={!!switchBlocked}
                  aria-label="Switch to this database, keeping current tables"
                  sx={actionButtonSx}
                >
                  <SwapHorizIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </span>
            </Tooltip>
          ) : null}
        </Box>
        {/* Rightmost slot: add. Aligns with the Table row's add button. */}
        <Box sx={actionColumnSx}>
          {onAddDatabase ? (
            <Tooltip title={addDatabaseTooltip} placement="right">
              <span>
                <IconButton
                  size="small"
                  onClick={handleAddDatabase}
                  disabled={!!addDatabaseBlocked}
                  aria-label="Add matching tables from database"
                  sx={actionButtonSx}
                >
                  {isLoadingTables ? (
                    <CircularProgress size={14} />
                  ) : (
                    <LibraryAddIcon sx={{ fontSize: 18 }} />
                  )}
                </IconButton>
              </span>
            </Tooltip>
          ) : null}
        </Box>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Typography variant="subtitle2" sx={sourcePickerFieldLabelSx}>
          Table
        </Typography>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Autocomplete
            size="small"
            value={stagedTable || null}
            options={filteredTableOptions}
            onChange={handleTableChange}
            disabled={!stagedDatabase || isSwitchingDatabase}
            autoHighlight
            isOptionEqualToValue={(option, optionValue) => option === optionValue}
            className={compactAutocompleteClassName}
            ListboxProps={compactAutocompleteListboxProps}
            renderInput={(params) => (
              <TextField
                {...params}
                placeholder={stagedDatabase ? 'Search table' : 'Select DB first'}
                size="small"
                InputProps={{
                  ...params.InputProps,
                  endAdornment: (
                    <>
                      {isLoadingTables ? <CircularProgress color="inherit" size={12} /> : null}
                      {params.InputProps.endAdornment}
                    </>
                  ),
                }}
              />
            )}
            noOptionsText={isLoadingTables ? 'Loading…' : 'No matches'}
          />
        </Box>
        {/* Spacer keeping both dropdowns the same width as the two-slot DB row. */}
        <Box sx={actionColumnSx} />
        <Box sx={actionColumnSx}>
          <Tooltip title={canAdd ? 'Add table' : 'Select DB and table'} placement="right">
            <span>
              <IconButton
                size="small"
                onClick={handleAdd}
                disabled={!canAdd}
                sx={actionButtonSx}
                aria-label="Add table"
              >
                <AddIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      </Box>

    </Box>
  );
};

export default TableAddPicker;
