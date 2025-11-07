import * as Plot from '@observablehq/plot';
import { DEFAULT_CHART_COLOR } from '../../config/chartLayoutConfig';
import { Field } from '../../types';
import { getResultColumnName } from '../../utils/fieldUtils';
import { deriveColorScaleInfo } from '../utils/colorSchemeUtils';
import { createSizeScale } from '../utils/sizeUtils';
import { createLabelMark, prepareLabelData, LabelRenderConfig } from '../utils/labelUtils';

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
  colorBias?: number,
  sizeField?: Field,
  sizeRange?: [number, number],
  manualSize?: number,
  labelCfg?: { labelFields: Field[]; labelsEnabled: boolean; samplingStrategy: 'auto' | 'all' | 'sample'; samplingThreshold: number; sampleEvery: number }
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
  const colorInfo = colorField ? deriveColorScaleInfo(cleanSorted, colorField, colorScheme, colorBias) : null;
  const colorColumnName = colorField ? getResultColumnName(colorField) : undefined;

  if (colorField && colorInfo) {
    dotConfig.channels[colorField.columnName] = { value: colorColumnName, label: colorField.columnName };

    if (colorInfo.kind === 'continuous') {
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
        lineConfig.z = null;
      } else if (colorInfo.accessor) {
        dotConfig.fill = (d: any) => colorInfo.accessor?.(d) ?? null;
        lineConfig.stroke = (d: any) => colorInfo.accessor?.(d) ?? null;
        lineConfig.z = null;
      } else {
        lineConfig.stroke = colorColumnName;
        lineConfig.z = colorColumnName;
        dotConfig.fill = colorColumnName;
      }
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
  
  // Use a custom title function to ensure long strings aren't truncated (like scatter charts)
  dotConfig.title = (d: any) => {
    const formatValue = (val: any): string => {
      if (typeof val === 'number' && !Number.isInteger(val)) {
        return val.toFixed(2);
      }
      return String(val);
    };
    
    const parts: string[] = [];
    parts.push(`${xLabel}: ${formatValue(d[xColumn])}`);
    parts.push(`${yLabel}: ${formatValue(d[yColumn])}`);
    if (colorField) {
      const colorColumnName = getResultColumnName(colorField);
      parts.push(`${colorField.columnName}: ${formatValue(d[colorColumnName])}`);
    }
    if (sizeField) {
      const sizeColumnName = getResultColumnName(sizeField);
      parts.push(`${sizeField.columnName}: ${formatValue(d[sizeColumnName])}`);
    }
    return parts.join('\n');
  };
  
  // Configure tooltip format to include all channels (for proper rendering)
  const tipFormat: any = { [xLabel]: true, [yLabel]: true, x: false, y: false, fill: false, r: false };
  if (colorField) {
    tipFormat[colorField.columnName] = true;
  }
  if (sizeField) {
    tipFormat[sizeField.columnName] = true;
  }
  
  dotConfig.tip = { format: tipFormat } as any;

  const plotOptions: Plot.PlotOptions = {
    x: { label: labels?.x || xColumn, domainKey: xColumn, grid: true, domain: domain?.x } as any,
    y: { label: labels?.y || yColumn, domainKey: yColumn, grid: true, domain: domain?.y } as any,
    marks: [
      Plot.line(cleanSorted, lineConfig),
      Plot.dot(cleanSorted, dotConfig),
    ],
  };

  if (labelCfg) {
    const labelConfig: LabelRenderConfig = {
      data: cleanSorted,
      xColumn,
      yColumn,
      labelFields: labelCfg.labelFields,
      labelsEnabled: labelCfg.labelsEnabled,
      samplingStrategy: labelCfg.samplingStrategy,
      samplingThreshold: labelCfg.samplingThreshold,
      sampleEvery: labelCfg.sampleEvery,
      chartType: 'line'
    };
    const prepared = prepareLabelData(labelConfig);
    const labelMark = createLabelMark(prepared, labelConfig, xColumn, yColumn);
    if (labelMark) {
      (plotOptions.marks = plotOptions.marks || []).push(labelMark as any);
    }
  }
  
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
  colorBias?: number,
  sizeField?: Field,
  sizeRange?: [number, number],
  manualSize?: number,
  labelCfg?: { labelFields: Field[]; labelsEnabled: boolean; samplingStrategy: 'auto' | 'all' | 'sample'; samplingThreshold: number; sampleEvery: number }
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
    }
  };
  
  const colorInfo = colorField ? deriveColorScaleInfo(cleanSorted, colorField, colorScheme, colorBias) : null;
  const colorColumnName = colorField ? getResultColumnName(colorField) : undefined;

  if (colorField && colorInfo) {
    dotConfig.channels[colorField.columnName] = { value: colorColumnName, label: colorField.columnName };

    if (colorInfo.kind === 'continuous') {
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
        lineConfig.z = null;
      } else if (colorInfo.accessor) {
        dotConfig.fill = (d: any) => colorInfo.accessor?.(d) ?? null;
        lineConfig.stroke = (d: any) => colorInfo.accessor?.(d) ?? null;
        lineConfig.z = null;
      } else {
        lineConfig.stroke = colorColumnName;
        lineConfig.z = colorColumnName;
        dotConfig.fill = colorColumnName;
      }
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
  
  // Use a custom title function to ensure long strings aren't truncated (like scatter charts)
  dotConfig.title = (d: any) => {
    const formatValue = (val: any): string => {
      if (typeof val === 'number' && !Number.isInteger(val)) {
        return val.toFixed(2);
      }
      return String(val);
    };
    
    const parts: string[] = [];
    parts.push(`${xLabel2}: ${formatValue(d[xColumn])}`);
    parts.push(`${yLabel2}: ${formatValue(d[yColumn])}`);
    if (colorField && colorColumnName) {
      parts.push(`${colorField.columnName}: ${formatValue(d[colorColumnName])}`);
    }
    if (sizeField) {
      const sizeColumnName = getResultColumnName(sizeField);
      parts.push(`${sizeField.columnName}: ${formatValue(d[sizeColumnName])}`);
    }
    return parts.join('\n');
  };
  
  // Configure tooltip format to include all channels (for proper rendering)
  const tipFormat: any = { [xLabel2]: true, [yLabel2]: true, x: false, y: false, fill: false, r: false };
  if (colorField) {
    tipFormat[colorField.columnName] = true;
  }
  if (sizeField) {
    const sizeColumnName = getResultColumnName(sizeField);
    tipFormat[sizeField.columnName] = true;
  }
  
  dotConfig.tip = { format: tipFormat } as any;
  
  const plotOptions: Plot.PlotOptions = {
    x: { label: labels?.x || xColumn, domainKey: xColumn, grid: true, domain: domain?.x } as any,
    y: { label: labels?.y || yColumn, domainKey: yColumn, grid: true, domain: domain?.y } as any,
    marks: [
      Plot.line(cleanSorted, lineConfig),
      Plot.dot(cleanSorted, dotConfig),
    ],
  };

  if (labelCfg) {
    const labelConfig: LabelRenderConfig = {
      data: cleanSorted,
      xColumn,
      yColumn,
      labelFields: labelCfg.labelFields,
      labelsEnabled: labelCfg.labelsEnabled,
      samplingStrategy: labelCfg.samplingStrategy,
      samplingThreshold: labelCfg.samplingThreshold,
      sampleEvery: labelCfg.sampleEvery,
      chartType: 'verticalLine'
    };
    const prepared = prepareLabelData(labelConfig);
    const labelMark = createLabelMark(prepared, labelConfig, xColumn, yColumn);
    if (labelMark) {
      (plotOptions.marks = plotOptions.marks || []).push(labelMark as any);
    }
  }
  
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
