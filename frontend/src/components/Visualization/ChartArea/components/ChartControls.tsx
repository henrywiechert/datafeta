import React, { Suspense, useState } from 'react';
import { Box, IconButton, Tooltip, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button } from '@mui/material';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import LinkIcon from '@mui/icons-material/Link';
import LinkOffIcon from '@mui/icons-material/LinkOff';
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
  onResetWorkspace?: () => void;
  independentXAxis: boolean;
  onToggleIndependentXAxis: (independent: boolean) => void;
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
  onResetWorkspace,
  independentXAxis,
  onToggleIndependentXAxis,
}) => {
  const [resetDialogOpen, setResetDialogOpen] = useState(false);

  const handleResetClick = () => {
    setResetDialogOpen(true);
  };

  const handleResetConfirm = () => {
    setResetDialogOpen(false);
    onResetWorkspace?.();
  };

  const handleResetCancel = () => {
    setResetDialogOpen(false);
  };

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
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {DevSqlViewerControl && (
          <Suspense fallback={null}>
            <DevSqlViewerControl />
          </Suspense>
        )}
        {isFullscreenSupported && onToggleFullscreen && (
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
        )}
        
        {onSwapAxis && (
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

        <Tooltip title={independentXAxis ? 'Independent X per facet' : 'Shared X across facets'}>
          <span>
            <IconButton
              size="small"
              onClick={() => onToggleIndependentXAxis(!independentXAxis)}
              sx={{
                color: independentXAxis ? 'primary.main' : 'text.secondary',
                backgroundColor: independentXAxis ? 'primary.50' : 'transparent',
                '&:hover': {
                  backgroundColor: independentXAxis ? 'primary.100' : 'action.hover',
                }
              }}
            >
              {independentXAxis ? <LinkOffIcon fontSize="small" /> : <LinkIcon fontSize="small" />}
            </IconButton>
          </span>
        </Tooltip>

        {onResetWorkspace && (
          <Tooltip title="Reset Workspace">
            <IconButton 
              onClick={handleResetClick}
              size="small"
              sx={{ 
                ml: 1,
                color: 'warning.main',
                '&:hover': {
                  backgroundColor: 'warning.light',
                  color: 'warning.dark',
                }
              }}
            >
              <RestartAltIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {/* Right side - Dataset status and Query button */}
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        <DatasetStatus />
        <QueryStatusIndicator onClick={onToggleDebug} />
      </Box>

      {/* Reset Workspace Confirmation Dialog */}
      <Dialog
        open={resetDialogOpen}
        onClose={handleResetCancel}
        aria-labelledby="reset-dialog-title"
        aria-describedby="reset-dialog-description"
      >
        <DialogTitle id="reset-dialog-title">
          Reset Workspace?
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="reset-dialog-description">
            This will clear all sheets, axes, filters, and visualization settings. 
            This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleResetCancel} autoFocus>
            Cancel
          </Button>
          <Button onClick={handleResetConfirm} color="warning" variant="contained">
            Reset
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ChartControls; 