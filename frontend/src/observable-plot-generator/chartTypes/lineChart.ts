import * as Plot from '@observablehq/plot';
import { DEFAULT_CHART_COLOR } from '../../config/chartLayoutConfig';
import { Field } from '../../types';
import { getResultColumnName } from '../../utils/fieldUtils';
import { deriveColorScaleInfo } from '../utils/colorSchemeUtils';
import { createSizeScale } from '../utils/sizeUtils';

/**
 * Line chart for continuous dimension on one axis and continuous measure on the other.
 * xColumn/yColumn are data column names in the query result to use.
 */
export function lineChart(
  data: any[],
  xColumn: string,
  yColumn: string,
  labels?: { x?: string; y?: string },
  domain?: { x?: [number, number] | [Date, Date]; y?: [number, number] | [Date, Date] },
  colorField?: Field,
  colorScheme?: string,
  sizeField?: Field,
  sizeRange?: [number, number],
  manualSize?: number
): Plot.PlotOptions {
  // Filter to finite numeric values for y; x may be numeric or datetime/ordinal
  const clean = Array.isArray(data)
    ? data.filter((d) => Number.isFinite(d[yColumn]))
    : [];

  if (clean.length === 0) {
    return {
      x: { label: labels?.x || xColumn, domainKey: xColumn, grid: true } as any,
      y: { label: labels?.y || yColumn, domainKey: yColumn, grid: true } as any,
      marks: [],
    };
  }

  // Ensure the line flows left-to-right by sorting by the X dimension
  const toComparable = (v: any): number | string | null => {
    if (v instanceof Date) return v.getTime();
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      const num = Number.parseFloat(v);
      if (Number.isFinite(num)) return num;
      const ts = Date.parse(v);
      if (!Number.isNaN(ts)) return ts;
      return v; // fallback lexical
    }
    return null;
  };
  const cleanSorted = clean.slice().sort((a, b) => {
    const ax = toComparable(a[xColumn]);
    const bx = toComparable(b[xColumn]);
    if (ax == null && bx == null) return 0;
    if (ax == null) return 1;
    if (bx == null) return -1;
    if (typeof ax === 'string' || typeof bx === 'string') return String(ax).localeCompare(String(bx));
    return (ax as number) - (bx as number);
  });

  const xLabel = labels?.x || xColumn;
  const yLabel = labels?.y || yColumn;
  const lineConfig: any = { x: xColumn, y: yColumn };
  const dotConfig: any = {
    x: { value: xColumn, label: xLabel },
    y: { value: yColumn, label: yLabel },
    r: 2,
    channels: {
      [xLabel]: { value: xColumn, label: xLabel },
      [yLabel]: { value: yColumn, label: yLabel }
    }
  };
  const colorInfo = colorField ? deriveColorScaleInfo(cleanSorted, colorField, colorScheme) : null;
  const colorColumnName = colorField ? getResultColumnName(colorField) : undefined;

  if (colorField && colorInfo) {
    dotConfig.channels[colorField.columnName] = { value: colorColumnName, label: colorField.columnName };

    if (colorInfo.kind === 'continuous' && colorInfo.accessor) {
      // For continuous color: apply accessor to both dots and line segments
      dotConfig.fill = (d: any) => colorInfo.accessor?.(d) ?? null;
      lineConfig.stroke = (d: any) => colorInfo.accessor?.(d) ?? null;
      // Split line into segments so each point-to-point segment can have its own color
      lineConfig.z = null;  // Don't group by z, render as individual segments
    } else {
      // For discrete color: use column name and group by z value
      lineConfig.stroke = colorColumnName;
      lineConfig.z = colorColumnName;
      dotConfig.fill = colorColumnName;
    }
  } else {
    lineConfig.stroke = DEFAULT_CHART_COLOR;
    dotConfig.fill = DEFAULT_CHART_COLOR;
  }

  // Apply size configuration for line width
  if (sizeField && sizeRange) {
    const sizeScale = createSizeScale(cleanSorted, sizeField, sizeRange, manualSize || 2);
    const sizeColumnName = getResultColumnName(sizeField);
    lineConfig.strokeWidth = (d: any) => sizeScale.getSizeForValue(d[sizeColumnName]);
    dotConfig.channels[sizeField.columnName] = { value: sizeColumnName, label: sizeField.columnName };
  } else {
    lineConfig.strokeWidth = manualSize || 2;
  }
  
  // Update tooltip format to include color and size when present
  const tipFormat: any = { [xLabel]: true, [yLabel]: true, x: false, y: false, fill: false, r: false };
  if (colorField) {
    tipFormat[colorField.columnName] = true;
  }
  if (sizeField) {
    tipFormat[sizeField.columnName] = true;
  }
  
  dotConfig.tip = { pointer: 'x', preferredAnchor: 'top-right', format: tipFormat };

  const plotOptions: Plot.PlotOptions = {
    x: { label: labels?.x || xColumn, domainKey: xColumn, grid: true, domain: domain?.x } as any,
    y: { label: labels?.y || yColumn, domainKey: yColumn, grid: true, domain: domain?.y } as any,
    marks: [
      Plot.line(cleanSorted, lineConfig),
      Plot.dot(cleanSorted, dotConfig),
    ],
  };
  
  if (colorField && colorInfo) {
    if (colorInfo.kind === 'continuous') {
      plotOptions.color = {
        type: 'linear',
        domain: colorInfo.domain as [number, number],
        range: colorInfo.range,
        clamp: true,
        label: colorField.columnName,
      } as any;
    } else {
      plotOptions.color = {
        type: 'ordinal' as any,
        domain: colorInfo.domain as any[],
        range: colorInfo.range,
        label: colorField.columnName,
      } as any;
    }
  }
  
  return plotOptions;
}

