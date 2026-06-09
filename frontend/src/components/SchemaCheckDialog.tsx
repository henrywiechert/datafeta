// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Alert,
} from '@mui/material';
import { SchemaCheckResult } from '../utils/schemaValidation';

interface SchemaCheckDialogProps {
  open: boolean;
  result: SchemaCheckResult | null;
  onClose: () => void;
}

export default function SchemaCheckDialog({
  open,
  result,
  onClose,
}: SchemaCheckDialogProps) {
  if (!result) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth aria-labelledby="schema-check-title">
      <DialogTitle id="schema-check-title">Schema check</DialogTitle>
      <DialogContent>
        {result.allClear ? (
          <Alert severity="success" sx={{ mt: 1 }}>
            All {result.totalReferencedColumns} referenced column
            {result.totalReferencedColumns === 1 ? '' : 's'} found.{' '}
            {result.sheetCount} sheet{result.sheetCount === 1 ? '' : 's'} ready.
          </Alert>
        ) : (
          <>
            {result.missingColumns.length > 0 && (
              <Typography variant="body2" sx={{ mt: 1, mb: 1 }}>
                <strong>{result.missingColumns.length} column{result.missingColumns.length === 1 ? '' : 's'} missing:</strong>{' '}
                {result.missingColumns.join(', ')}
              </Typography>
            )}
            {result.missingJoinedTables.length > 0 && (
              <Typography variant="body2" sx={{ mb: 1 }}>
                <strong>{result.missingJoinedTables.length} joined table{result.missingJoinedTables.length === 1 ? '' : 's'} missing:</strong>{' '}
                {result.missingJoinedTables.join(', ')}
              </Typography>
            )}
            <Typography variant="body2" color="text.secondary">
              Charts using these fields may be empty. Table and column names must match in the new database.
            </Typography>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="contained">
          OK
        </Button>
      </DialogActions>
    </Dialog>
  );
}
