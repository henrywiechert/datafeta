import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
} from '@mui/material';
import { Field } from '../../../types';
import { useDataSource } from '../../../contexts/DataSourceContext';

interface FieldAliasDialogProps {
  open: boolean;
  field: Field | null;
  onConfirm: (alias: string | undefined) => void;
  onCancel: () => void;
}

/**
 * Dialog for setting a display alias for a field.
 * Aliases only affect UI display - the original columnName is preserved for SQL queries.
 */
export const FieldAliasDialog: React.FC<FieldAliasDialogProps> = ({
  open,
  field,
  onConfirm,
  onCancel,
}) => {
  const [alias, setAlias] = useState('');
  const { dataSource } = useDataSource();

  useEffect(() => {
    if (field) {
      // Look up alias from context first (authoritative source), then fall back to field property
      const currentAlias = dataSource.fieldDisplayAliases[field.columnName] ?? field.displayAlias ?? '';
      setAlias(currentAlias);
    }
  }, [field, dataSource.fieldDisplayAliases]);

  const handleConfirm = () => {
    // Trim whitespace and treat empty as clearing the alias
    const trimmedAlias = alias.trim();
    onConfirm(trimmedAlias || undefined);
  };

  const handleClear = () => {
    onConfirm(undefined);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirm();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  if (!field) return null;

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      maxWidth="sm"
      fullWidth
      onClick={(e) => e.stopPropagation()}
    >
      <DialogTitle>Rename Field</DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Original column name: <strong>{field.columnName}</strong>
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Enter a custom display name for this field. This will appear in field chips,
            charts, tooltips, and legends. The original column name will still be used
            for SQL queries.
          </Typography>
          <TextField
            autoFocus
            fullWidth
            label="Display Name"
            placeholder={field.columnName}
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            onKeyDown={handleKeyDown}
            helperText="Leave empty to use the original column name"
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        {field.displayAlias && (
          <Button onClick={handleClear} color="warning">
            Clear
          </Button>
        )}
        <Button onClick={handleConfirm} variant="contained">
          Confirm
        </Button>
      </DialogActions>
    </Dialog>
  );
};
