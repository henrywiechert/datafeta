// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * DensityParametersSection
 *
 * Inline KDE parameter controls shown when the density chart type is active.
 */

import React from 'react';
import { Box, Slider, Switch, Typography } from '@mui/material';
import { useVisualizationContext } from '../../../contexts/VisualizationContext';
import { DEFAULT_DENSITY_PARAMS, DensityParams } from '../../../types';

const InlineColorPicker: React.FC<{ value: string; onChange: (c: string) => void }> = ({ value, onChange }) => (
  <Box sx={{ display: 'inline-flex', alignItems: 'center' }}>
    <input
      type="color"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ width: 22, height: 22, border: 'none', padding: 0, cursor: 'pointer', background: 'none' }}
    />
  </Box>
);

const DensityParametersSection: React.FC = () => {
  const { state, dispatch } = useVisualizationContext();
  const params = state.densityParams || DEFAULT_DENSITY_PARAMS;
  const hasDiscreteColor = state.colorField?.flavour === 'discrete';

  const update = (partial: Partial<DensityParams>) => {
    dispatch({ type: 'UPDATE_DENSITY_PARAMS', payload: partial });
  };

  const filled = params.filled ?? DEFAULT_DENSITY_PARAMS.filled!;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="caption" sx={{ minWidth: 72 }}>Smoothing</Typography>
          <Slider
            size="small"
            min={5}
            max={100}
            step={5}
            value={params.bandwidth ?? DEFAULT_DENSITY_PARAMS.bandwidth!}
            onChange={(_, v) => update({ bandwidth: v as number })}
            valueLabelDisplay="auto"
            sx={{ flex: 1 }}
          />
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="caption" sx={{ minWidth: 72 }}>Resolution</Typography>
          <Slider
            size="small"
            min={3}
            max={30}
            step={1}
            value={params.thresholds ?? DEFAULT_DENSITY_PARAMS.thresholds!}
            onChange={(_, v) => update({ thresholds: v as number })}
            valueLabelDisplay="auto"
            sx={{ flex: 1 }}
          />
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="caption" sx={{ minWidth: 72 }}>Line (px)</Typography>
          <Slider
            size="small"
            min={0.5}
            max={4}
            step={0.5}
            value={params.strokeWidth ?? DEFAULT_DENSITY_PARAMS.strokeWidth!}
            onChange={(_, v) => update({ strokeWidth: v as number })}
            valueLabelDisplay="auto"
            sx={{ flex: 1 }}
          />
          {!hasDiscreteColor && (
            <InlineColorPicker
              value={state.manualColor || '#4e79a7'}
              onChange={(color) => dispatch({ type: 'SET_MANUAL_COLOR', payload: color })}
            />
          )}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="caption">Filled</Typography>
          <Switch
            size="small"
            checked={filled}
            onChange={(_, v) => update({ filled: v })}
          />
        </Box>
        {filled && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="caption" sx={{ minWidth: 72 }}>Opacity</Typography>
            <Slider
              size="small"
              min={0.05}
              max={0.8}
              step={0.05}
              value={params.opacity ?? DEFAULT_DENSITY_PARAMS.opacity!}
              onChange={(_, v) => update({ opacity: v as number })}
              valueLabelDisplay="auto"
              valueLabelFormat={(v) => `${Math.round(v * 100)}%`}
              sx={{ flex: 1 }}
            />
          </Box>
        )}
        {hasDiscreteColor && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.25 }}>
            Each color group gets its own smoothed density curve.
          </Typography>
        )}
    </Box>
  );
};

export default DensityParametersSection;
