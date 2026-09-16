// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import { COLLAPSE_RAIL_THICKNESS_PX, PANEL_RADIUS_PX, PANEL_SURFACE } from './layoutTokens';

interface CollapseRailProps {
  label: string;
  onExpand: () => void;
  /**
   * Which side of the app the panel lives on. Decides which way the chevron
   * points (towards where the panel will appear) and which edge is bordered.
   */
  side?: 'left' | 'right';
}

/**
 * What a collapsed panel leaves behind: a rail with an expand button and a
 * rotated label.
 *
 * Every collapsible panel gets one. A panel that collapses to nothing is
 * unrecoverable without knowing its keyboard shortcut, which is how the
 * Properties panel used to behave.
 */
const CollapseRail: React.FC<CollapseRailProps> = ({ label, onExpand, side = 'left' }) => {
  const ChevronIcon = side === 'left' ? ChevronRightIcon : ChevronLeftIcon;

  return (
    <Box
      sx={{
        width: COLLAPSE_RAIL_THICKNESS_PX,
        minWidth: COLLAPSE_RAIL_THICKNESS_PX,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        backgroundColor: PANEL_SURFACE,
        // A collapsed panel is still a card: same curve, no border — the shell
        // canvas around it is the boundary.
        borderRadius: `${PANEL_RADIUS_PX}px`,
        userSelect: 'none',
        overflow: 'hidden',
      }}
    >
      <Tooltip title={`Show ${label}`} placement={side === 'left' ? 'right' : 'left'}>
        <IconButton
          size="small"
          onClick={onExpand}
          aria-label={`Show ${label}`}
          sx={{ mt: 0.5, p: 0.5, '&:hover': { backgroundColor: 'action.hover' } }}
        >
          <ChevronIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      <Box
        onClick={onExpand}
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
          '&:hover': { color: 'text.primary' },
        }}
      >
        {label}
      </Box>
    </Box>
  );
};

export default CollapseRail;
