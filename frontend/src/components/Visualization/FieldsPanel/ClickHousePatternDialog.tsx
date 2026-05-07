import React from 'react';
import {
  Alert,
  Box,
  Button,
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

  const selectionSummary = React.useMemo(() => {
    if (!preview) return null;
    const primaryLabel = primaryTable
      ? `${primaryDatabase}.${primaryTable}`
      : preview.resolved_tables[0]
        ? `${preview.resolved_tables[0].database}.${preview.resolved_tables[0].table_name}`
        : null;

    return {
      primaryLabel,
      resolvedCount: preview.resolved_tables.length,
      excludedCount: preview.excluded_existing.length,
    };
  }, [preview, primaryDatabase, primaryTable]);

  const handleApply = () => {
    if (!preview || preview.resolved_tables.length === 0) return;
    onApply(preview.resolved_tables);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Add Tables By Pattern</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          <FormControl>
            <RadioGroup
              row
              value={patternMode}
              onChange={(event) => setPatternMode(event.target.value as PatternMode)}
            >
              <FormControlLabel value="regex" control={<Radio size="small" />} label="Regex" />
              <FormControlLabel value="wildcard" control={<Radio size="small" />} label="Wildcard" />
            </RadioGroup>
          </FormControl>

          <TextField
            label="DB Pattern"
            value={databasePattern}
            onChange={(event) => setDatabasePattern(event.target.value)}
            placeholder={patternMode === 'regex' ? '^sales_202[45]$' : 'sales_*'}
            size="small"
            fullWidth
          />

          <TextField
            label="Table Pattern"
            value={tablePattern}
            onChange={(event) => setTablePattern(event.target.value)}
            placeholder={patternMode === 'regex' ? '^orders(_daily)?$' : 'orders*'}
            size="small"
            fullWidth
          />

          <Typography variant="caption" color="text.secondary">
            Preview updates automatically. Matches already selected as primary or union tables are excluded from apply.
          </Typography>

          {error ? <Alert severity="error">{error}</Alert> : null}

          {selectionSummary ? (
            <Alert severity="info">
              {selectionSummary.primaryLabel
                ? `Primary after apply: ${selectionSummary.primaryLabel}`
                : 'No primary will be selected until at least one match is resolved.'}{' '}
              {selectionSummary.resolvedCount} table{selectionSummary.resolvedCount === 1 ? '' : 's'} ready to add.
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

          <Box
            sx={{
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 1,
              minHeight: 180,
              maxHeight: 320,
              overflowY: 'auto',
              p: 1.5,
            }}
          >
            {isLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
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

            {!isLoading && preview?.matches.map((match) => (
              <Box key={match.database} sx={{ mb: 1.5 }}>
                <Typography variant="subtitle2">{match.database}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {match.tables.join(', ')}
                </Typography>
              </Box>
            ))}
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleApply} variant="contained" disabled={!preview || preview.resolved_tables.length === 0}>
          Apply Matches
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default ClickHousePatternDialog;