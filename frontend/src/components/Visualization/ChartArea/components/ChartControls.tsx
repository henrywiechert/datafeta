// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { Suspense, useEffect, useRef, useState } from 'react';
import { Box, IconButton, Tooltip, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button, Popover, Slider, Typography, Menu, MenuItem, ListItemIcon, ListItemText } from '@mui/material';
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
import StackedLineChartIcon from '@mui/icons-material/StackedLineChart';
import TableRowsIcon from '@mui/icons-material/TableRows';
import TitleIcon from '@mui/icons-material/Title';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import ViewSidebarIcon from '@mui/icons-material/ViewSidebar';
import ViewSidebarOutlinedIcon from '@mui/icons-material/ViewSidebarOutlined';
import QueryStatusIndicator from './QueryStatusIndicator';
import DatasetStatus from './DatasetStatus';
import { QueryOptimizationSettings } from '../../../../types';
import OptimizationSettingsDialog from './OptimizationSettingsDialog';
import { CollapsibleChartControl, resolveChartControlsLayout } from './chartControlsLayout';
import { T } from '../../../../theme/tokens';

const DevSqlViewerControl =
  process.env.NODE_ENV !== 'production'
    ? React.lazy(() => import('../../../../devtools/DevSqlViewerControl'))
    : null;

export interface ChartControlsProps {
  isDebugOpen: boolean;
  onToggleDebug: () => void;
  debugUiEnabled?: boolean;
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
  /** Line series rebase toggle (index to first visible = 100); hidden unless a line cell can be rebased. */
  canRebaseSeries?: boolean;
  rebaseSeries?: boolean;
  onToggleRebaseSeries?: (rebase: boolean) => void;
  showTableRows?: boolean;
  onToggleTableRows?: (show: boolean) => void;
  showChartCaption?: boolean;
  onToggleChartCaption?: (show: boolean) => void;
  /** When in table view, overrides the dataset status with exact table totals. */
  datasetStatusOverride?: { rows: number; cols: number } | null;
  /** Tablet shell: whether Fields/Properties are currently visible. */
  sidePanelsVisible?: boolean;
  /** Tablet shell: one button that shows/hides both side panels. */
  onToggleSidePanels?: () => void;
}

