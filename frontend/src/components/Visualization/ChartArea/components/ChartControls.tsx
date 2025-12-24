import React, { Suspense } from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';
import QueryStatusIndicator from './QueryStatusIndicator';
import DatasetStatus from './DatasetStatus';

const DevSqlViewerControl =
  process.env.NODE_ENV !== 'production'
    ? React.lazy(() => import('../../../../devtools/DevSqlViewerControl'))
    : null;

interface ChartControlsProps {
  isDebugOpen: boolean;
  onToggleDebug: () => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  isFullscreenSupported?: boolean;
  onSwapAxis?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
}

const ChartControls: React.FC<ChartControlsProps> = ({
  isDebugOpen,
  onToggleDebug,
  isFullscreen = false,
  onToggleFullscreen,
  isFullscreenSupported = true,
  onSwapAxis,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
}) => {
  return (
    <Box sx={{ 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'space-between',
      pt: 0.5,
      pb: 0.5,
      px: 1,
      borderTop: isDebugOpen ? '1px solid #e0e0e0' : 'none',
      flexShrink: 0
    }}>
      {/* Left side - Fullscreen and Swap Axis buttons */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {DevSqlViewerControl && (
          <Suspense fallback={null}>
            <DevSqlViewerControl />
          </Suspense>
        )}
        {isFullscreenSupported && onToggleFullscreen && (
          <>
            <Tooltip title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}>
              <IconButton 
                onClick={onToggleFullscreen}
                size="small"
                color={isFullscreen ? 'primary' : 'default'}
                sx={{ 
                  backgroundColor: isFullscreen ? 'primary.50' : 'transparent',
                  '&:hover': {
                    backgroundColor: isFullscreen ? 'primary.100' : 'action.hover',
                  }
                }}
              >
                {isFullscreen ? <FullscreenExitIcon fontSize="small" /> : <FullscreenIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
          </>
        )}
        
        {onSwapAxis && (
          <>
            <Tooltip title="Swap X/Y Axes">
              <IconButton 
                onClick={onSwapAxis}
                size="small"
                color="default"
                sx={{ 
                  '&:hover': {
                    backgroundColor: 'action.hover',
                  }
                }}
              >
                <SwapHorizIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </>
        )}
        
        {onUndo && (
          <Tooltip title="Undo (Ctrl+Z)">
            <span>
              <IconButton 
                onClick={onUndo}
                size="small"
                disabled={!canUndo}
                sx={{ 
                  color: canUndo ? 'primary.main' : 'action.disabled',
                  '&:hover': {
                    backgroundColor: canUndo ? 'action.hover' : 'transparent',
                  }
                }}
              >
                <UndoIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        )}
        
        {onRedo && (
          <Tooltip title="Redo (Ctrl+Shift+Z)">
            <span>
              <IconButton 
                onClick={onRedo}
                size="small"
                disabled={!canRedo}
                sx={{ 
                  color: canRedo ? 'primary.main' : 'action.disabled',
                  '&:hover': {
                    backgroundColor: canRedo ? 'action.hover' : 'transparent',
                  }
                }}
              >
                <RedoIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        )}
      </Box>

      {/* Right side - Dataset status and Query button */}
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        <DatasetStatus />
        <QueryStatusIndicator onClick={onToggleDebug} />
      </Box>
    </Box>
  );
};

export default ChartControls; 