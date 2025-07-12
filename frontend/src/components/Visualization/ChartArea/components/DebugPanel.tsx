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
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
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
        <Box sx={{ flex: 1, overflow: 'hidden' }}>
          <DebugView 
            debugData={debugData}
          />
        </Box>
      </Box>
    </Collapse>
  );
};

export default DebugPanel; 