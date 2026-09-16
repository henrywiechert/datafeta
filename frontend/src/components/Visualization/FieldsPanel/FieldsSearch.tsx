// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { TextField, Box, IconButton, InputAdornment } from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';

interface FieldsSearchProps {
  value: string;
  onChange: (value: string) => void;
  error?: boolean;
  helperText?: string;
}

const FieldsSearch: React.FC<FieldsSearchProps> = ({ value, onChange, error = false, helperText = '' }) => {
  return (
    <Box sx={{ mb: 0, p: 0, background: 'none', boxShadow: 'none' }}>
      <TextField
        size="small"
        fullWidth
        variant="standard"
        placeholder="Search fields..."
        value={value}
        onChange={e => onChange(e.target.value)}
        error={error}
        helperText={helperText}
        /*
         * `margin: 0` overrides App.css's global `input[type="text"]` rule,
         * which ships `margin-right: 10px; margin-bottom: 10px` for the
         * connector forms on the data source page. Here that margin made the
         * input's box 10px taller than the control looks, so nothing could line
         * up beside it. Overridden locally rather than in App.css, which is the
         * only thing styling those forms — see src/theme/THEMING.md.
         */
        inputProps={{
          'aria-label': 'Search fields',
          style: { fontSize: '12px', padding: '1px 3px', margin: 0 },
        }}
        InputProps={{
          disableUnderline: true,
          endAdornment: value ? (
            <InputAdornment position="end" sx={{ mr: -0.5 }}>
              <IconButton
                size="small"
                onClick={() => onChange('')}
                aria-label="Clear search"
                sx={{ p: 0.25, '& .MuiSvgIcon-root': { fontSize: 18 } }}
              >
                <CloseIcon fontSize="inherit" />
              </IconButton>
            </InputAdornment>
          ) : null,
          sx: {
            fontSize: '10px',
            height: 28,
            minHeight: 28,
            padding: 0,
            background: 'none',
          }
        }}
        FormHelperTextProps={{
          sx: {
            mx: 0,
            mt: 0.25,
            minHeight: helperText ? '1em' : 0,
          },
        }}
      />
    </Box>
  );
};

export default FieldsSearch;
