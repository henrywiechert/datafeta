import React, { useState } from 'react';
import { TextField, Box } from '@mui/material';

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
