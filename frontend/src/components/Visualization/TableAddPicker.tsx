import React from 'react';
import { Box, CircularProgress, IconButton, TextField, Tooltip, Typography } from '@mui/material';
import Autocomplete from '@mui/material/Autocomplete';
import AddIcon from '@mui/icons-material/Add';
import styles from './TableAddPicker.module.css';
import compactStyles from './CompactAutocomplete.module.css';

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
    <Box className={styles.container}>
      <Typography
        variant="subtitle2"
        fontWeight="bold"
        align="left"
        fontSize="0.8rem"
        sx={{ marginBottom: 0 }}
      >
        Add Table
      </Typography>

      {/* DB row */}
      <div className={styles.grid}>
        <span className={styles.label}>DB</span>
        <Autocomplete
          disablePortal
          value={stagedDatabase || null}
          options={dbOptions}
          onChange={handleDatabaseChange}
          disabled={dbOptions.length === 0}
          isOptionEqualToValue={(option, optionValue) => option === optionValue}
          sx={{
            // Targets the internal border element specifically
            "& .MuiOutlinedInput-notchedOutline": {
              border: "none", 
            },
            // Also remove the border when the input is focused
            "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
              border: "none",
            },
            // Add your own single border to the root container if needed
            border: "1px solid rgba(0, 0, 0, 0.23)",
            borderRadius: "4px"
          }}
                  className={compactStyles.compact}
          ListboxProps={{ className: 'compactListbox' }}
          renderInput={(params) => (
            <TextField
              {...params}
              variant="outlined"
              placeholder="Search DB"
              size="small"
            />
          )}
          noOptionsText="No matches"
        />
        {/* Spacer to keep grid aligned with Table row */}
        <span className={styles.spacer} />
      </div>

      {/* Table row */}
      <div className={styles.grid}>
        <span className={styles.label}>Table</span>
        <Autocomplete
          disablePortal
          value={stagedTable || null}
          options={filteredTableOptions}
          onChange={handleTableChange}
          disabled={!stagedDatabase}
          isOptionEqualToValue={(option, optionValue) => option === optionValue}
          className={compactStyles.compact}
          ListboxProps={{ className: 'compactListbox' }}
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
          noOptionsText={isLoadingTables ? 'Loading…' : 'No matches'}
        />
        <Tooltip title={canAdd ? 'Add table' : 'Select DB and table'} placement="right">
          <span>
            <IconButton
              size="small"
              onClick={handleAdd}
              disabled={!canAdd}
              className={styles.addButton}
              aria-label="Add table"
            >
              <AddIcon />
            </IconButton>
          </span>
        </Tooltip>
      </div>
    </Box>
  );
};

export default TableAddPicker;
