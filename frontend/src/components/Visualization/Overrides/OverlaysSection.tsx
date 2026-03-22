/**
 * OverlaysSection
 *
 * Collapsible section in the Overrides panel that shows overlay toggles
 * (regression, moving average, Bollinger bands) with inline parameter controls.
 * Only rendered when the active chart type supports at least one overlay.
 *
 * Self-contained: reads and dispatches to VisualizationContext directly.
 */

import React from 'react';
import { Box, Checkbox, FormControlLabel, Slider, Select, MenuItem, Typography, TextField, Collapse } from '@mui/material';
import TimelineIcon from '@mui/icons-material/Timeline';
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
import { UserChartType } from '../../../types';

// --- Color picker (tiny inline swatch + native input) -----------------------

const InlineColorPicker: React.FC<{ value: string; onChange: (c: string) => void }> = ({ value, onChange }) => (
  <Box sx={{ display: 'inline-flex', alignItems: 'center', ml: 1 }}>
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
}> = ({ params, onUpdate }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mt: 0.5 }}>
    <Typography variant="caption" sx={{ minWidth: 18 }}>CI</Typography>
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
    <InlineColorPicker value={params.color ?? '#e15759'} onChange={c => onUpdate({ color: c })} />
  </Box>
);

const MovingAverageControls: React.FC<{
  params: OverlayParams;
  onUpdate: (p: Partial<OverlayParams>) => void;
}> = ({ params, onUpdate }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mt: 0.5 }}>
    <Typography variant="caption" sx={{ minWidth: 46 }}>Window</Typography>
    <TextField
      type="number"
      size="small"
      variant="standard"
      inputProps={{ min: 2, max: 200, style: { width: 40, fontSize: 12, textAlign: 'center' } }}
      value={params.windowSize ?? 20}
      onChange={e => {
        const v = parseInt(e.target.value, 10);
        if (v >= 2 && v <= 200) onUpdate({ windowSize: v });
      }}
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
    <InlineColorPicker value={params.color ?? '#4e79a7'} onChange={c => onUpdate({ color: c })} />
  </Box>
);

const BollingerControls: React.FC<{
  params: OverlayParams;
  onUpdate: (p: Partial<OverlayParams>) => void;
}> = ({ params, onUpdate }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mt: 0.5 }}>
    <Typography variant="caption" sx={{ minWidth: 46 }}>Window</Typography>
    <TextField
      type="number"
      size="small"
      variant="standard"
      inputProps={{ min: 2, max: 200, style: { width: 40, fontSize: 12, textAlign: 'center' } }}
      value={params.windowSize ?? 20}
      onChange={e => {
        const v = parseInt(e.target.value, 10);
        if (v >= 2 && v <= 200) onUpdate({ windowSize: v });
      }}
    />
    <Typography variant="caption" sx={{ minWidth: 18 }}>±σ</Typography>
    <Slider
      size="small"
      min={1}
      max={3}
      step={0.5}
      value={params.bandWidth ?? 2}
      onChange={(_, v) => onUpdate({ bandWidth: v as number })}
      valueLabelDisplay="auto"
      sx={{ flex: 1, minWidth: 50 }}
    />
    <InlineColorPicker value={params.color ?? '#59a14f'} onChange={c => onUpdate({ color: c })} />
  </Box>
);

const OVERLAY_CONTROLS: Record<OverlayType, React.FC<{ params: OverlayParams; onUpdate: (p: Partial<OverlayParams>) => void }>> = {
  linearRegression: RegressionControls,
  movingAverage: MovingAverageControls,
  bollingerBands: BollingerControls,
};

// --- Main section component --------------------------------------------------

const OverlaysSection: React.FC = () => {
  const { state, dispatch, getUndoableSnapshot } = useVisualizationContext();
  const { recordAction } = useUndoRedo();

  const { globalChartType, overlays: overlayConfigs } = state;
  const overlays: OverlayConfig[] = overlayConfigs ?? DEFAULT_OVERLAYS;
  const chartType: UserChartType | undefined = globalChartType ?? undefined;

  // Determine which overlays apply to the current chart type
  const applicableMeta = OVERLAY_META.filter(
    m => chartType && m.applicableTo.has(chartType),
  );

  // Hide section entirely when no overlays are applicable
  if (applicableMeta.length === 0) return null;

  // Build lookup from config array
  const byType: Record<string, OverlayConfig> = {};
  for (const o of overlays) byType[o.type] = o;

  const handleToggle = (type: OverlayType, enabled: boolean) => {
    recordAction(getUndoableSnapshot());
    dispatch({ type: 'TOGGLE_OVERLAY', payload: { type, enabled } });
  };

  const handleUpdateParams = (type: OverlayType, params: Partial<OverlayParams>) => {
    dispatch({ type: 'UPDATE_OVERLAY_PARAMS', payload: { type, params } });
  };

  return (
    <PropertySection
      title="Overlays"
      icon={<TimelineIcon sx={{ fontSize: 16 }} />}
      defaultExpanded={false}
      storageKey="ds-overlays-expanded"
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, py: 0.5, px: 0.75 }}>
        {applicableMeta.map(meta => {
          const config = byType[meta.type];
          const enabled = config?.enabled ?? false;
          const params = config?.params ?? {};
          const Controls = OVERLAY_CONTROLS[meta.type];

          return (
            <Box key={meta.type}>
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={enabled}
                    onChange={(_, checked) => handleToggle(meta.type, checked)}
                    sx={{ py: 0.25 }}
                  />
                }
                label={<Typography variant="body2" sx={{ fontSize: 12 }}>{meta.label}</Typography>}
                sx={{ ml: -0.25, mb: 0 }}
              />
              <Collapse in={enabled} unmountOnExit>
                <Box sx={{ pl: 3.5, pr: 0.5, pb: 0.75 }}>
                  <Controls params={params} onUpdate={p => handleUpdateParams(meta.type, p)} />
                </Box>
              </Collapse>
            </Box>
          );
        })}
      </Box>
    </PropertySection>
  );
};

export default OverlaysSection;
