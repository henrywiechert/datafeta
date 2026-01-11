import React from 'react';
import { Box, CircularProgress, IconButton, TextField, Tooltip, SxProps, Theme } from '@mui/material';
import Autocomplete from '@mui/material/Autocomplete';
import AddIcon from '@mui/icons-material/Add';

// Shared styles for compact Autocomplete dropdowns
const autocompleteListboxSx = {
  padding: '2px 0',
  '& .MuiAutocomplete-option': {
    fontSize: '0.9rem',
    padding: '1px 8px',
    lineHeight: 1.2,
  },
};

const autocompleteSx: SxProps<Theme> = {
  '& .MuiInputBase-root': {
    fontSize: '0.9rem',
    height: 30,
  },
  '& .MuiOutlinedInput-input': {
    padding: '4px 4px !important',
    border: 'grey solid 1px',
  },
  '& .MuiOutlinedInput-notchedOutline': {
    padding: '0 0px',   // key fix
    visibility: 'hidden',
  },
};

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
      {/* DB row */}
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 32px', gap: 0.5, alignItems: 'center' }}>
        <Autocomplete
          disablePortal
          value={stagedDatabase || null}
          options={dbOptions}
          onChange={handleDatabaseChange}
          disabled={dbOptions.length === 0}
          isOptionEqualToValue={(option, optionValue) => option === optionValue}
          renderInput={(params) => (
            <TextField
              {...params}
            />
          )}
          ListboxProps={{ sx: autocompleteListboxSx }}
          sx={autocompleteSx}
          noOptionsText="No matches"
        />
        {/* Spacer to keep grid aligned with Table row */}
        <span />
      </Box>

      {/* Table row */}
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 32px', gap: 0.5, alignItems: 'center' }}>
        <Autocomplete
          disablePortal
          value={stagedTable || null}
          options={filteredTableOptions}
          onChange={handleTableChange}
          disabled={!stagedDatabase}
          isOptionEqualToValue={(option, optionValue) => option === optionValue}
          renderInput={(params) => (
            <TextField
              {...params}
              placeholder={stagedDatabase ? 'Search Table' : 'Select DB first'}
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
          ListboxProps={{ sx: autocompleteListboxSx }}
          sx={autocompleteSx}
          noOptionsText={isLoadingTables ? 'Loading…' : 'No matches'}
        />
        <Tooltip title={canAdd ? 'Add table' : 'Select DB and table'} placement="right">
          <span>
            <IconButton
              size="small"
              onClick={handleAdd}
              disabled={!canAdd}
              sx={{ width: 28, height: 28 }}
              aria-label="Add table"
            >
              <AddIcon />
            </IconButton>
          </span>
        </Tooltip>
      </Box>
    </Box>
  );
};

export default TableAddPicker;
