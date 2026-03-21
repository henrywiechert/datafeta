import * as Plot from '@observablehq/plot';
import { DEFAULT_CHART_COLOR } from '../../config/chartLayoutConfig';
import { Field } from '../../types';
import { getResultColumnName, getFieldDisplayName } from '../../utils/fieldUtils';
import { deriveColorScaleInfo } from '../utils/colorSchemeUtils';
import { createTooltipFieldsGetter } from '../utils/tooltipUtils';

/**
 * Column naming convention for CDF query results:
 *   value column  = the original column name (e.g., "revenue")
 *   cdf column    = "<column>__cdf"  (e.g., "revenue__cdf")
 */
export const CDF_SUFFIX = '__cdf';

export interface CdfBuildParams {
  data: any[];
  /** The raw-value column coming from the CDF query */
  valueColumn: string;
  /** Display name for the value axis */
  valueLabel: string;
  /** Discrete color field for multi-curve CDF (PARTITION BY) */
  colorField?: Field;
  colorScheme?: string;
  colorBias?: number;
  manualColor?: string;
  /** Line stroke width (defaults to 2) */
  manualSize?: number;
  tooltipFields?: Field[];
  facetFields?: Field[];
}

/**
 * Build Observable Plot options for a single CDF curve (or family of curves
 * when a discrete color field partitions the data).
 *
 * X-axis: sorted measure values
 * Y-axis: cumulative probability [0, 1]
 */
export function buildCdfOptions(params: CdfBuildParams): Plot.PlotOptions {
  const {
    data,
    valueColumn,
    valueLabel,
    colorField,
    colorScheme,
    colorBias,
    manualColor,
    manualSize,
    tooltipFields,
    facetFields,
  } = params;

  const cdfColumn = `${valueColumn}${CDF_SUFFIX}`;

  // Check whether the data actually contains CDF result columns.
  // When the user switches to CDF mode the chart renders immediately with
  // the stale (non-CDF) query result while the new CDF query is in flight.
  const hasCdfColumns =
    Array.isArray(data) &&
    data.length > 0 &&
    cdfColumn in data[0];

  if (!hasCdfColumns) {
    const message = data.length > 0
      ? 'Waiting for CDF query…'
      : 'No data available.';
    return {
      marks: [
        Plot.text([message], {
          frameAnchor: 'middle',
          fontSize: 14,
          fill: 'gray',
        }),
      ],
    };
  }

  const clean = data.filter(
    d => Number.isFinite(d[valueColumn]) && Number.isFinite(d[cdfColumn]),
  );

  if (clean.length === 0) {
    return {
      x: { label: valueLabel, grid: true } as any,
      y: { label: 'Cumulative Distribution', domain: [0, 1], grid: true } as any,
      marks: [],
    };
  }

  // Compute explicit X domain from data so Observable Plot never falls
  // back to a default [0, 1] range.
  let xDomain: [number, number] | undefined;
  const xVals = clean.map(d => d[valueColumn] as number);
  const xMin = Math.min(...xVals);
  const xMax = Math.max(...xVals);
  if (Number.isFinite(xMin) && Number.isFinite(xMax)) {
    xDomain = [xMin, xMax];
  }

  const lineConfig: any = { x: valueColumn, y: cdfColumn };
  const dotConfig: any = {
    x: { value: valueColumn, label: valueLabel },
    y: { value: cdfColumn, label: 'CDF' },
    r: 2,
    channels: {
      [valueLabel]: { value: valueColumn, label: valueLabel },
      CDF: { value: cdfColumn, label: 'CDF' },
    },
  };

  const colorColumnName = colorField
    ? getResultColumnName(colorField)
    : undefined;
  const colorInfo = colorField
    ? deriveColorScaleInfo(clean, colorField, colorScheme, colorBias)
    : null;

  if (colorField && colorInfo && colorColumnName) {
    dotConfig.channels[colorField.columnName] = {
      value: colorColumnName,
      label: getFieldDisplayName(colorField),
    };
    lineConfig.stroke = colorColumnName;
    lineConfig.z = colorColumnName;
    dotConfig.fill = colorColumnName;
  } else {
    const fallbackColor = manualColor || DEFAULT_CHART_COLOR;
    lineConfig.stroke = fallbackColor;
    dotConfig.fill = fallbackColor;
  }

  lineConfig.strokeWidth = manualSize || 2;

  const hoverDotConfig: any = {
    x: valueColumn,
    y: cdfColumn,
    r: 6,
    fill: 'transparent',
    stroke: 'transparent',
    strokeWidth: 0,
  };

  const plotOptions: Plot.PlotOptions = {
    x: {
      label: valueLabel,
      grid: true,
      ...(xDomain ? { domain: xDomain } : {}),
    } as any,
    y: {
      label: 'Cumulative Distribution',
      domain: [0, 1],
      grid: true,
      tickFormat: (d: number) => `${(d * 100).toFixed(0)}%`,
    } as any,
    marks: [
      Plot.line(clean, lineConfig),
      Plot.dot(clean, dotConfig),
      Plot.dot(clean, hoverDotConfig),
    ],
  };

  if (colorField && colorInfo) {
    if (colorInfo.kind === 'continuous') {
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

  (plotOptions as any).__customTooltip = {
    enabled: true,
    data: clean,
    getFields: createTooltipFieldsGetter(
      [
        { label: valueLabel, column: valueColumn },
        { label: 'CDF', column: cdfColumn },
      ],
      colorField,
      undefined,
      tooltipFields,
      undefined,
      facetFields,
    ),
  };

  return plotOptions;
}
