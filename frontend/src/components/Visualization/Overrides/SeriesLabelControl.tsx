// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { useState } from 'react';
import { IconButton, Popover, SvgIcon, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material';
import { LineSeriesLabelMode } from '../../../types';
import { T } from '../../../theme/tokens';

interface SeriesLabelControlProps {
  value: LineSeriesLabelMode;
  onChange: (mode: LineSeriesLabelMode) => void;
}

const OPTIONS: { value: LineSeriesLabelMode; label: string; hint: string }[] = [
  { value: 'off', label: 'Off', hint: 'No per-line labels' },
  { value: 'end', label: 'Line end', hint: 'Label past the last point (reserves space on the axis)' },
  { value: 'endInside', label: 'Inside', hint: 'Label at the last point, inside the plot area' },
];

const LineSeriesLabelIcon: React.FC<{ fontSize?: 'inherit' | 'small' | 'medium' | 'large' }> = ({ fontSize }) => (
  <SvgIcon fontSize={fontSize} viewBox="0 0 24 24">
    <path
      d="M3 18 L8 11 L13 14 L16 7"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M18 6.5 h5 M18 10.5 h4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </SvgIcon>
);

const SeriesLabelControl: React.FC<SeriesLabelControlProps> = ({ value, onChange }) => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const popoverOpen = Boolean(anchorEl);
  const active = value !== 'off';
  const currentLabel = OPTIONS.find((option) => option.value === value)?.label ?? 'Off';

  return (
    <>
      <Tooltip
        title={active ? `Series labels · ${currentLabel}` : 'Series labels'}
        placement="top"
        arrow
        enterDelay={500}
        leaveDelay={100}
      >
        <IconButton
          size="small"
          aria-label="Series labels"
          aria-haspopup="dialog"
          aria-expanded={popoverOpen}
          onClick={(e) => setAnchorEl(e.currentTarget)}
          sx={{
            width: 28,
            height: 28,
            color: active ? 'primary.main' : 'text.secondary',
          }}
        >
          <LineSeriesLabelIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      <Popover
        open={popoverOpen}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{
          sx: {
            p: 0.75,
            width: 220,
            borderRadius: 1,
          },
        }}
      >
        <Typography
          variant="body2"
          sx={{ mb: 0.5, fontSize: '0.7rem', fontWeight: 500, color: T.textControlLabel, lineHeight: 1.3 }}
        >
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
          sx={{
            height: 24,
            '& .MuiToggleButton-root': {
              py: 0,
              px: 0.5,
              fontSize: '0.7rem',
              textTransform: 'none',
              lineHeight: 1.2,
            },
          }}
        >
          {OPTIONS.map((option) => (
            <ToggleButton key={option.value} value={option.value} sx={{ flex: 1 }}>
              {option.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <Typography
          variant="caption"
          sx={{ display: 'block', mt: 0.5, color: T.textMuted, fontSize: '0.65rem', lineHeight: 1.3 }}
        >
          {OPTIONS.find((option) => option.value === value)?.hint}
        </Typography>
      </Popover>
    </>
  );
};

export default SeriesLabelControl;
