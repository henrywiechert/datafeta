// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import * as Plot from '@observablehq/plot';
import { DEFAULT_CHART_COLOR } from '../../../config/chartLayoutConfig';
import type { Field, LineSeriesLabelMode, LineVariant } from '../../../types';
import { resolveColorForRow, type ColorScaleInfo } from '../../utils/colorSchemeUtils';
import { formatValue } from '../../utils/labelUtils';
import {
  createSeriesEndLabelMark,
  dropCollidingEndLabels,
  MAX_SERIES_LABELS,
} from '../../utils/seriesEndLabels';
import { lastRowPerSeries } from './dataPrep';
import type { LineMarkConfigs, LineOrientation } from './types';

const DEFAULT_LINE_DOT_RADIUS = 2;
const LINE_HOVER_DOT_RADIUS = 6;

export function createBaseMarkConfigs(params: {
  xColumn: string;
  yColumn: string;
  xLabel: string;
  yLabel: string;
  areaFillOpacity: number;
}): LineMarkConfigs {
  const { xColumn, yColumn, xLabel, yLabel, areaFillOpacity } = params;

  return {
    lineConfig: { x: xColumn, y: yColumn },
    areaConfig: { x: xColumn, y: yColumn, fillOpacity: areaFillOpacity },
    dotConfig: {
      x: { value: xColumn, label: xLabel },
      y: { value: yColumn, label: yLabel },
      r: DEFAULT_LINE_DOT_RADIUS,
      channels: {
        [xLabel]: { value: xColumn, label: xLabel },
        [yLabel]: { value: yColumn, label: yLabel }
      }
    },
  };
}

export function createHoverDotConfig(params: {
  xColumn: string;
  yColumn: string;
  colorColumnName?: string;
}): any {
  const { xColumn, yColumn, colorColumnName } = params;

  return {
    x: xColumn,
    y: yColumn,
    r: LINE_HOVER_DOT_RADIUS,
    fill: 'transparent',
    stroke: 'transparent',
    strokeWidth: 0,
    ...(colorColumnName ? { z: colorColumnName } : {}),
  };
}

export function buildAreaMarks(params: {
  variant: LineVariant;
  orientation: LineOrientation;
  budgetedSorted: any[];
  seriesGroups?: Map<string, any[]>;
  areaConfig: any;
  colorField?: Field;
  colorInfo: ColorScaleInfo | null;
  manualColor?: string;
}): any[] {
  const { variant, orientation, budgetedSorted, seriesGroups, areaConfig, colorField, colorInfo, manualColor } = params;

  if (variant !== 'area') return [];

  if (colorField && seriesGroups && (colorInfo?.kind === 'categorical' || colorInfo?.kind === 'seriesGradient')) {
    return Array.from(seriesGroups.values()).map((seriesRows) => {
      const seriesFill = resolveColorForRow(
        seriesRows[0],
        colorInfo,
        colorField,
        manualColor || DEFAULT_CHART_COLOR,
      );
      const seriesAreaConfig = {
        ...areaConfig,
        fill: seriesFill,
        z: undefined,
      };
      return orientation === 'horizontal'
        ? Plot.areaY(seriesRows, seriesAreaConfig)
        : Plot.areaX(seriesRows, seriesAreaConfig);
    });
  }

  return [
    orientation === 'horizontal'
      ? Plot.areaY(budgetedSorted, areaConfig)
      : Plot.areaX(budgetedSorted, areaConfig),
  ];
}

/**
 * One label per line, anchored at the series' last point.
 * 'end' places it in the padded gutter past the line; 'endInside' keeps it
 * within the data area for axes that cannot be padded.
 *
 * Labels that provably collide on the dependent axis are dropped here; the
 * remaining pixel-level overlap is resolved by the renderer's de-overlap pass.
 */
export function buildSeriesEndLabelMarks(params: {
  mode: LineSeriesLabelMode;
  orientation: LineOrientation;
  seriesGroups?: Map<string, any[]>;
  xColumn: string;
  yColumn: string;
  dependentColumn: string;
  dependentDomain?: [number, number] | [Date, Date];
  colorColumnName?: string;
  colorField?: Field;
  colorInfo: ColorScaleInfo | null;
  fallbackColor: string;
  fontSize?: number;
}): any[] {
  const {
    mode, orientation, seriesGroups, xColumn, yColumn,
    dependentColumn, dependentDomain,
    colorColumnName, colorField, colorInfo, fallbackColor, fontSize,
  } = params;

  if (mode === 'off' || !seriesGroups || !colorColumnName || !colorField) return [];
  if (colorInfo?.kind !== 'categorical' && colorInfo?.kind !== 'seriesGradient') return [];
  if (seriesGroups.size === 0 || seriesGroups.size > MAX_SERIES_LABELS) return [];

  const endRows = dropCollidingEndLabels({
    endRows: lastRowPerSeries(seriesGroups),
    dependentColumn,
    dependentDomain,
  });
  if (endRows.length === 0) return [];

  return [
    createSeriesEndLabelMark({
      endRows,
      placement: mode,
      orientation,
      xColumn,
      yColumn,
      getText: (d: any) => formatValue(d[colorColumnName]),
      getFill: (d: any) => resolveColorForRow(d, colorInfo, colorField, fallbackColor),
      fontSize,
    }),
  ];
}

/** Label texts for the series that will actually be labelled, for gutter sizing. */
export function seriesEndLabelTexts(params: {
  seriesGroups?: Map<string, any[]>;
  colorColumnName?: string;
  dependentColumn: string;
  dependentDomain?: [number, number] | [Date, Date];
}): string[] {
  const { seriesGroups, colorColumnName, dependentColumn, dependentDomain } = params;
  if (!seriesGroups || !colorColumnName) return [];
  if (seriesGroups.size === 0 || seriesGroups.size > MAX_SERIES_LABELS) return [];

  return dropCollidingEndLabels({
    endRows: lastRowPerSeries(seriesGroups),
    dependentColumn,
    dependentDomain,
  }).map((row) => formatValue(row[colorColumnName]));
}
