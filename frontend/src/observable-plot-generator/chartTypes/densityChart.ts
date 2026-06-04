// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import * as Plot from '@observablehq/plot';
import { DEFAULT_CHART_COLOR } from '../../config/chartLayoutConfig';
import { DEFAULT_DENSITY_PARAMS, DensityParams, Field } from '../../types';
import { getResultColumnName } from '../../utils/fieldUtils';
import { computeKde1d, Kde1dPoint } from '../../utils/kde1d';
import { ColorScaleInfo, buildPlotColorScaleOptions, deriveColorScaleInfo } from '../utils/colorSchemeUtils';

export interface DensityBuildParams {
  data: any[];
  valueColumn: string;
  valueLabel: string;
  colorField?: Field;
  colorScheme?: string;
  colorBias?: number;
  colorReversed?: boolean;
  manualColor?: string;
  densityParams?: DensityParams;
  colorScaleInfo?: ColorScaleInfo | null;
}

interface DensitySeries {
  points: Kde1dPoint[];
  stroke?: string;
  category?: any;
}

function resolveKdeOptions(params: Required<Pick<DensityParams, 'bandwidth' | 'thresholds'>>) {
  // Bandwidth slider (default 20) acts as a smoothing multiplier on Scott's rule.
  const bandwidthMultiplier = params.bandwidth / 20;
  // Thresholds slider controls curve resolution (points along x).
  const points = Math.max(30, params.thresholds * 5);
  return { bandwidthMultiplier, points };
}

function buildDensitySeries(
  data: any[],
  valueColumn: string,
  colorField: Field | undefined,
  colorColumnName: string | undefined,
  kdeOptions: ReturnType<typeof resolveKdeOptions>,
): DensitySeries[] {
  if (colorField?.flavour === 'discrete' && colorColumnName) {
    const groups = new Map<any, any[]>();
    for (const row of data) {
      const cat = row[colorColumnName];
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(row);
    }
    return Array.from(groups.entries()).map(([category, rows]) => ({
      category,
      stroke: colorColumnName,
      points: computeKde1d(
        rows.map((row) => row[valueColumn] as number),
        kdeOptions,
      ),
    }));
  }

  return [{
    points: computeKde1d(
      data.map((row) => row[valueColumn] as number),
      kdeOptions,
    ),
  }];
}

function buildSeriesMarks(
  series: DensitySeries[],
  params: Required<Pick<DensityParams, 'filled' | 'opacity' | 'strokeWidth'>>,
  fallbackColor: string,
  colorColumnName?: string,
): Plot.Markish[] {
  const { filled, opacity, strokeWidth } = params;
  const marks: Plot.Markish[] = [];

  if (colorColumnName) {
    const curveData = series.flatMap((s) =>
      s.points.map((p) => ({ ...p, [colorColumnName]: s.category })),
    );
    if (curveData.length === 0) return marks;

    marks.push(Plot.line(curveData, {
      x: 'x',
      y: 'y',
      stroke: colorColumnName,
      strokeWidth,
      z: colorColumnName,
      className: 'overlay-no-tooltip',
    }));

    if (filled) {
      marks.push(Plot.areaY(curveData, {
        x: 'x',
        y: 'y',
        fill: colorColumnName,
        fillOpacity: opacity,
        z: colorColumnName,
        className: 'overlay-no-tooltip',
      }));
    }
    return marks;
  }

  for (const s of series) {
    if (s.points.length === 0) continue;
    marks.push(Plot.line(s.points, {
      x: 'x',
      y: 'y',
      stroke: fallbackColor,
      strokeWidth,
      className: 'overlay-no-tooltip',
    }));

    if (filled) {
      marks.push(Plot.areaY(s.points, {
        x: 'x',
        y: 'y',
        fill: fallbackColor,
        fillOpacity: opacity,
        className: 'overlay-no-tooltip',
      }));
    }
  }

  return marks;
}

/**
 * Build Observable Plot options for a pairplot-style 1D KDE curve.
 * X-axis: field values; Y-axis: estimated density (smooth line/area).
 */
export function buildDensityOptions(params: DensityBuildParams): Plot.PlotOptions {
  const {
    data,
    valueColumn,
    valueLabel,
    colorField,
    colorScheme,
    colorBias,
    colorReversed,
    manualColor,
    densityParams,
    colorScaleInfo,
  } = params;

  const resolvedParams = {
    bandwidth: densityParams?.bandwidth ?? DEFAULT_DENSITY_PARAMS.bandwidth!,
    thresholds: densityParams?.thresholds ?? DEFAULT_DENSITY_PARAMS.thresholds!,
    filled: densityParams?.filled ?? DEFAULT_DENSITY_PARAMS.filled!,
    opacity: densityParams?.opacity ?? DEFAULT_DENSITY_PARAMS.opacity!,
    strokeWidth: densityParams?.strokeWidth ?? DEFAULT_DENSITY_PARAMS.strokeWidth!,
  };

  const clean = data.filter((row) => Number.isFinite(row[valueColumn]));

  if (clean.length === 0) {
    return {
      marks: [
        Plot.text([data.length > 0 ? 'No numeric values for density estimate' : 'No data available.'], {
          frameAnchor: 'middle',
          fontSize: 14,
          fill: 'gray',
        }),
      ],
    };
  }

  const colorColumnName = colorField ? getResultColumnName(colorField) : undefined;
  const colorInfo = colorField
    ? colorScaleInfo || deriveColorScaleInfo(clean, colorField, colorScheme, colorBias, colorReversed)
    : null;
  const fallbackColor = manualColor || DEFAULT_CHART_COLOR;

  const kdeOptions = resolveKdeOptions(resolvedParams);
  const series = buildDensitySeries(clean, valueColumn, colorField, colorColumnName, kdeOptions);

  const allPoints = series.flatMap((s) => s.points);
  if (allPoints.length === 0) {
    return {
      marks: [
        Plot.text(['Unable to compute density curve'], {
          frameAnchor: 'middle',
          fontSize: 14,
          fill: 'gray',
        }),
      ],
    };
  }

  const xMin = Math.min(...allPoints.map((p) => p.x));
  const xMax = Math.max(...allPoints.map((p) => p.x));
  const yMax = Math.max(...allPoints.map((p) => p.y));

  const plotOptions: Plot.PlotOptions = {
    x: {
      label: valueLabel,
      grid: true,
      domain: [xMin, xMax],
    } as any,
    y: {
      label: 'Density',
      grid: true,
      domain: [0, yMax * 1.05],
      tickFormat: () => '',
    } as any,
    marks: buildSeriesMarks(
      series,
      resolvedParams,
      fallbackColor,
      colorField?.flavour === 'discrete' ? colorColumnName : undefined,
    ),
  };

  if (colorField) {
    const colorScale = buildPlotColorScaleOptions(colorField, colorInfo);
    if (colorScale) plotOptions.color = colorScale as any;
  }

  return plotOptions;
}
