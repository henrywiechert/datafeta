// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { Box, Collapse } from '@mui/material';
import ResizeHandle from '../../../Layout/ResizeHandle';
import DebugView, { DebugData } from '../../DebugView';

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
  return (
    <Collapse in={isDebugOpen}>
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
        {/* Resize handle at the top */}
        <ResizeHandle 
          direction="vertical"
          edge="top"
          onResize={onDebugResize}
          currentSize={debugHeight}
          minSize={150}
          maxSize={maxDebugHeight}
        />
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          <DebugView 
            debugData={debugData}
          />
        </Box>
      </Box>
    </Collapse>
  );
};

export default DebugPanel; 