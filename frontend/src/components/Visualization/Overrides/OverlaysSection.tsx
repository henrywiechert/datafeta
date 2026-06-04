// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * OverlaysSection
 *
 * Collapsible section in the Overrides panel that shows overlay rows
 * (regression, moving average) with inline parameter controls.
 * Each overlay type is a card row styled to match FieldOverrideRow.
 * Only rendered when the active chart type supports at least one overlay.
 *
 * Self-contained: reads and dispatches to VisualizationContext directly.
 */

import React, { useMemo, useState, useEffect } from 'react';
import { Box, Switch, Slider, Select, MenuItem, Typography, TextField } from '@mui/material';
import TimelineIcon from '@mui/icons-material/Timeline';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import BlurOnIcon from '@mui/icons-material/BlurOn';
import { PropertySection } from '../Properties';
import { useVisualizationContext } from '../../../contexts/VisualizationContext';
import { useUndoRedo } from '../../../contexts/UndoRedoContext';
import {
  OverlayConfig,
  OverlayType,
  OverlayParams,
  OVERLAY_META,
  DEFAULT_OVERLAYS,
} from '../../../observable-plot-generator/overlays/types';
import { UserChartType, Field } from '../../../types';
import { lineColorSplitsSeries } from '../../../utils/lineColorEncoding';
import { detectDefaultChartTypeForPair, CellChartType } from '../../../observable-plot-generator/helpers/chartTypeResolver';
import { analyzeFields } from '../../../observable-plot-generator/analysis/fieldAnalysis';

// --- Color picker (tiny inline swatch + native input) -----------------------

const InlineColorPicker: React.FC<{ value: string; onChange: (c: string) => void }> = ({ value, onChange }) => (
  <Box sx={{ display: 'inline-flex', alignItems: 'center' }}>
    <input
      type="color"
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{ width: 22, height: 22, border: 'none', padding: 0, cursor: 'pointer', background: 'none' }}
    />
  </Box>
);

// --- Per-overlay inline controls --------------------------------------------

