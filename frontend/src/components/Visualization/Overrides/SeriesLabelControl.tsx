// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { Box, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material';
import { LineSeriesLabelMode } from '../../../types';

interface SeriesLabelControlProps {
  value: LineSeriesLabelMode;
  onChange: (mode: LineSeriesLabelMode) => void;
}

const OPTIONS: { value: LineSeriesLabelMode; label: string; hint: string }[] = [
  { value: 'off', label: 'Off', hint: 'No per-line labels' },
  { value: 'end', label: 'Line end', hint: 'Label past the last point (reserves space on the axis)' },
  { value: 'endInside', label: 'Inside', hint: 'Label at the last point, inside the plot area' },
];

const SeriesLabelControl: React.FC<SeriesLabelControlProps> = ({ value, onChange }) => (
  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
    <Typography variant="caption" color="text.secondary">
      Series labels
    </Typography>
    <ToggleButtonGroup
      exclusive
      size="small"
      value={value}
      onChange={(_e, next: LineSeriesLabelMode | null) => {
        if (next) onChange(next);
      }}
      fullWidth
    >
      {OPTIONS.map((option) => (
        <Tooltip key={option.value} title={option.hint} placement="top" arrow enterDelay={500}>
          <ToggleButton
            value={option.value}
            sx={{ flex: 1, textTransform: 'none', fontSize: '0.7rem', py: 0.25 }}
          >
            {option.label}
          </ToggleButton>
        </Tooltip>
      ))}
    </ToggleButtonGroup>
  </Box>
);

export default SeriesLabelControl;
