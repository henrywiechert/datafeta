// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type {
  ClickHousePatternPreviewResponse,
  PatternMode,
  TableReference,
} from '../../../types';
import { metadataApi } from '../../../services/api/metadataApi';

interface ClickHousePatternDialogProps {
  open: boolean;
  primaryDatabase: string;
  primaryTable: string;
  unionTables: TableReference[];
  onClose: () => void;
  onApply: (resolvedTables: TableReference[]) => void;
}

const DEFAULT_LIMITS = {
  max_databases: 25,
  max_total_matches: 100,
  max_tables_per_database: 20,
} as const;

const compactPatternFieldSx = {
  '& .MuiInputLabel-root': { fontSize: '0.75rem' },
  '& .MuiInputBase-input': { fontSize: '0.75rem', py: 0.5 },
} as const;

const compactCheckboxLabelSx = {
  mx: 0,
  '& .MuiFormControlLabel-label': { fontSize: '0.75rem' },
} as const;

const tableKey = (database: string, tableName: string) => `${database}\u0000${tableName}`;

function ClickHousePatternDialog({
  open,
  primaryDatabase,
  primaryTable,
  unionTables,
  onClose,
  onApply,
}: ClickHousePatternDialogProps) {
  const [patternMode, setPatternMode] = React.useState<PatternMode>('regex');
  const [databasePattern, setDatabasePattern] = React.useState('');
  const [tablePattern, setTablePattern] = React.useState('');
  const [preview, setPreview] = React.useState<ClickHousePatternPreviewResponse | null>(null);
  const [selectedKeys, setSelectedKeys] = React.useState<Set<string>>(() => new Set());
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setPreview(null);
      setError(null);
      return;
    }

    const trimmedDatabasePattern = databasePattern.trim();
    const trimmedTablePattern = tablePattern.trim();
    if (!trimmedDatabasePattern || !trimmedTablePattern) {
      setPreview(null);
      setError(null);
      return;
    }

    const abortController = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await metadataApi.previewClickHousePatternTables(
          {
            database_pattern: trimmedDatabasePattern,
            table_pattern: trimmedTablePattern,
            pattern_mode: patternMode,
            current_primary: primaryTable
              ? { database: primaryDatabase, table_name: primaryTable }
              : undefined,
            existing_union_tables: unionTables,
            ...DEFAULT_LIMITS,
          },
          abortController.signal
        );
        setPreview(response);
      } catch (previewError: any) {
        if (previewError?.message === 'Request was cancelled') {
          return;
        }
        setPreview(null);
        setError(previewError?.message || 'Preview failed');
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => {
      abortController.abort();
      window.clearTimeout(timeoutId);
    };
  }, [open, databasePattern, tablePattern, patternMode, primaryDatabase, primaryTable, unionTables]);

  // Each new preview starts fully ticked; the user narrows it down from there.
  React.useEffect(() => {
    setSelectedKeys(
      new Set(
        (preview?.resolved_tables ?? []).map((table) => tableKey(table.database, table.table_name))
      )
    );
  }, [preview]);

  // Matches that are already the primary or a union table cannot be picked again.
  const excludedKeys = React.useMemo(
    () =>
      new Set(
        (preview?.excluded_existing ?? []).map((table) => tableKey(table.database, table.table_name))
      ),
    [preview]
  );

  const selectedTables = React.useMemo(
    () =>
      (preview?.resolved_tables ?? []).filter((table) =>
        selectedKeys.has(tableKey(table.database, table.table_name))
      ),
    [preview, selectedKeys]
  );

  const toggleTable = (database: string, tableName: string) => {
    const key = tableKey(database, tableName);
    setSelectedKeys((previous) => {
      const next = new Set(previous);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const toggleDatabase = (database: string, tableNames: string[], shouldSelect: boolean) => {
    setSelectedKeys((previous) => {
      const next = new Set(previous);
      tableNames.forEach((tableName) => {
        const key = tableKey(database, tableName);
        if (shouldSelect) {
          next.add(key);
        } else {
          next.delete(key);
        }
      });
      return next;
    });
  };

  const setAllSelected = (shouldSelect: boolean) => {
    setSelectedKeys(
      shouldSelect
        ? new Set(
            (preview?.resolved_tables ?? []).map((table) =>
              tableKey(table.database, table.table_name)
            )
          )
        : new Set()
    );
  };

  const selectionSummary = React.useMemo(() => {
    if (!preview) return null;
    const primaryLabel = primaryTable
      ? `${primaryDatabase}.${primaryTable}`
      : selectedTables[0]
        ? `${selectedTables[0].database}.${selectedTables[0].table_name}`
        : null;

    return {
      primaryLabel,
      selectedCount: selectedTables.length,
      selectableCount: preview.resolved_tables.length,
      excludedCount: preview.excluded_existing.length,
    };
  }, [preview, selectedTables, primaryDatabase, primaryTable]);

  const handleApply = () => {
    if (selectedTables.length === 0) return;
    onApply(selectedTables);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      PaperProps={{ sx: { maxWidth: 520 } }}
    >
      <DialogTitle>Add Tables By Pattern</DialogTitle>
      <DialogContent>
        <Stack spacing={1}>
          <FormControl>
            <RadioGroup
              row
              value={patternMode}
              onChange={(event) => setPatternMode(event.target.value as PatternMode)}
              sx={{ gap: 1 }}
            >
              <FormControlLabel
                value="regex"
                control={<Radio size="small" />}
                label="Regex"
                sx={{ mx: 0, '& .MuiFormControlLabel-label': { fontSize: '0.75rem' } }}
              />
              <FormControlLabel
                value="wildcard"
                control={<Radio size="small" />}
                label="Wildcard"
                sx={{ mx: 0, '& .MuiFormControlLabel-label': { fontSize: '0.75rem' } }}
              />
            </RadioGroup>
          </FormControl>

          <TextField
            label="DB Pattern"
            value={databasePattern}
            onChange={(event) => setDatabasePattern(event.target.value)}
            placeholder={patternMode === 'regex' ? '^sales_202[45]$' : 'sales_*'}
            size="small"
            variant="standard"
            sx={compactPatternFieldSx}
            fullWidth
          />

          <TextField
            label="Table Pattern"
            value={tablePattern}
            onChange={(event) => setTablePattern(event.target.value)}
            placeholder={patternMode === 'regex' ? '^orders(_daily)?$' : 'orders*'}
            size="small"
            variant="standard"
            sx={compactPatternFieldSx}
            fullWidth
          />

          <Typography variant="caption" color="text.secondary">
            Preview updates automatically. Tick the tables to add; matches already selected as primary or union tables cannot be picked again.
          </Typography>

          {error ? <Alert severity="error">{error}</Alert> : null}

          {selectionSummary ? (
            <Alert severity="info">
              {selectionSummary.primaryLabel
                ? `Primary after apply: ${selectionSummary.primaryLabel}`
                : 'No primary will be selected until at least one table is ticked.'}{' '}
              {selectionSummary.selectedCount} of {selectionSummary.selectableCount} table
              {selectionSummary.selectableCount === 1 ? '' : 's'} selected.
              {selectionSummary.excludedCount > 0
                ? ` ${selectionSummary.excludedCount} existing selection${selectionSummary.excludedCount === 1 ? '' : 's'} excluded.`
                : ''}
            </Alert>
          ) : null}

          {preview?.warnings.map((warning) => (
            <Alert key={warning} severity="warning">
              {warning}
            </Alert>
          ))}

          {!isLoading && preview && preview.resolved_tables.length > 0 ? (
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              <Button
                size="small"
                onClick={() => setAllSelected(true)}
                disabled={selectedTables.length === preview.resolved_tables.length}
                sx={{ fontSize: '0.7rem', minWidth: 0 }}
              >
                Select all
              </Button>
              <Button
                size="small"
                onClick={() => setAllSelected(false)}
                disabled={selectedTables.length === 0}
                sx={{ fontSize: '0.7rem', minWidth: 0 }}
              >
                Clear
              </Button>
            </Box>
          ) : null}

          <Box
            sx={{
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 1,
              minHeight: 120,
              maxHeight: 240,
              overflowY: 'auto',
              p: 1,
            }}
          >
            {isLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                <CircularProgress size={20} />
              </Box>
            ) : null}

            {!isLoading && !preview && !error ? (
              <Typography variant="body2" color="text.secondary">
                Enter both patterns to preview matching database and table combinations.
              </Typography>
            ) : null}

            {!isLoading && preview?.matches.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No matches found.
              </Typography>
            ) : null}

            {!isLoading && preview?.matches.map((match) => {
              const selectableTables = match.tables.filter(
                (tableName) => !excludedKeys.has(tableKey(match.database, tableName))
              );
              const selectedInDatabase = selectableTables.filter((tableName) =>
                selectedKeys.has(tableKey(match.database, tableName))
              ).length;
              const allSelected =
                selectableTables.length > 0 && selectedInDatabase === selectableTables.length;

              return (
                <Box key={match.database} sx={{ mb: 1 }}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        size="small"
                        checked={allSelected}
                        indeterminate={selectedInDatabase > 0 && !allSelected}
                        disabled={selectableTables.length === 0}
                        onChange={() => toggleDatabase(match.database, selectableTables, !allSelected)}
                        sx={{ py: 0.25 }}
                      />
                    }
                    label={match.database}
                    sx={{
                      mx: 0,
                      '& .MuiFormControlLabel-label': { fontSize: '0.75rem', fontWeight: 600 },
                    }}
                  />
                  <Stack sx={{ pl: 3 }}>
                    {match.tables.map((tableName) => {
                      const key = tableKey(match.database, tableName);
                      const isExcluded = excludedKeys.has(key);

                      return (
                        <FormControlLabel
                          key={key}
                          control={
                            <Checkbox
                              size="small"
                              checked={isExcluded || selectedKeys.has(key)}
                              disabled={isExcluded}
                              onChange={() => toggleTable(match.database, tableName)}
                              sx={{ py: 0.25 }}
                            />
                          }
                          label={isExcluded ? `${tableName} (already added)` : tableName}
                          sx={compactCheckboxLabelSx}
                        />
                      );
                    })}
                  </Stack>
                </Box>
              );
            })}
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button size="small" onClick={onClose}>Cancel</Button>
        <Button
          size="small"
          onClick={handleApply}
          variant="outlined"
          disabled={selectedTables.length === 0}
        >
          {selectedTables.length > 0
            ? `Add ${selectedTables.length} Table${selectedTables.length === 1 ? '' : 's'}`
            : 'Add Tables'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default ClickHousePatternDialog;
