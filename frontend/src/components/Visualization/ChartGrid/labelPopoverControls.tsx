// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { useMemo } from 'react';
import { Box, Button, Slider, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';

/**
 * Compact building blocks shared by the axis-label and facet-label format
 * popovers so both stay visually identical and dense.
 */

export const LABEL_POPOVER_PAPER_PROPS = { sx: { p: 1, width: 220 } };

/**
 * Popover placement pinned to where the anchor was when the popover opened.
 * Changing a label's font size or orientation resizes the label row/column,
 * which moves (or remounts) the anchor element; anchoring to the live element
 * would make the dialog jump away from the cursor mid-edit.
 */
export function useFrozenAnchorPosition(anchorEl: HTMLElement | null) {
  return useMemo(() => {
    if (!anchorEl) return undefined;
    const rect = anchorEl.getBoundingClientRect();
    return { top: rect.bottom, left: rect.left + rect.width / 2 };
  }, [anchorEl]);
}

const LABEL_FONT_SX = { fontSize: '0.7rem', fontWeight: 500, lineHeight: 1.3 } as const;

export const LabelPopoverBody: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>{children}</Box>
);

interface LabelPopoverTitleProps {
  title: string;
  scopeLabel?: string;
  /** When set, shows a small "Reset size" action that returns the label size to auto-fit. */
  onResetSize?: () => void;
}

export const LabelPopoverTitle: React.FC<LabelPopoverTitleProps> = ({ title, scopeLabel, onResetSize }) => (
  <Box>
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 600, fontSize: '0.8rem', lineHeight: 1.3 }}>
        {title}
      </Typography>
      {onResetSize && (
        <Button
          size="small"
          onClick={onResetSize}
          sx={{ minWidth: 0, py: 0, px: 0.5, fontSize: '0.65rem', textTransform: 'none', lineHeight: 1.6 }}
        >
          Reset size
        </Button>
      )}
    </Box>
    {scopeLabel && (
      <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem', lineHeight: 1.2 }}>
        {scopeLabel}
      </Typography>
    )}
  </Box>
);

interface FontSizeRowProps {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}

/** Label and slider share one row. */
export const FontSizeRow: React.FC<FontSizeRowProps> = ({ value, min, max, onChange }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 0.5 }}>
    <Typography variant="body2" sx={{ ...LABEL_FONT_SX, whiteSpace: 'nowrap', minWidth: 76 }}>
      Font Size: {value}px
    </Typography>
    <Slider
      size="small"
      value={value}
      min={min}
      max={max}
      step={1}
      onChange={(_, v) => onChange(Array.isArray(v) ? v[0] : v)}
      sx={{ py: 0.75 }}
    />
  </Box>
);

interface ToggleRowProps {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  capitalize?: boolean;
}

export const ToggleRow: React.FC<ToggleRowProps> = ({ label, value, options, onChange, capitalize }) => (
  <Box>
    <Typography variant="body2" sx={{ ...LABEL_FONT_SX, mb: 0.25 }}>
      {label}
    </Typography>
    <ToggleButtonGroup
      exclusive
      fullWidth
      size="small"
      value={value}
      onChange={(_, val) => val && onChange(val)}
      sx={{
        height: 24,
        '& .MuiToggleButton-root': {
          py: 0,
          px: 0.5,
          fontSize: '0.7rem',
          lineHeight: 1.2,
          textTransform: capitalize ? 'capitalize' : 'none',
        },
      }}
    >
      {options.map((opt) => (
        <ToggleButton key={opt.value} value={opt.value}>
          {opt.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  </Box>
);