const RegressionControls: React.FC<{
  params: OverlayParams;
  onUpdate: (p: Partial<OverlayParams>) => void;
  hasDiscreteColor?: boolean;
}> = ({ params, onUpdate, hasDiscreteColor }) => {
  const showCI = params.showCI ?? true;
  const perGroup = params.perGroup ?? false;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
      {/* CI toggle + slider + color (color hidden when per-group) */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="caption" sx={{ minWidth: 18 }}>CI</Typography>
        <Switch
          size="small"
          checked={showCI}
          onChange={(_, v) => onUpdate({ showCI: v })}
          sx={{ flexShrink: 0 }}
        />
        {showCI && (
          <Slider
            size="small"
            min={0.8}
            max={0.99}
            step={0.01}
            value={params.ci ?? 0.95}
            onChange={(_, v) => onUpdate({ ci: v as number })}
            valueLabelDisplay="auto"
            valueLabelFormat={v => `${Math.round(v * 100)}%`}
            sx={{ flex: 1, minWidth: 60 }}
          />
        )}
        {!perGroup && (
          <InlineColorPicker value={params.color ?? '#e15759'} onChange={c => onUpdate({ color: c })} />
        )}
      </Box>
      {/* Line thickness */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="caption" sx={{ minWidth: 18 }}>Px</Typography>
        <Slider
          size="small"
          min={0.5}
          max={5}
          step={0.5}
          value={params.strokeWidth ?? 1.5}
          onChange={(_, v) => onUpdate({ strokeWidth: v as number })}
          valueLabelDisplay="auto"
          sx={{ flex: 1, minWidth: 60 }}
        />
      </Box>
      {/* Per group — only shown when a discrete color field is active */}
      {hasDiscreteColor && (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="caption">Per group</Typography>
          <Switch
            size="small"
            checked={perGroup}
            onChange={(_, v) => onUpdate({ perGroup: v })}
          />
        </Box>
      )}
    </Box>
  );
};

const MovingAverageControls: React.FC<{
  params: OverlayParams;
  onUpdate: (p: Partial<OverlayParams>) => void;
  hasDiscreteColor?: boolean;
}> = ({ params, onUpdate, hasDiscreteColor }) => {
  const committed = params.windowSize ?? 20;
  const [raw, setRaw] = useState(String(committed));
  const perGroup = params.perGroup ?? false;

  // Keep local text in sync if the committed value changes externally
  useEffect(() => { setRaw(String(committed)); }, [committed]);

  const commit = () => {
    const v = parseInt(raw, 10);
    if (Number.isFinite(v) && v >= 2 && v <= 1000) {
      onUpdate({ windowSize: v });
    } else {
      setRaw(String(committed)); // revert invalid input
    }
  };

  return (
  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Typography variant="caption" sx={{ minWidth: 46 }}>Window</Typography>
      <TextField
        size="small"
        variant="standard"
        inputProps={{ style: { width: 40, fontSize: 12, textAlign: 'center', MozAppearance: 'textfield' } }}
        value={raw}
        onChange={e => setRaw(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); commit(); } }}
      />
      <Select
        size="small"
        variant="standard"
        value={params.reduce ?? 'mean'}
        onChange={e => onUpdate({ reduce: e.target.value })}
        sx={{ fontSize: 12, minWidth: 64 }}
      >
        <MenuItem value="mean">Mean</MenuItem>
        <MenuItem value="median">Median</MenuItem>
        <MenuItem value="sum">Sum</MenuItem>
        <MenuItem value="min">Min</MenuItem>
        <MenuItem value="max">Max</MenuItem>
      </Select>
      {!perGroup && (
        <InlineColorPicker value={params.color ?? '#4e79a7'} onChange={c => onUpdate({ color: c })} />
      )}
    </Box>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Typography variant="caption" sx={{ minWidth: 18 }}>Px</Typography>
      <Slider
        size="small"
        min={0.5}
        max={5}
        step={0.5}
        value={params.strokeWidth ?? 2}
        onChange={(_, v) => onUpdate({ strokeWidth: v as number })}
        valueLabelDisplay="auto"
        sx={{ flex: 1, minWidth: 60 }}
      />
    </Box>
    {/* Per group — only shown when a discrete color field is active */}
    {hasDiscreteColor && (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="caption">Per group</Typography>
        <Switch
          size="small"
          checked={perGroup}
          onChange={(_, v) => onUpdate({ perGroup: v })}
        />
      </Box>
    )}
  </Box>
  );
};