/**
 * Vertical line chart for continuous measure on X and continuous dimension on Y.
 * Sorts by the Y dimension so the line flows bottom-to-top.
 */
export function verticalLineChart(
  data: any[],
  xColumn: string,
  yColumn: string,
  labels?: { x?: string; y?: string },
  domain?: { x?: [number, number] | [Date, Date]; y?: [number, number] | [Date, Date] },
  colorField?: Field,
  colorScheme?: string,
  sizeField?: Field,
  sizeRange?: [number, number],
  manualSize?: number
): Plot.PlotOptions {
  const clean = Array.isArray(data)
    ? data.filter((d) => Number.isFinite(d[xColumn]))
    : [];

  if (clean.length === 0) {
    return {
      x: { label: labels?.x || xColumn, domainKey: xColumn, grid: true } as any,
      y: { label: labels?.y || yColumn, domainKey: yColumn, grid: true } as any,
      marks: [],
    };
  }

  const toComparable = (v: any): number | string | null => {
    if (v instanceof Date) return v.getTime();
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      const num = Number.parseFloat(v);
      if (Number.isFinite(num)) return num;
      const ts = Date.parse(v);
      if (!Number.isNaN(ts)) return ts;
      return v;
    }
    return null;
  };
  const cleanSorted = clean.slice().sort((a, b) => {
    const ay = toComparable(a[yColumn]);
    const by = toComparable(b[yColumn]);
    if (ay == null && by == null) return 0;
    if (ay == null) return 1;
    if (by == null) return -1;
    if (typeof ay === 'string' || typeof by === 'string') return String(ay).localeCompare(String(by));
    return (ay as number) - (by as number);
  });

  const xLabel2 = labels?.x || xColumn;
  const yLabel2 = labels?.y || yColumn;
  const lineConfig: any = { x: xColumn, y: yColumn };
  const dotConfig: any = {
    x: { value: xColumn, label: xLabel2 },
    y: { value: yColumn, label: yLabel2 },
    r: 2,
    channels: {
      [xLabel2]: { value: xColumn, label: xLabel2 },
      [yLabel2]: { value: yColumn, label: yLabel2 }
    },
    tip: { pointer: 'x', preferredAnchor: 'top-right', format: { [xLabel2]: true, [yLabel2]: true, x: false, y: false, fill: false, r: false } }
  };
  
  const colorInfo = colorField ? deriveColorScaleInfo(cleanSorted, colorField, colorScheme) : null;
  const colorColumnName = colorField ? getResultColumnName(colorField) : undefined;

  if (colorField && colorInfo) {
    dotConfig.channels[colorField.columnName] = { value: colorColumnName, label: colorField.columnName };

    if (colorInfo.kind === 'continuous' && colorInfo.accessor) {
      // For continuous color: apply accessor to both dots and line segments
      dotConfig.fill = (d: any) => colorInfo.accessor?.(d) ?? null;
      lineConfig.stroke = (d: any) => colorInfo.accessor?.(d) ?? null;
      // Split line into segments so each point-to-point segment can have its own color
      lineConfig.z = null;  // Don't group by z, render as individual segments
    } else {
      // For discrete color: use column name and group by z value
      lineConfig.stroke = colorColumnName;
      lineConfig.z = colorColumnName;
      dotConfig.fill = colorColumnName;
    }
  } else {
    lineConfig.stroke = DEFAULT_CHART_COLOR;
    dotConfig.fill = DEFAULT_CHART_COLOR;
  }

  // Apply size configuration for line width
  if (sizeField && sizeRange) {
    const sizeScale = createSizeScale(cleanSorted, sizeField, sizeRange, manualSize || 2);
    const sizeColumnName = getResultColumnName(sizeField);
    lineConfig.strokeWidth = (d: any) => sizeScale.getSizeForValue(d[sizeColumnName]);
  } else {
    lineConfig.strokeWidth = manualSize || 2;
  }
  
  const plotOptions: Plot.PlotOptions = {
    x: { label: labels?.x || xColumn, domainKey: xColumn, grid: true, domain: domain?.x } as any,
    y: { label: labels?.y || yColumn, domainKey: yColumn, grid: true, domain: domain?.y } as any,
    marks: [
      Plot.line(cleanSorted, lineConfig),
      Plot.dot(cleanSorted, dotConfig),
    ],
  };
  
  if (colorField && colorInfo) {
    if (colorInfo.kind === 'continuous') {
      plotOptions.color = {
        type: 'linear',
        domain: colorInfo.domain as [number, number],
        range: colorInfo.range,
        clamp: true,
        label: colorField.columnName,
      } as any;
    } else {
      plotOptions.color = {
        type: 'ordinal' as any,
        domain: colorInfo.domain as any[],
        range: colorInfo.range,
        label: colorField.columnName,
      } as any;
    }
  }
  
  return plotOptions;
}
