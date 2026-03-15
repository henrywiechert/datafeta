import React from 'react';
import { TextField, Box, IconButton, InputAdornment } from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';

interface FieldsSearchProps {
  value: string;
  onChange: (value: string) => void;
}

const FieldsSearch: React.FC<FieldsSearchProps> = ({ value, onChange }) => {
  return (
    <Box sx={{ mb: 0, p: 0, background: 'none', boxShadow: 'none' }}>
      <TextField
        size="small"
        fullWidth
        variant="standard"
        placeholder="Search fields..."
        value={value}
        onChange={e => onChange(e.target.value)}
        inputProps={{ 'aria-label': 'Search fields', style: { fontSize: '12px', padding: '1px 3px' } }}
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
      />
    </Box>
  );
};

export default FieldsSearch;
