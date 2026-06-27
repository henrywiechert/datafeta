// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import * as Plot from '@observablehq/plot';
import { DEFAULT_CHART_COLOR } from '../../../config/chartLayoutConfig';
import type { Field } from '../../../types';
import { getFieldDisplayName, getResultColumnName } from '../../../utils/fieldUtils';
import { createSizeScale } from '../../utils/sizeUtils';
import { resolveColorForRow, type ColorScaleInfo } from '../../utils/colorSchemeUtils';

const DEFAULT_LINE_STROKE_WIDTH = 2;

export function applyLineSizeEncoding(params: {
  lineConfig: any;
  dotConfig: any;
  budgetedSorted: any[];
  sizeField?: Field;
  sizeRange?: [number, number];
  manualSize?: number;
  sizeScaleData?: any[];
}): void {
  const { lineConfig, dotConfig, budgetedSorted, sizeField, sizeRange, manualSize, sizeScaleData } = params;

  if (sizeField && sizeRange) {
    const sizeScale = createSizeScale(sizeScaleData ?? budgetedSorted, sizeField, sizeRange, manualSize || DEFAULT_LINE_STROKE_WIDTH);
    const sizeColumnName = getResultColumnName(sizeField);
    lineConfig.strokeWidth = (d: any) => sizeScale.getSizeForValue(d[sizeColumnName]);
    dotConfig.channels[sizeField.columnName] = { value: sizeColumnName, label: getFieldDisplayName(sizeField) };
  } else {
    lineConfig.strokeWidth = manualSize || DEFAULT_LINE_STROKE_WIDTH;
  }
}

export function applyLineColorEncoding(params: {
  lineConfig: any;
  areaConfig: any;
  dotConfig: any;
  colorField?: Field;
  colorInfo: ColorScaleInfo | null;
  colorColumnName?: string;
  colorBias?: number;
  manualColor?: string;
}): { scale: ColorScaleInfo | null; field?: Field; fallbackColor: string } {
  const {
    lineConfig,
    areaConfig,
    dotConfig,
    colorField,
    colorInfo,
    colorColumnName,
    colorBias,
    manualColor,
  } = params;
  const fallbackColor = manualColor || DEFAULT_CHART_COLOR;

  if (colorField && colorInfo) {
    dotConfig.channels[colorField.columnName] = { value: colorColumnName, label: getFieldDisplayName(colorField) };

    if (colorInfo.kind === 'seriesGradient') {
      const strokeForRow = (d: any) => resolveColorForRow(d, colorInfo, colorField, fallbackColor);
      dotConfig.fill = strokeForRow;
      lineConfig.stroke = strokeForRow;
      areaConfig.fill = strokeForRow;
      lineConfig.z = colorColumnName;
      areaConfig.z = colorColumnName;
    } else if (colorInfo.kind === 'continuous') {
      // Apply bias transformation to continuous values
      if (colorBias !== undefined && colorBias !== 0) {
        const [min, max] = colorInfo.domain as [number, number];
        const range_val = max - min;
        const exponent = Math.pow(2, -colorBias);
        
        const transformValue = (d: any) => {
          const value = d[colorColumnName!];
          if (value == null) return null;
          const t = (value - min) / range_val;
          const transformedT = Math.pow(Math.max(0, Math.min(1, t)), exponent);
          return min + transformedT * range_val;
        };
        
        dotConfig.fill = transformValue;
        lineConfig.stroke = transformValue;
        areaConfig.fill = transformValue;
        lineConfig.z = null;
        areaConfig.z = null;
      } else if (colorInfo.accessor) {
        dotConfig.fill = (d: any) => colorInfo.accessor?.(d) ?? null;
        lineConfig.stroke = (d: any) => colorInfo.accessor?.(d) ?? null;
        areaConfig.fill = (d: any) => colorInfo.accessor?.(d) ?? null;
        lineConfig.z = null;
        areaConfig.z = null;
      } else {
        lineConfig.stroke = colorColumnName;
        lineConfig.z = colorColumnName;
        areaConfig.fill = colorColumnName;
        areaConfig.z = colorColumnName;
        dotConfig.fill = colorColumnName;
      }
    } else {
      // For discrete color: use column name and group by z value
      lineConfig.stroke = colorColumnName;
      lineConfig.z = colorColumnName;
      areaConfig.fill = colorColumnName;
      areaConfig.z = colorColumnName;
      dotConfig.fill = colorColumnName;
    }
  } else {
    // When there's no color field, fall back to a single manual color if provided
    lineConfig.stroke = fallbackColor;
    areaConfig.fill = fallbackColor;
    dotConfig.fill = fallbackColor;
  }

  return {
    scale: colorInfo,
    field: colorField,
    fallbackColor,
  };
}

export function attachLineColorScale(params: {
  plotOptions: Plot.PlotOptions;
  colorField?: Field;
  colorInfo: ColorScaleInfo | null;
}): void {
  const { plotOptions, colorField, colorInfo } = params;

  if (!colorField || !colorInfo) return;

  if (colorInfo.kind === 'continuous' || colorInfo.kind === 'seriesGradient') {
    plotOptions.color = {
      type: 'linear',
      domain: colorInfo.domain as [number, number],
      range: colorInfo.range,
      clamp: true,
      label: getFieldDisplayName(colorField),
    } as any;
  } else {
    plotOptions.color = {
      type: 'ordinal' as any,
      domain: colorInfo.domain as any[],
      range: colorInfo.range,
      label: getFieldDisplayName(colorField),
    } as any;
  }
}
