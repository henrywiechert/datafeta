import React, { useState } from 'react';
import { TextField, Box } from '@mui/material';

interface FieldsSearchProps {
  value: string;
  onChange: (value: string) => void;
}

const FieldsSearch: React.FC<FieldsSearchProps> = ({ value, onChange }) => {
  return (
    <Box sx={{ mb: 1, p: 0, background: 'none', boxShadow: 'none' }}>
      <TextField
        size="small"
        fullWidth
        variant="standard"
        placeholder="Search fields..."
        value={value}
        onChange={e => onChange(e.target.value)}
        inputProps={{ 'aria-label': 'Search fields', style: { fontSize: '13px', padding: '4px 8px' } }}
        InputProps={{
          disableUnderline: false,
          sx: {
            fontSize: '13px',
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
