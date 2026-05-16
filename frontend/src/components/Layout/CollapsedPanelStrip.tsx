// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

interface CollapsedPanelStripProps {
  label: string;
  onExpand: () => void;
  tooltipPlacement?: 'left' | 'right';
}

/**
 * A thin vertical strip shown when a panel is collapsed.
 * Displays a rotated label and an expand button.
 */
const CollapsedPanelStrip: React.FC<CollapsedPanelStripProps> = ({
  label,
  onExpand,
  tooltipPlacement = 'right',
}) => {
  return (
    <Box
      sx={{
        width: 28,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        backgroundColor: '#f5f5f5',
        borderRight: '1px solid',
        borderColor: 'divider',
        userSelect: 'none',
      }}
    >
      {/* Expand button at top */}
      <Tooltip title={`Show ${label}`} placement={tooltipPlacement}>
        <IconButton
          size="small"
          onClick={onExpand}
          sx={{
            mt: 0.5,
            p: 0.5,
            '&:hover': {
              backgroundColor: 'action.hover',
            },
          }}
        >
          <ChevronRightIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      {/* Rotated label */}
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          writingMode: 'vertical-rl',
          textOrientation: 'mixed',
          transform: 'rotate(180deg)',
          fontSize: '0.75rem',
          fontWeight: 500,
          color: 'text.secondary',
          letterSpacing: '0.05em',
          cursor: 'pointer',
          '&:hover': {
            color: 'text.primary',
          },
        }}
        onClick={onExpand}
      >
        {label}
      </Box>
    </Box>
  );
};

export default CollapsedPanelStrip;
