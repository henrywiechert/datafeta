// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import * as Plot from '@observablehq/plot';
import { DEFAULT_CHART_COLOR } from '../../../config/chartLayoutConfig';
import type { Field, LineVariant } from '../../../types';
import { resolveColorForRow, type ColorScaleInfo } from '../../utils/colorSchemeUtils';
import { groupRowsByColorSeries } from './dataPrep';
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
  areaConfig: any;
  colorField?: Field;
  colorInfo: ColorScaleInfo | null;
  colorColumnName?: string;
  manualColor?: string;
}): any[] {
  const { variant, orientation, budgetedSorted, areaConfig, colorField, colorInfo, colorColumnName, manualColor } = params;

  if (variant !== 'area') return [];

  if (colorField && (colorInfo?.kind === 'categorical' || colorInfo?.kind === 'seriesGradient') && colorColumnName) {
    const seriesGroups = groupRowsByColorSeries(budgetedSorted, colorColumnName);

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
