import React from 'react';
import { Box, Collapse } from '@mui/material';
import ResizeHandle from '../../../Layout/ResizeHandle';
import DebugView from '../../DebugView';
import { QueryDescription } from '../../../../types';
import { VegaLiteSpec } from '../../../../spec-generator/types';

interface DebugPanelProps {
  isDebugOpen: boolean;
  debugHeight: number;
  maxDebugHeight: number;
  onDebugResize: (newHeight: number) => void;
  queryDescription: QueryDescription | null;
  queryResult: any;
  queryError: string | null;
  vegaSpec: VegaLiteSpec | null;
  chartInfo: any | null;
  renderingError: string | null;
}

const DebugPanel: React.FC<DebugPanelProps> = ({
  isDebugOpen,
  debugHeight,
  maxDebugHeight,
  onDebugResize,
  queryDescription,
  queryResult,
  queryError,
  vegaSpec,
  chartInfo,
  renderingError,
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
            queryDescription={queryDescription}
            queryResult={queryResult}
            queryError={queryError}
            vegaSpec={vegaSpec}
            chartInfo={chartInfo}
            renderingError={renderingError}
          />
        </Box>
      </Box>
    </Collapse>
  );
};

export default DebugPanel; 