const DensityControls: React.FC<{
  params: OverlayParams;
  onUpdate: (p: Partial<OverlayParams>) => void;
  hasDiscreteColor?: boolean;
  hideSourceData?: boolean;
  onToggleHideSource?: (v: boolean) => void;
}> = ({ params, onUpdate, hasDiscreteColor, hideSourceData, onToggleHideSource }) => {
  const filled   = params.filled    ?? false;
  const perGroup = params.perGroup  ?? false;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
      {/* Bandwidth */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="caption" sx={{ minWidth: 64 }}>Bandwidth</Typography>
        <Slider
          size="small"
          min={5}
          max={100}
          step={5}
          value={params.bandwidth ?? 30}
          onChange={(_, v) => onUpdate({ bandwidth: v as number })}
          valueLabelDisplay="auto"
          sx={{ flex: 1, minWidth: 60 }}
        />
      </Box>
      {/* Thresholds */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="caption" sx={{ minWidth: 64 }}>Levels</Typography>
        <Slider
          size="small"
          min={3}
          max={30}
          step={1}
          value={params.thresholds ?? 10}
          onChange={(_, v) => onUpdate({ thresholds: v as number })}
          valueLabelDisplay="auto"
          sx={{ flex: 1, minWidth: 60 }}
        />
      </Box>
      {/* Stroke width */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="caption" sx={{ minWidth: 64 }}>Px</Typography>
        <Slider
          size="small"
          min={0.5}
          max={4}
          step={0.5}
          value={params.strokeWidth ?? 1.5}
          onChange={(_, v) => onUpdate({ strokeWidth: v as number })}
          valueLabelDisplay="auto"
          sx={{ flex: 1, minWidth: 60 }}
        />
        {!perGroup && (
          <InlineColorPicker value={params.color ?? '#4e79a7'} onChange={c => onUpdate({ color: c })} />
        )}
      </Box>
      {/* Filled toggle + fill opacity */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="caption">Filled</Typography>
        <Switch
          size="small"
          checked={filled}
          onChange={(_, v) => onUpdate({ filled: v })}
        />
      </Box>
      {filled && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="caption" sx={{ minWidth: 64 }}>Opacity</Typography>
          <Slider
            size="small"
            min={0.05}
            max={0.8}
            step={0.05}
            value={params.opacity ?? 0.2}
            onChange={(_, v) => onUpdate({ opacity: v as number })}
            valueLabelDisplay="auto"
            valueLabelFormat={v => `${Math.round(v * 100)}%`}
            sx={{ flex: 1, minWidth: 60 }}
          />
        </Box>
      )}
      {/* Per group — only when a discrete color field is active */}
      {hasDiscreteColor && (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="caption">Per group</Typography>
          <Switch
            size="small"
            checked={perGroup}
            onChange={(_, v) => onUpdate({ perGroup: v })}
          />
        </Box>
      )}
      {/* Hide source data — show only the density contours */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="caption">Hide source data</Typography>
        <Switch
          size="small"
          checked={hideSourceData ?? false}
          onChange={(_, v) => onToggleHideSource?.(v)}
        />
      </Box>
    </Box>
  );
};

const OVERLAY_CONTROLS: Record<OverlayType, React.FC<{ params: OverlayParams; onUpdate: (p: Partial<OverlayParams>) => void; hasDiscreteColor?: boolean; hideSourceData?: boolean; onToggleHideSource?: (v: boolean) => void }>> = {
  linearRegression: RegressionControls,
  movingAverage: MovingAverageControls,
  density: DensityControls,
};

// Icon per overlay type
const OVERLAY_ICONS: Record<OverlayType, React.ElementType> = {
  linearRegression: TrendingUpIcon,
  movingAverage: ShowChartIcon,
  density: BlurOnIcon,
};

// --- Main section component --------------------------------------------------

const OverlaysSection: React.FC = () => {
  const { state, dispatch, getUndoableSnapshot } = useVisualizationContext();
  const { recordAction } = useUndoRedo();

  const { globalChartType, overlays: overlayConfigs, xAxisFields, yAxisFields, colorField, chartTypeParams } = state;
  const overlays: OverlayConfig[] = overlayConfigs ?? DEFAULT_OVERLAYS;

  // Resolve effective chart type: user-selected or auto-detected
  const chartType: UserChartType | undefined = useMemo(() => {
    if (globalChartType) return globalChartType;
    const xFields = xAxisFields as Field[];
    const yFields = yAxisFields as Field[];
    if (!xFields?.length && !yFields?.length) return undefined;

    const xCandidates = xFields.filter(
      (f) => f.type === 'measure' || (f.type === 'dimension' && f.flavour === 'continuous'),
    );
    const yCandidates = yFields.filter(
      (f) => f.type === 'measure' || (f.type === 'dimension' && f.flavour === 'continuous'),
    );

    if (xCandidates.length > 0 && yCandidates.length > 0) {
      const cellType: CellChartType = detectDefaultChartTypeForPair(xCandidates[0], yCandidates[0]);
      if (cellType === 'barX' || cellType === 'barY') return 'bar';
      if (cellType === 'tickX' || cellType === 'tickY') return 'tick';
      if (cellType === 'dot') return 'scatter';
      if (cellType === 'ganttX' || cellType === 'ganttY') return 'gantt';
      if (cellType === 'scatter' || cellType === 'line') return cellType;
      return undefined;
    }

    const analysis = analyzeFields(xFields, yFields);
    const xHasContinuousDim = analysis.xDimensions.some((d) => d.flavour === 'continuous');
    const yHasContinuousDim = analysis.yDimensions.some((d) => d.flavour === 'continuous');
    const hasMeasures = analysis.hasMeasure;

    if (!hasMeasures && (xHasContinuousDim || yHasContinuousDim)) return 'tick';
    if (hasMeasures) return 'bar';
    return 'scatter';
  }, [globalChartType, xAxisFields, yAxisFields]);

  // Determine which overlays apply to the current chart type
  const applicableMeta = OVERLAY_META.filter(
    m => chartType && m.applicableTo.has(chartType),
  );

  // Hide section entirely when no overlays are applicable
  if (applicableMeta.length === 0) return null;

  // Build lookup from config array
  const byType: Record<string, OverlayConfig> = {};
  for (const o of overlays) byType[o.type] = o;

  const hasDiscreteColor = lineColorSplitsSeries(
    colorField as Field | null,
    chartTypeParams.line.colorMode,
  );

  const handleToggle = (type: OverlayType, enabled: boolean) => {
    recordAction(getUndoableSnapshot());
    dispatch({ type: 'TOGGLE_OVERLAY', payload: { type, enabled } });
  };

  const handleUpdateParams = (type: OverlayType, params: Partial<OverlayParams>) => {
    dispatch({ type: 'UPDATE_OVERLAY_PARAMS', payload: { type, params } });
  };

  const handleUpdateOverlay = (type: OverlayType, config: Partial<Omit<OverlayConfig, 'type'>>) => {
    dispatch({ type: 'UPDATE_OVERLAY', payload: { type, config } });
  };

  return (
    <PropertySection
      title="Overlays"
      icon={<TimelineIcon sx={{ fontSize: 16 }} />}
      defaultExpanded={false}
      storageKey="ds-overlays-expanded"
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', py: 0.5, px: 0.75 }}>
        {applicableMeta.map(meta => {
          const config = byType[meta.type];
          const enabled = config?.enabled ?? false;
          const params = config?.params ?? {};
          const Controls = OVERLAY_CONTROLS[meta.type];
          const Icon = OVERLAY_ICONS[meta.type];

          return (
            <Box
              key={meta.type}
              sx={{
                border: enabled ? '1px solid rgba(0,0,0,0.18)' : undefined,
                borderBottom: enabled ? undefined : '1px solid #e0e0e0',
                borderRadius: enabled ? 2 : 0,
                overflow: enabled ? 'hidden' : 'visible',
                mb: enabled ? 0.75 : 0.5,
                backgroundColor: enabled ? '#fafafa' : 'transparent',
                boxShadow: enabled ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              }}
            >
              {/* Row header: icon + label + switch */}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  px: 0.75,
                  py: 0.3,
                  gap: 0.75,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                  <Icon
                    sx={{
                      fontSize: '1rem',
                      color: enabled ? 'primary.main' : 'text.disabled',
                      flexShrink: 0,
                    }}
                  />
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 500,
                      fontSize: '0.8rem',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      color: enabled ? 'text.primary' : 'text.secondary',
                    }}
                  >
                    {meta.label}
                  </Typography>
                </Box>
                <Switch
                  size="small"
                  checked={enabled}
                  onChange={(_, checked) => handleToggle(meta.type, checked)}
                  sx={{ flexShrink: 0 }}
                />
              </Box>
              {/* Controls: directly inside the card, visible when enabled */}
              {enabled && (
                <Box sx={{ px: 0.75, pb: 0.75, pt: 0 }}>
                  <Controls
                    params={params}
                    onUpdate={p => handleUpdateParams(meta.type, p)}
                    hasDiscreteColor={hasDiscreteColor}
                    hideSourceData={config?.hideSourceData}
                    onToggleHideSource={v => handleUpdateOverlay(meta.type, { hideSourceData: v })}
                  />
                </Box>
              )}
            </Box>
          );
        })}
      </Box>
    </PropertySection>
  );
};

export default OverlaysSection;
