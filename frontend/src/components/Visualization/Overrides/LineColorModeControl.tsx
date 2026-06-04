// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { Box, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { LineColorMode } from '../../../types';

interface LineColorModeControlProps {
  value: LineColorMode;
  onChange: (mode: LineColorMode) => void;
}

const LineColorModeControl: React.FC<LineColorModeControlProps> = ({ value, onChange }) => (
  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
    <Typography variant="caption" color="text.secondary">
      Line color
    </Typography>
    <ToggleButtonGroup
      exclusive
      size="small"
      value={value}
      onChange={(_e, next: LineColorMode | null) => {
        if (next) onChange(next);
      }}
      fullWidth
    >
      <ToggleButton value="alongPath" sx={{ flex: 1, textTransform: 'none', fontSize: '0.7rem', py: 0.25 }}>
        Along line
      </ToggleButton>
      <ToggleButton value="bySeries" sx={{ flex: 1, textTransform: 'none', fontSize: '0.7rem', py: 0.25 }}>
        By series
      </ToggleButton>
    </ToggleButtonGroup>
  </Box>
);

export default LineColorModeControl;
