// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { Box, Typography } from '@mui/material';
import ScreenRotationIcon from '@mui/icons-material/ScreenRotation';
import { T } from '../theme/tokens';

/**
 * Full-screen blocker shown when tablet UI is active in portrait. There is no
 * portrait layout — the user must rotate to landscape.
 */
const TabletRotateOverlay: React.FC = () => (
  <Box
    role="dialog"
    aria-modal="true"
    aria-label="Rotate device to landscape"
    sx={{
      position: 'fixed',
      inset: 0,
      zIndex: 2000,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      px: 3,
      backgroundColor: T.surfaceShell,
      color: 'text.primary',
      textAlign: 'center',
    }}
  >
    <ScreenRotationIcon sx={{ fontSize: 64, color: 'text.secondary' }} />
    <Typography variant="h6" component="p" sx={{ m: 0, maxWidth: 320 }}>
      Rotate your device to landscape to use DataSlicer.
    </Typography>
  </Box>
);

export default TabletRotateOverlay;
