// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { Box, IconButton, Tooltip, Typography } from '@mui/material';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import AppInfoDisplay from './AppInfoDisplay';
import DataSlicerIcon from './icons/DataSlicerIcon';
import { PANEL_HEADER_SURFACE, PANEL_RADIUS_PX } from './Layout/layoutTokens';

interface AppBrandHeaderProps {
  /** File operations menu (new / save / load / export). */
  fileMenu?: React.ReactNode;
}

/**
 * Left-column brand card: DataSlicer badge on the left, file menu plus
 * help / about on the right.
 */
export default function AppBrandHeader({ fileMenu }: AppBrandHeaderProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        px: 1.5,
        py: 0.5,
        backgroundColor: PANEL_HEADER_SURFACE,
        borderRadius: `${PANEL_RADIUS_PX}px`,
        overflow: 'hidden',
        flexShrink: 0,
        gap: 0.5,
        minWidth: 0,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          fontSize: '0.9rem',
          fontWeight: 700,
          letterSpacing: '0.02em',
          color: 'text.primary',
          minWidth: 0,
          flex: '1 1 auto',
          overflow: 'hidden',
        }}
      >
        <DataSlicerIcon sx={{ fontSize: '1.6rem', flexShrink: 0 }} />
        <Typography
          component="span"
          noWrap
          sx={{
            fontSize: 'inherit',
            fontWeight: 'inherit',
            letterSpacing: 'inherit',
            color: 'inherit',
            minWidth: 0,
          }}
        >
          DataSlicer
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        {fileMenu}
        <Tooltip title="Open User Manual">
          <IconButton
            size="small"
            onClick={() => window.open('/help/', '_blank', 'noopener,noreferrer')}
            sx={{ color: 'text.secondary' }}
          >
            <HelpOutlineIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <AppInfoDisplay />
      </Box>
    </Box>
  );
}
