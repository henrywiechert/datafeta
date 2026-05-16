// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { useState, useEffect, useRef } from 'react';
import {
  Popover,
  TextField,
  Box,
  Typography,
  IconButton,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { Field } from '../../../types';
import { useDataSource } from '../../../contexts/DataSourceContext';

interface FieldAliasDialogProps {
  anchorEl: HTMLElement | null;
  field: Field | null;
  onConfirm: (alias: string | undefined) => void;
  onClose: () => void;
}

/**
 * Popover for setting a display alias for a field.
 * Aliases only affect UI display - the original columnName is preserved for SQL queries.
 */
export const FieldAliasDialog: React.FC<FieldAliasDialogProps> = ({
  anchorEl,
  field,
  onConfirm,
  onClose,
}) => {
  const [alias, setAlias] = useState('');
  const { dataSource } = useDataSource();
  const inputRef = useRef<HTMLInputElement>(null);
  const initialAliasRef = useRef<string>('');
  const open = Boolean(anchorEl);

  useEffect(() => {
    if (field && open) {
      // Look up alias from context first (authoritative source), then fall back to field property
      const currentAlias = dataSource.fieldDisplayAliases[field.columnName] ?? field.displayAlias ?? '';
      setAlias(currentAlias);
      initialAliasRef.current = currentAlias;
      // Focus the input after a brief delay to ensure popover is rendered
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [field, open, dataSource.fieldDisplayAliases]);

  const handleConfirm = () => {
    // Trim whitespace and treat empty as clearing the alias
    const trimmedAlias = alias.trim();
    const newValue = trimmedAlias || undefined;
    const oldValue = initialAliasRef.current || undefined;
    
    // Only call onConfirm if the value actually changed
    if (newValue !== oldValue) {
      onConfirm(newValue);
    } else {
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirm();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!field) return null;

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{
        vertical: 'bottom',
        horizontal: 'left',
      }}
      transformOrigin={{
        vertical: 'top',
        horizontal: 'left',
      }}
      disablePortal
      slotProps={{
        paper: {
          sx: { p: 1.5, minWidth: 280 }
        }
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography variant="body2" color="text.secondary">
          <strong>{field.columnName}</strong>
        </Typography>
        <IconButton size="small" onClick={onClose} sx={{ ml: 1, p: 0.25 }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>
      <TextField
        inputRef={inputRef}
        size="small"
        fullWidth
        placeholder="Display name"
        value={alias}
        onChange={(e) => setAlias(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleConfirm}
        sx={{ 
          '& .MuiInputBase-input': { 
            fontSize: '0.875rem',
            py: 0.75,
          }
        }}
      />
    </Popover>
  );
};
