import React from 'react';
import { Box, Button, CircularProgress, TextField, Typography } from '@mui/material';
import Autocomplete from '@mui/material/Autocomplete';
import AddIcon from '@mui/icons-material/Add';
import styles from './TableAddPicker.module.css';

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
        fontSize="0.85rem"
        gutterBottom
        sx={{ marginBottom: 0.2 }}
      >
        Add Table
      </Typography>

      <Box className={styles.row}>
        <Typography variant="subtitle2" className={styles.label}>
          DB
        </Typography>
        <Autocomplete
          disablePortal
          size="small"
          value={stagedDatabase || null}
          options={dbOptions}
          onChange={handleDatabaseChange}
          disabled={dbOptions.length === 0}
          disableClearable={false}
          autoHighlight
          isOptionEqualToValue={(option, optionValue) => option === optionValue}
          sx={{ flexGrow: 1, '& .MuiInputBase-input': { fontSize: '0.8rem', padding: '4px 8px' } }}
          ListboxProps={{ style: { maxHeight: 240 } }}
          renderInput={(params) => (
            <TextField
              {...params}
              placeholder="Search DB"
              size="small"
              InputProps={{
                ...params.InputProps,
                endAdornment: <>{params.InputProps.endAdornment}</>,
              }}
            />
          )}
          noOptionsText="No matches"
        />
      </Box>

      <Box className={styles.row}>
        <Typography variant="subtitle2" className={styles.label}>
          Table
        </Typography>
        <Autocomplete
          disablePortal
          size="small"
          value={stagedTable || null}
          options={filteredTableOptions}
          onChange={handleTableChange}
          disabled={!stagedDatabase}
          disableClearable={false}
          autoHighlight
          isOptionEqualToValue={(option, optionValue) => option === optionValue}
          sx={{ flexGrow: 1, '& .MuiInputBase-input': { fontSize: '0.8rem', padding: '4px 8px' } }}
          ListboxProps={{ style: { maxHeight: 240 } }}
          renderInput={(params) => (
            <TextField
              {...params}
              placeholder={stagedDatabase ? 'Search Table' : 'Select DB first'}
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

      <Box className={styles.actions}>
        <Button
          size="small"
          variant="contained"
          onClick={handleAdd}
          disabled={!canAdd}
          startIcon={<AddIcon />}
        >
          Add
        </Button>
      </Box>
    </Box>
  );
};

export default TableAddPicker;


