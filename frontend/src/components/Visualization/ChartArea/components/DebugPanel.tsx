// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { Box } from '@mui/material';
import DebugView, { DebugData } from '../../DebugView';

interface DebugPanelProps {
  debugData: DebugData;
}

/**
 * Contents of the debug drawer.
 *
 * Owns no sizing. The drawer is a real `Panel` in ChartArea's vertical group,
 * so its height, its minimum, its resize gesture and its per-sheet persistence
 * come from react-resizable-panels and the shared `SplitHandle`. It previously
 * held a fixed pixel height plus its own handle, and its maximum was derived
 * from `window.innerHeight` — which had no way to know how much room the chart
 * above it actually had.
 */
const DebugPanel: React.FC<DebugPanelProps> = ({ debugData }) => (
  <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
    <Box sx={{ flex: 1, overflow: 'auto' }}>
      <DebugView debugData={debugData} />
    </Box>
  </Box>
);

export default DebugPanel;
