import React, { Suspense, useEffect, useState } from 'react';
import { Box, IconButton, Tooltip, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button, TextField, Switch, FormControlLabel, Divider, Popover, Slider, Typography } from '@mui/material';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import RefreshIcon from '@mui/icons-material/Refresh';
import LinkIcon from '@mui/icons-material/Link';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import SettingsIcon from '@mui/icons-material/Settings';
import HeightIcon from '@mui/icons-material/Height';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong';
import TableRowsIcon from '@mui/icons-material/TableRows';
import QueryStatusIndicator from './QueryStatusIndicator';
import DatasetStatus from './DatasetStatus';
import { QueryOptimizationSettings } from '../../../../types';

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
  independentYAxis: boolean;
  onToggleIndependentYAxis: (independent: boolean) => void;
  optimizationSettings: QueryOptimizationSettings;
  onUpdateOptimizationSettings: (settings: QueryOptimizationSettings) => void;
  onForceRefresh?: () => void;
  bandThicknessScale: number;
  onBandThicknessScaleChange: (scale: number) => void;
  onZoomOut?: () => void;
  onZoomReset?: () => void;
  hasActiveZoomFilters?: boolean;
  showTableRows?: boolean;
  onToggleTableRows?: (show: boolean) => void;
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
  independentYAxis,
  onToggleIndependentYAxis,
  optimizationSettings,
  onUpdateOptimizationSettings,
  onForceRefresh,
  bandThicknessScale,
  onBandThicknessScaleChange,
  onZoomOut,
  onZoomReset,
  hasActiveZoomFilters = false,
  showTableRows = false,
  onToggleTableRows,
}) => {
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [draftSettings, setDraftSettings] = useState<QueryOptimizationSettings>(optimizationSettings);
  const [bandAnchorEl, setBandAnchorEl] = useState<HTMLElement | null>(null);
  const [draftBandScale, setDraftBandScale] = useState<number>(bandThicknessScale);

  useEffect(() => {
    if (settingsDialogOpen) {
      setDraftSettings(optimizationSettings);
    }
  }, [settingsDialogOpen, optimizationSettings]);

  useEffect(() => {
    if (bandAnchorEl) {
      setDraftBandScale(bandThicknessScale);
    }
  }, [bandAnchorEl, bandThicknessScale]);

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

  const handleSettingsSave = () => {
    onUpdateOptimizationSettings(draftSettings);
    setSettingsDialogOpen(false);
  };

  const handleSettingsClose = () => {
    setSettingsDialogOpen(false);
  };

  const updateNumberSetting = (key: keyof QueryOptimizationSettings, value: string) => {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      setDraftSettings((prev) => ({ ...prev, [key]: parsed }));
    }
  };

  const handleBandControlOpen = (event: React.MouseEvent<HTMLElement>) => {
    setBandAnchorEl(event.currentTarget);
  };

  const handleBandControlClose = () => {
    setBandAnchorEl(null);
  };

  const handleBandScaleChange = (_event: Event | React.SyntheticEvent, newValue: number | number[]) => {
    if (typeof newValue === 'number') {
      setDraftBandScale(newValue);
    }
  };

  const handleBandScaleCommitted = (_event: Event | React.SyntheticEvent, newValue: number | number[]) => {
    if (typeof newValue === 'number') {
      onBandThicknessScaleChange(newValue);
    }
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

        {onToggleTableRows && (
          <Tooltip title={showTableRows ? 'Show Chart' : 'Show Data Table'}>
            <IconButton
              onClick={() => onToggleTableRows(!showTableRows)}
              size="small"
              color={showTableRows ? 'primary' : 'default'}
              sx={{
                backgroundColor: showTableRows ? 'primary.50' : 'transparent',
                '&:hover': {
                  backgroundColor: showTableRows ? 'primary.100' : 'action.hover',
                }
              }}
            >
              <TableRowsIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        
        {onSwapAxis && !showTableRows && (
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

        {onZoomOut && !showTableRows && (
          <Tooltip title="Zoom out (2x)">
            <span>
              <IconButton
                onClick={onZoomOut}
                size="small"
                disabled={!hasActiveZoomFilters}
                sx={{
                  color: hasActiveZoomFilters ? 'primary.main' : 'action.disabled',
                  '&:hover': {
                    backgroundColor: hasActiveZoomFilters ? 'action.hover' : 'transparent',
                  },
                }}
              >
                <ZoomOutIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        )}

        {onZoomReset && !showTableRows && (
          <Tooltip title="Reset zoom">
            <span>
              <IconButton
                onClick={onZoomReset}
                size="small"
                disabled={!hasActiveZoomFilters}
                sx={{
                  color: hasActiveZoomFilters ? 'primary.main' : 'action.disabled',
                  '&:hover': {
                    backgroundColor: hasActiveZoomFilters ? 'action.hover' : 'transparent',
                  },
                }}
              >
                <CenterFocusStrongIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        )}

        {onForceRefresh && (
          <Tooltip title="Refresh data (invalidate cache)">
            <IconButton
              onClick={onForceRefresh}
              size="small"
              sx={{
                color: 'text.secondary',
                '&:hover': {
                  backgroundColor: 'action.hover',
                },
              }}
            >
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}

        {!showTableRows && (
          <Tooltip title="Band thickness (bar/tick/gantt)">
            <IconButton
              onClick={handleBandControlOpen}
              size="small"
              sx={{
                color: 'text.secondary',
                '&:hover': {
                  backgroundColor: 'action.hover',
                },
              }}
            >
              <HeightIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}

        <Tooltip title="Query optimization settings">
          <IconButton
            onClick={() => setSettingsDialogOpen(true)}
            size="small"
            sx={{
              color: 'text.secondary',
              '&:hover': {
                backgroundColor: 'action.hover',
              },
            }}
          >
            <SettingsIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        {!showTableRows && (
        <Tooltip title={independentXAxis ? 'Independent X per facet (click to share)' : 'Shared X across facets (click to separate)'}>
          <span>
            <IconButton
              size="small"
              onClick={() => onToggleIndependentXAxis(!independentXAxis)}
              sx={{
                color: independentXAxis ? 'primary.main' : 'text.secondary',
                backgroundColor: independentXAxis ? 'primary.50' : 'transparent',
                '&:hover': {
                  backgroundColor: independentXAxis ? 'primary.100' : 'action.hover',
                },
                fontSize: '0.7rem',
                minWidth: 32,
              }}
            >
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1 }}>
                {independentXAxis ? <LinkOffIcon sx={{ fontSize: 16 }} /> : <LinkIcon sx={{ fontSize: 16 }} />}
                <Box component="span" sx={{ fontSize: '0.6rem', mt: -0.3 }}>X</Box>
              </Box>
            </IconButton>
          </span>
        </Tooltip>
        )}

        {!showTableRows && (
        <Tooltip title={independentYAxis ? 'Independent Y per facet (click to share)' : 'Shared Y across facets (click to separate)'}>
          <span>
            <IconButton
              size="small"
              onClick={() => onToggleIndependentYAxis(!independentYAxis)}
              sx={{
                color: independentYAxis ? 'primary.main' : 'text.secondary',
                backgroundColor: independentYAxis ? 'primary.50' : 'transparent',
                '&:hover': {
                  backgroundColor: independentYAxis ? 'primary.100' : 'action.hover',
                },
                fontSize: '0.7rem',
                minWidth: 32,
              }}
            >
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1 }}>
                {independentYAxis ? <LinkOffIcon sx={{ fontSize: 16 }} /> : <LinkIcon sx={{ fontSize: 16 }} />}
                <Box component="span" sx={{ fontSize: '0.6rem', mt: -0.3 }}>Y</Box>
              </Box>
            </IconButton>
          </span>
        </Tooltip>
        )}

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

      <Popover
        open={Boolean(bandAnchorEl)}
        anchorEl={bandAnchorEl}
        onClose={handleBandControlClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        PaperProps={{ sx: { p: 1, width: 220 } }}
      >
        <Box sx={{ px: 0.5 }}>
          <Typography variant="body2" sx={{ fontSize: '0.75rem', color: 'text.secondary', mb: 0.5 }}>
            Band thickness
          </Typography>
          <Slider
            value={draftBandScale}
            onChange={handleBandScaleChange}
            onChangeCommitted={handleBandScaleCommitted}
            valueLabelDisplay="auto"
            min={0.1}
            max={3}
            step={0.1}
            size="small"
          />
        </Box>
      </Popover>

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

      <Dialog
        open={settingsDialogOpen}
        onClose={handleSettingsClose}
        aria-labelledby="optimization-settings-title"
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle id="optimization-settings-title">
          Query Optimization Settings
        </DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <FormControlLabel
            control={
              <Switch
                checked={draftSettings.forceRemote}
                onChange={(e) =>
                  setDraftSettings((prev) => ({ ...prev, forceRemote: e.target.checked }))
                }
              />
            }
            label="Force remote query (skip DuckDB cache)"
          />

          <TextField
            label="Large dataset threshold (rows)"
            type="number"
            value={draftSettings.sizeThreshold}
            onChange={(e) => updateNumberSetting('sizeThreshold', e.target.value)}
            inputProps={{ min: 0 }}
            size="small"
            helperText="Above this row count, prefer backend aggregation."
          />

          <Divider />

          <TextField
            label="Max points (single chart)"
            type="number"
            value={draftSettings.maxPointsSingle}
            onChange={(e) => updateNumberSetting('maxPointsSingle', e.target.value)}
            inputProps={{ min: 0 }}
            size="small"
          />

          <TextField
            label="Max points (faceted charts)"
            type="number"
            value={draftSettings.maxPointsFaceted}
            onChange={(e) => updateNumberSetting('maxPointsFaceted', e.target.value)}
            inputProps={{ min: 0 }}
            size="small"
          />

          <TextField
            label="Max points (discrete color cap)"
            type="number"
            value={draftSettings.maxPointsWithDiscreteColor}
            onChange={(e) => updateNumberSetting('maxPointsWithDiscreteColor', e.target.value)}
            inputProps={{ min: 0 }}
            size="small"
            helperText="Applied when color field is discrete."
          />

          <TextField
            label="Min per stratum (discrete color)"
            type="number"
            value={draftSettings.minPerStratumWithDiscreteColor}
            onChange={(e) => updateNumberSetting('minPerStratumWithDiscreteColor', e.target.value)}
            inputProps={{ min: 0 }}
            size="small"
          />

          <TextField
            label="Line chart max rows"
            type="number"
            value={draftSettings.lineBudgetMaxRows}
            onChange={(e) => updateNumberSetting('lineBudgetMaxRows', e.target.value)}
            inputProps={{ min: 0 }}
            size="small"
            helperText="Limits aggregated line results for dense series."
          />

          <Divider />

          <FormControlLabel
            control={
              <Switch
                checked={draftSettings.enableRounding}
                onChange={(e) =>
                  setDraftSettings((prev) => ({ ...prev, enableRounding: e.target.checked }))
                }
              />
            }
            label="Enable adaptive rounding"
          />

          <TextField
            label="Rounding threshold (light)"
            type="number"
            value={draftSettings.roundingThresholdLight}
            onChange={(e) => updateNumberSetting('roundingThresholdLight', e.target.value)}
            inputProps={{ min: 0 }}
            size="small"
            disabled={!draftSettings.enableRounding}
            helperText="Applies when auto optimization chooses light."
          />

          <TextField
            label="Rounding threshold (balanced)"
            type="number"
            value={draftSettings.roundingThresholdBalanced}
            onChange={(e) => updateNumberSetting('roundingThresholdBalanced', e.target.value)}
            inputProps={{ min: 0 }}
            size="small"
            disabled={!draftSettings.enableRounding}
            helperText="Applies when auto optimization chooses balanced."
          />

          <TextField
            label="Rounding threshold (aggressive)"
            type="number"
            value={draftSettings.roundingThresholdAggressive}
            onChange={(e) => updateNumberSetting('roundingThresholdAggressive', e.target.value)}
            inputProps={{ min: 0 }}
            size="small"
            disabled={!draftSettings.enableRounding}
            helperText="Applies when auto optimization chooses aggressive."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleSettingsClose}>Cancel</Button>
          <Button variant="contained" onClick={handleSettingsSave}>
            Apply
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ChartControls; 