// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { useCallback } from 'react';
import { Box } from '@mui/material';
import SplitHandle from '../../../Layout/SplitHandle';
import { SplitBounds } from '../../../Layout/useSplitDrag';
import DebugView, { DebugData } from '../../DebugView';

const MIN_DEBUG_HEIGHT_PX = 150;

interface DebugPanelProps {
  isDebugOpen: boolean;
  debugHeight: number;
  maxDebugHeight: number;
  onDebugResize: (newHeight: number) => void;
  debugData: DebugData;
}

const DebugPanel: React.FC<DebugPanelProps> = ({
  isDebugOpen,
  debugHeight,
  maxDebugHeight,
  onDebugResize,
  debugData,
}) => {
  const getBounds = useCallback((): SplitBounds => ({
    currentPx: debugHeight,
    minPx: MIN_DEBUG_HEIGHT_PX,
    maxPx: maxDebugHeight,
  }), [debugHeight, maxDebugHeight]);

  const handleCommit = useCallback((height: number) => {
    onDebugResize(Math.round(height));
  }, [onDebugResize]);

  if (!isDebugOpen) return null;

  return (
    <Box sx={{
      mt: 1,
      border: '1px solid #e0e0e0',
      borderRadius: 1,
      height: `${debugHeight}px`,
      minHeight: `${debugHeight}px`, // Ensure it maintains its height
      maxHeight: `${debugHeight}px`, // Prevent growing beyond set height
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0 // Don't let it shrink below its set size
    }}>
      {/* Handle above the panel, so dragging up grows it. */}
      <SplitHandle
        orientation="horizontal"
        panelSide="after"
        ariaLabel="Resize debug view"
        getBounds={getBounds}
        onCommitPx={handleCommit}
      />
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        <DebugView
          debugData={debugData}
        />
      </Box>
    </Box>
  );
};

export default DebugPanel;
