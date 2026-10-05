// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { useMemo } from 'react';
import { useVisualizationContext } from './useVisualizationContext';
import { Channels } from '../../types/channels';
import { isEffectiveLineChart } from '../../utils/effectiveChartType';

/**
 * Selector hook that assembles the grouped Channels object from the flat
 * VisualizationState. The returned reference is stable (via useMemo) as long
 * as no channel value changes, so consumers can list `channels` as a single
 * dependency instead of ~16 individual state fields.
 *
 * The flat VisualizationState and its reducer remain unchanged.
 *
 * The line-style field only reaches the channels while the sheet renders as a
 * line chart. It stays in state (so switching back restores it) but is not
 * queried, drawn or shown in a legend for other chart types.
 */
export function useChannels(): Channels {
  const { state } = useVisualizationContext();
  const lineChart = isEffectiveLineChart(state);

  return useMemo<Channels>(() => ({
    color: {
      field: state.colorField,
      scheme: state.colorScheme,
      bias: state.colorBias,
      reversed: state.colorReversed ?? false,
      manual: state.manualColor,
    },
    size: {
      field: state.sizeField,
      range: state.sizeRange,
      manual: state.manualSize,
      bandThicknessScale: state.bandThicknessScale,
    },
    shape: {
      field: state.shapeField,
      manual: state.manualShape,
    },
    lineStyle: {
      field: lineChart ? state.lineStyleField : null,
      manual: state.manualLineStyle,
    },
    label: {
      fields: state.labelFields,
      enabled: state.labelsEnabled,
      samplingStrategy: state.labelSamplingStrategy,
      samplingThreshold: state.labelSamplingThreshold,
      sampleEvery: state.labelSampleEvery,
      fontSize: state.labelFontSize,
    },
    tooltip: {
      fields: state.tooltipFields,
    },
    facetBackground: {
      field: state.facetBackgroundField,
      scheme: state.facetBackgroundScheme,
      opacity: state.facetBackgroundOpacity,
    },
  }), [
    state.colorField, state.colorScheme, state.colorBias, state.colorReversed, state.manualColor,
    state.sizeField, state.sizeRange, state.manualSize, state.bandThicknessScale,
    state.shapeField, state.manualShape,
    lineChart, state.lineStyleField, state.manualLineStyle,
    state.labelFields, state.labelsEnabled, state.labelSamplingStrategy,
    state.labelSamplingThreshold, state.labelSampleEvery, state.labelFontSize,
    state.tooltipFields,
    state.facetBackgroundField, state.facetBackgroundScheme, state.facetBackgroundOpacity,
  ]);
}