const ChartControls: React.FC<ChartControlsProps> = ({
  isDebugOpen,
  onToggleDebug,
  debugUiEnabled = true,
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
  canRebaseSeries = false,
  rebaseSeries = false,
  onToggleRebaseSeries,
  showTableRows = false,
  onToggleTableRows,
  showChartCaption = false,
  onToggleChartCaption,
  datasetStatusOverride,
  sidePanelsVisible = true,
  onToggleSidePanels,
}) => {
  const controlsRef = useRef<HTMLDivElement | null>(null);
  const [controlsWidth, setControlsWidth] = useState<number>(Infinity);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [draftSettings, setDraftSettings] = useState<QueryOptimizationSettings>(optimizationSettings);
  const [bandAnchorEl, setBandAnchorEl] = useState<HTMLElement | null>(null);
  const [overflowAnchorEl, setOverflowAnchorEl] = useState<HTMLElement | null>(null);
  const moreButtonRef = useRef<HTMLButtonElement | null>(null);
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

  useEffect(() => {
    if (!controlsRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setControlsWidth(entry.contentRect.width);
    });
    observer.observe(controlsRef.current);
    return () => observer.disconnect();
  }, []);

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

  const handleBandControlOpen = (event: React.MouseEvent<HTMLElement>) => {
    setBandAnchorEl(event.currentTarget);
  };

  const handleBandControlClose = () => {
    setBandAnchorEl(null);
  };

  const handleOverflowOpen = (event: React.MouseEvent<HTMLButtonElement>) => {
    setOverflowAnchorEl(event.currentTarget);
  };

  const handleOverflowClose = () => {
    setOverflowAnchorEl(null);
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

  const openBandFromOverflow = () => {
    handleOverflowClose();
    if (moreButtonRef.current) {
      setBandAnchorEl(moreButtonRef.current);
    }
  };

  const openSettingsFromOverflow = () => {
    handleOverflowClose();
    setSettingsDialogOpen(true);
  };

  const handleResetFromOverflow = () => {
    handleOverflowClose();
    handleResetClick();
  };

  const showChartOnlyControls = !showTableRows;
  const availableControls: CollapsibleChartControl[] = [];
  const addIf = (cond: unknown, id: CollapsibleChartControl) => { if (cond) availableControls.push(id); };
  addIf(onToggleSidePanels, 'sidePanels');
  addIf(isFullscreenSupported && onToggleFullscreen, 'fullscreen');
  addIf(onUndo, 'undo');
  addIf(onRedo, 'redo');
  addIf(DevSqlViewerControl, 'devSql');
  addIf(onToggleTableRows, 'tableToggle');
  addIf(onToggleChartCaption, 'caption');
  addIf(showChartOnlyControls && onSwapAxis, 'swap');
  addIf(showChartOnlyControls && onZoomOut, 'zoomOut');
  addIf(showChartOnlyControls && onZoomReset, 'zoomReset');
  addIf(showChartOnlyControls && canRebaseSeries && onToggleRebaseSeries, 'rebase');
  addIf(onForceRefresh, 'refresh');
  addIf(showChartOnlyControls, 'band');
  addIf(true, 'settings');
  addIf(showChartOnlyControls, 'independentX');
  addIf(showChartOnlyControls, 'independentY');
  addIf(onResetWorkspace, 'reset');

  const { inline, overflow, hasOverflowActions } = resolveChartControlsLayout({
    availableWidth: controlsWidth,
    available: availableControls,
  });
  const showInlineSidePanels = inline.has('sidePanels');
  const showInlineFullscreen = inline.has('fullscreen');
  const showInlineUndo = inline.has('undo');
  const showInlineRedo = inline.has('redo');
  const showInlineDevSql = inline.has('devSql');
  const showInlineTableToggle = inline.has('tableToggle');
  const showInlineCaption = inline.has('caption');
  const showInlineSwap = inline.has('swap');
  const showInlineZoomOut = inline.has('zoomOut');
  const showInlineZoomReset = inline.has('zoomReset');
  const showInlineRebase = inline.has('rebase');
  const showInlineRefresh = inline.has('refresh');
  const showInlineBand = inline.has('band');
  const showInlineSettings = inline.has('settings');
  const showInlineIndependentX = inline.has('independentX');
  const showInlineIndependentY = inline.has('independentY');
  const showInlineReset = inline.has('reset');
  const showOverflowSidePanels = overflow.has('sidePanels');
  const showOverflowFullscreen = overflow.has('fullscreen');
  const showOverflowUndo = overflow.has('undo');
  const showOverflowRedo = overflow.has('redo');
  const showOverflowTableToggle = overflow.has('tableToggle');
  const showOverflowCaption = overflow.has('caption');
  const showOverflowSwap = overflow.has('swap');
  const showOverflowZoomOut = overflow.has('zoomOut');
  const showOverflowZoomReset = overflow.has('zoomReset');
  const showOverflowRebase = overflow.has('rebase');
  const showOverflowRefresh = overflow.has('refresh');
  const showOverflowBand = overflow.has('band');
  const showOverflowSettings = overflow.has('settings');
  const showOverflowIndependentX = overflow.has('independentX');
  const showOverflowIndependentY = overflow.has('independentY');
  const showOverflowReset = overflow.has('reset');

  return (
    <Box
      className="chart-controls-toolbar"
      sx={{ 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'space-between',
      gap: 1,
      pt: 0.5,
      pb: 0.5,
      px: 1,
      borderTop: isDebugOpen ? `1px solid ${T.borderHairline}` : 'none',
      flexShrink: 0
    }}
    >
      <Box ref={controlsRef} sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, flex: 1, overflow: 'hidden' }}>
        {showInlineSidePanels && onToggleSidePanels && (
          <Tooltip title={sidePanelsVisible ? 'Hide side panels' : 'Show side panels'}>
            <IconButton
              onClick={onToggleSidePanels}
              size="small"
              color={sidePanelsVisible ? 'primary' : 'default'}
              aria-label={sidePanelsVisible ? 'Hide side panels' : 'Show side panels'}
              aria-pressed={sidePanelsVisible}
              sx={{
                backgroundColor: sidePanelsVisible ? T.accentTintStrong : 'transparent',
                '&:hover': {
                  backgroundColor: sidePanelsVisible ? T.accentTintEmphasis : 'action.hover',
                },
              }}
            >
              {sidePanelsVisible
                ? <ViewSidebarIcon fontSize="small" />
                : <ViewSidebarOutlinedIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
        )}
        {showInlineDevSql && DevSqlViewerControl && (
          <Suspense fallback={null}>
            <DevSqlViewerControl />
          </Suspense>
        )}
        {showInlineFullscreen && onToggleFullscreen && (
          <Tooltip title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}>
            <IconButton 
              onClick={onToggleFullscreen}
              size="small"
              color={isFullscreen ? 'primary' : 'default'}
              sx={{ 
                backgroundColor: isFullscreen ? T.accentTintStrong : 'transparent',
                '&:hover': {
                  backgroundColor: isFullscreen ? T.accentTintEmphasis : 'action.hover',
                }
              }}
            >
              {isFullscreen ? <FullscreenExitIcon fontSize="small" /> : <FullscreenIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
        )}

        {showInlineTableToggle && onToggleTableRows && (
          <Tooltip title={showTableRows ? 'Show Chart' : 'Show Data Table'}>
            <IconButton
              onClick={() => onToggleTableRows(!showTableRows)}
              size="small"
              color={showTableRows ? 'primary' : 'default'}
              sx={{
                backgroundColor: showTableRows ? T.accentTintStrong : 'transparent',
                '&:hover': {
                  backgroundColor: showTableRows ? T.accentTintEmphasis : 'action.hover',
                }
              }}
            >
              <TableRowsIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}

        {showInlineCaption && onToggleChartCaption && (
          <Tooltip title={showChartCaption ? 'Hide chart title' : 'Show chart title'}>
            <IconButton
              onClick={() => onToggleChartCaption(!showChartCaption)}
              size="small"
              color={showChartCaption ? 'primary' : 'default'}
              aria-pressed={showChartCaption}
              aria-label={showChartCaption ? 'Hide chart title' : 'Show chart title'}
              sx={{
                backgroundColor: showChartCaption ? T.accentTintStrong : 'transparent',
                '&:hover': {
                  backgroundColor: showChartCaption ? T.accentTintEmphasis : 'action.hover',
                },
              }}
            >
              <TitleIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        
        {showInlineSwap && onSwapAxis && (
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
        
        {showInlineUndo && onUndo && (
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
        
        {showInlineRedo && onRedo && (
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

        {showInlineZoomOut && onZoomOut && (
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

        {showInlineZoomReset && onZoomReset && (
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

        {showInlineRebase && onToggleRebaseSeries && (
          <Tooltip title={rebaseSeries ? 'Lines indexed to 100 at the left edge (click for actual values)' : 'Index lines to 100 at the left edge (compare growth)'}>
            <IconButton
              size="small"
              onClick={() => onToggleRebaseSeries(!rebaseSeries)}
              aria-pressed={rebaseSeries}
              sx={{
                color: rebaseSeries ? 'primary.main' : 'text.secondary',
                backgroundColor: rebaseSeries ? T.accentTintStrong : 'transparent',
                '&:hover': {
                  backgroundColor: rebaseSeries ? T.accentTintEmphasis : 'action.hover',
                },
                minWidth: 32,
              }}
            >
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1 }}>
                <StackedLineChartIcon sx={{ fontSize: 16 }} />
                <Box component="span" sx={{ fontSize: '0.6rem', mt: -0.3 }}>100</Box>
              </Box>
            </IconButton>
          </Tooltip>
        )}

        {showInlineRefresh && onForceRefresh && (
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

        {showInlineBand && (
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

        {showInlineSettings && (
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
        )}

        {showInlineIndependentX && (
        <Tooltip title={independentXAxis ? 'Independent X per facet (click to share)' : 'Shared X across facets (click to separate)'}>
          <span>
            <IconButton
              size="small"
              onClick={() => onToggleIndependentXAxis(!independentXAxis)}
              sx={{
                color: independentXAxis ? 'primary.main' : 'text.secondary',
                backgroundColor: independentXAxis ? T.accentTintStrong : 'transparent',
                '&:hover': {
                  backgroundColor: independentXAxis ? T.accentTintEmphasis : 'action.hover',
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

        {showInlineIndependentY && (
        <Tooltip title={independentYAxis ? 'Independent Y per facet (click to share)' : 'Shared Y across facets (click to separate)'}>
          <span>
            <IconButton
              size="small"
              onClick={() => onToggleIndependentYAxis(!independentYAxis)}
              sx={{
                color: independentYAxis ? 'primary.main' : 'text.secondary',
                backgroundColor: independentYAxis ? T.accentTintStrong : 'transparent',
                '&:hover': {
                  backgroundColor: independentYAxis ? T.accentTintEmphasis : 'action.hover',
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

        {showInlineReset && onResetWorkspace && (
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

        {hasOverflowActions && (
          <Tooltip title="More actions">
            <IconButton
              ref={moreButtonRef}
              size="small"
              onClick={handleOverflowOpen}
              aria-haspopup="menu"
              aria-controls={Boolean(overflowAnchorEl) ? 'chart-controls-overflow-menu' : undefined}
              aria-expanded={Boolean(overflowAnchorEl) ? 'true' : undefined}
            >
              <MoreVertIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {/* Right side - Dataset status and Query button */}
      <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        <DatasetStatus tableOverride={datasetStatusOverride} />
        <QueryStatusIndicator onClick={debugUiEnabled ? onToggleDebug : undefined} />
      </Box>

      <Menu
        id="chart-controls-overflow-menu"
        anchorEl={overflowAnchorEl}
        open={Boolean(overflowAnchorEl)}
        onClose={handleOverflowClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      >
        {showOverflowSidePanels && onToggleSidePanels && (
          <MenuItem onClick={() => { onToggleSidePanels(); handleOverflowClose(); }}>
            <ListItemIcon>{sidePanelsVisible ? <ViewSidebarIcon fontSize="small" /> : <ViewSidebarOutlinedIcon fontSize="small" />}</ListItemIcon>
            <ListItemText>{sidePanelsVisible ? 'Hide side panels' : 'Show side panels'}</ListItemText>
          </MenuItem>
        )}

        {showOverflowFullscreen && onToggleFullscreen && (
          <MenuItem onClick={() => { onToggleFullscreen(); handleOverflowClose(); }}>
            <ListItemIcon>{isFullscreen ? <FullscreenExitIcon fontSize="small" /> : <FullscreenIcon fontSize="small" />}</ListItemIcon>
            <ListItemText>{isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}</ListItemText>
          </MenuItem>
        )}

        {showOverflowUndo && onUndo && (
          <MenuItem disabled={!canUndo} onClick={() => { onUndo(); handleOverflowClose(); }}>
            <ListItemIcon><UndoIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Undo</ListItemText>
          </MenuItem>
        )}

        {showOverflowRedo && onRedo && (
          <MenuItem disabled={!canRedo} onClick={() => { onRedo(); handleOverflowClose(); }}>
            <ListItemIcon><RedoIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Redo</ListItemText>
          </MenuItem>
        )}

        {showOverflowTableToggle && onToggleTableRows && (
          <MenuItem
            onClick={() => {
              onToggleTableRows(!showTableRows);
              handleOverflowClose();
            }}
          >
            <ListItemIcon><TableRowsIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{showTableRows ? 'Show chart' : 'Show data table'}</ListItemText>
          </MenuItem>
        )}

        {showOverflowCaption && onToggleChartCaption && (
          <MenuItem onClick={() => { onToggleChartCaption(!showChartCaption); handleOverflowClose(); }}>
            <ListItemIcon><TitleIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{showChartCaption ? 'Hide chart title' : 'Show chart title'}</ListItemText>
          </MenuItem>
        )}

        {showOverflowSwap && onSwapAxis && (
          <MenuItem onClick={() => { onSwapAxis(); handleOverflowClose(); }}>
            <ListItemIcon><SwapHorizIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Swap X/Y axes</ListItemText>
          </MenuItem>
        )}

        {showOverflowZoomOut && onZoomOut && (
          <MenuItem disabled={!hasActiveZoomFilters} onClick={() => { onZoomOut(); handleOverflowClose(); }}>
            <ListItemIcon><ZoomOutIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Zoom out</ListItemText>
          </MenuItem>
        )}

        {showOverflowZoomReset && onZoomReset && (
          <MenuItem disabled={!hasActiveZoomFilters} onClick={() => { onZoomReset(); handleOverflowClose(); }}>
            <ListItemIcon><CenterFocusStrongIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Reset zoom</ListItemText>
          </MenuItem>
        )}

        {showOverflowRebase && onToggleRebaseSeries && (
          <MenuItem onClick={() => { onToggleRebaseSeries(!rebaseSeries); handleOverflowClose(); }}>
            <ListItemIcon><StackedLineChartIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{rebaseSeries ? 'Index lines to 100: on' : 'Index lines to 100: off'}</ListItemText>
          </MenuItem>
        )}

        {showOverflowRefresh && onForceRefresh && (
          <MenuItem onClick={() => { onForceRefresh(); handleOverflowClose(); }}>
            <ListItemIcon><RefreshIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Refresh data</ListItemText>
          </MenuItem>
        )}

        {showOverflowBand && (
          <MenuItem onClick={openBandFromOverflow}>
            <ListItemIcon><HeightIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Band thickness</ListItemText>
          </MenuItem>
        )}

        {showOverflowSettings && (
        <MenuItem onClick={openSettingsFromOverflow}>
          <ListItemIcon><SettingsIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Query optimization settings</ListItemText>
        </MenuItem>
        )}

        {showOverflowIndependentX && (
          <MenuItem onClick={() => { onToggleIndependentXAxis(!independentXAxis); handleOverflowClose(); }}>
            <ListItemIcon>{independentXAxis ? <LinkOffIcon fontSize="small" /> : <LinkIcon fontSize="small" />}</ListItemIcon>
            <ListItemText>{independentXAxis ? 'Independent X: on' : 'Independent X: off'}</ListItemText>
          </MenuItem>
        )}

        {showOverflowIndependentY && (
          <MenuItem onClick={() => { onToggleIndependentYAxis(!independentYAxis); handleOverflowClose(); }}>
            <ListItemIcon>{independentYAxis ? <LinkOffIcon fontSize="small" /> : <LinkIcon fontSize="small" />}</ListItemIcon>
            <ListItemText>{independentYAxis ? 'Independent Y: on' : 'Independent Y: off'}</ListItemText>
          </MenuItem>
        )}

        {showOverflowReset && onResetWorkspace && (
          <MenuItem onClick={handleResetFromOverflow}>
            <ListItemIcon><RestartAltIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Reset workspace</ListItemText>
          </MenuItem>
        )}

      </Menu>

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

      <OptimizationSettingsDialog
        open={settingsDialogOpen}
        settings={draftSettings}
        onSettingsChange={setDraftSettings}
        onCancel={handleSettingsClose}
        onApply={handleSettingsSave}
      />
    </Box>
  );
};

export default React.memo(ChartControls); 