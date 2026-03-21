import React from 'react';
import { Box, CircularProgress, IconButton, TextField, Tooltip, Typography } from '@mui/material';
import Autocomplete from '@mui/material/Autocomplete';
import AddIcon from '@mui/icons-material/Add';
import {
  compactAutocompleteClassName,
  compactAutocompleteListboxProps,
  sourcePickerFieldLabelSx,
} from './sourcePickerShared';

type UnionTableRef = { database: string; table_name: string };

export type AddTablePayload = { database: string; table: string };

interface TableAddPickerProps {
  databases: string[];
  tablesCache: Record<string, { name: string }[] | undefined>;
  onLoadTablesForDatabase?: (database: string) => void;

  // Current primary
  primaryDatabase: string;
  primaryTable: string;

  // Current union list (secondaries)
  unionTables: UnionTableRef[];

  onAdd: (payload: AddTablePayload) => void;
}

const actionColumnSx = { width: 32, flexShrink: 0, display: 'flex', justifyContent: 'center' } as const;

const TableAddPicker: React.FC<TableAddPickerProps> = ({
  databases,
  tablesCache,
  onLoadTablesForDatabase,
  primaryDatabase,
  primaryTable,
  unionTables,
  onAdd,
}) => {
  const [stagedDatabase, setStagedDatabase] = React.useState<string>(primaryDatabase || '');
  const [stagedTable, setStagedTable] = React.useState<string>('');

  // Keep staged DB in sync with primary DB when primary changes (but do not auto-pick a table)
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

  const canAdd = !!stagedDatabase && !!stagedTable;

  const handleDatabaseChange = (_: unknown, value: string | null) => {
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

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Typography variant="subtitle2" sx={sourcePickerFieldLabelSx}>
          DB
        </Typography>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Autocomplete
            disablePortal
            size="small"
            value={stagedDatabase || null}
            options={dbOptions}
            onChange={handleDatabaseChange}
            disabled={dbOptions.length === 0}
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
        <Box sx={actionColumnSx} aria-hidden />
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Typography variant="subtitle2" sx={sourcePickerFieldLabelSx}>
          Table
        </Typography>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Autocomplete
            disablePortal
            size="small"
            value={stagedTable || null}
            options={filteredTableOptions}
            onChange={handleTableChange}
            disabled={!stagedDatabase}
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
        <Box sx={actionColumnSx}>
          <Tooltip title={canAdd ? 'Add table' : 'Select DB and table'} placement="right">
            <span>
              <IconButton
                size="small"
                onClick={handleAdd}
                disabled={!canAdd}
                sx={{ width: 26, height: 26, p: 0.25 }}
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
