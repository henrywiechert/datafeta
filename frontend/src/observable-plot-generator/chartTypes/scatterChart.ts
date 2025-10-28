import * as Plot from '@observablehq/plot';
import { DEFAULT_CHART_COLOR, DOMAIN_PAD_RATIO } from '../../config/chartLayoutConfig';
import { Field } from '../../types';
import { getResultColumnName } from '../../utils/fieldUtils';
import { deriveColorScaleInfo } from '../utils/colorSchemeUtils';
import { createSizeScale } from '../utils/sizeUtils';

/**
 * Scatter chart for continuous measure vs continuous measure or dimension.
 */
export function scatterChart(
  data: any[],
  xColumn: string,
  yColumn: string,
  options?: { x?: string; y?: string; domain?: { x?: [number, number] | [Date, Date]; y?: [number, number] | [Date, Date] } },
  colorField?: Field,
  colorScheme?: string,
  sizeField?: Field,
  sizeRange?: [number, number],
  manualSize?: number
): Plot.PlotOptions {
  // Detect axis value kinds by sampling up to first 20 non-null values
  const sampleValues = (column: string) => (Array.isArray(data) ? data.map(r => r?.[column]).filter(v => v !== null && v !== undefined) : []);
  const xSamples = sampleValues(xColumn);
  const ySamples = sampleValues(yColumn);
  const isDateLike = (v: any) => v instanceof Date || (typeof v === 'string' && !Number.isNaN(Date.parse(v)));
  const xIsDate = xSamples.some(isDateLike);
  const yIsDate = ySamples.some(isDateLike);
  const isNumeric = (v: any) => typeof v === 'number' && Number.isFinite(v);
  const isValid = (col: string, isDateAxis: boolean, val: any) => {
    if (isDateAxis) return isDateLike(val);
    return isNumeric(val);
  };

  // Build cleaned & normalized data: convert date-like strings to Date objects so Plot time scale works
  const clean: any[] = Array.isArray(data)
    ? data.filter(d => isValid(xColumn, xIsDate, d?.[xColumn]) && isValid(yColumn, yIsDate, d?.[yColumn]))
        .map(d => {
          if (!xIsDate && !yIsDate) return d; // no normalization needed
          const copy: any = { ...d };
          if (xIsDate && !(copy[xColumn] instanceof Date)) copy[xColumn] = new Date(copy[xColumn]);
          if (yIsDate && !(copy[yColumn] instanceof Date)) copy[yColumn] = new Date(copy[yColumn]);
          return copy;
        })
    : [];

  if (clean.length === 0) {
    // Render empty axes (no points) so the cell shape matches others
    return {
      x: {
        label: options?.x || xColumn,
        domainKey: xColumn,
        grid: true,
        domain: options?.domain?.x,
        // If axis inferred as date, ensure time scale
        ...(xIsDate ? { type: 'utc' as any } : {})
      } as any,
      y: {
        label: options?.y || yColumn,
        domainKey: yColumn,
        grid: true,
        domain: options?.domain?.y,
        ...(yIsDate ? { type: 'utc' as any } : {})
      } as any,
      marks: [],
    };
  }

  const xLabel = options?.x || xColumn;
  const yLabel = options?.y || yColumn;
  const dotConfig: any = {
    x: { value: xColumn, label: xLabel },
    y: { value: yColumn, label: yLabel },
    r: 4,
    channels: {
      [xLabel]: { value: xColumn, label: xLabel },
      [yLabel]: { value: yColumn, label: yLabel }
    },
  };
  
  const colorInfo = colorField ? deriveColorScaleInfo(clean, colorField, colorScheme) : null;
  if (colorField && colorInfo) {
    const colorColumnName = getResultColumnName(colorField);
    dotConfig.channels[colorField.columnName] = { value: colorColumnName, label: colorField.columnName };

    if (colorInfo.kind === 'continuous' && colorInfo.accessor) {
      dotConfig.fill = (d: any) => colorInfo.accessor?.(d) ?? null;
    } else {
      dotConfig.fill = colorColumnName;
    }
  } else {
    dotConfig.fill = DEFAULT_CHART_COLOR;
  }

  // Apply size configuration
  if (sizeField && sizeRange) {
    const sizeScale = createSizeScale(clean, sizeField, sizeRange, manualSize || 4);
    // Determine actual column name (handle implicit SUM aggregation alias like sizeUtils does)
    let sizeColumnName = getResultColumnName(sizeField);
    if (sizeField.type === 'measure' && !sizeField.aggregation) {
      const sumAlias = `SUM(${sizeField.columnName})`;
      if (clean.length && Object.prototype.hasOwnProperty.call(clean[0], sumAlias)) {
        sizeColumnName = sumAlias;
      }
    }
    // Provide a direct radius in pixels so we add an identity scale at plot level
    dotConfig.r = (d: any) => sizeScale.getSizeForValue(d[sizeColumnName]);
    dotConfig.channels[sizeField.columnName] = { value: sizeColumnName, label: sizeField.columnName };
  } else {
    dotConfig.r = manualSize || 4;
  }
  
  // Configure tooltip format to include all channels
  const tipFormat: any = { [xLabel]: true, [yLabel]: true, x: false, y: false, fill: false, r: false };
  if (colorField) {
    tipFormat[colorField.columnName] = true;
  }
  if (sizeField) {
    tipFormat[sizeField.columnName] = true;
  }

  // Use a custom title function to ensure long strings aren't truncated
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

  dotConfig.tip = { format: tipFormat } as any;
  
  // Calculate domains: use shared domains if provided (for faceting/grids), otherwise calculate from local data.
  // Numeric padding uses DOMAIN_PAD_RATIO; date padding expands by ratio of range.
  let xDomain: [number, number] | [Date, Date] | undefined;
  let yDomain: [number, number] | [Date, Date] | undefined;

  const buildNumericDomain = (values: number[]): [number, number] => {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;
    const pad = range * DOMAIN_PAD_RATIO;
    return [min - pad, max + pad];
  };
  const buildDateDomain = (values: Date[]): [Date, Date] => {
    const timestamps = values.map(d => d.getTime());
    const minTs = Math.min(...timestamps);
    const maxTs = Math.max(...timestamps);
    const range = maxTs - minTs;
    const pad = range * DOMAIN_PAD_RATIO;
    return [new Date(minTs - pad), new Date(maxTs + pad)];
  };

  if (options?.domain?.x) {
    xDomain = options.domain.x;
  } else {
    if (xIsDate) {
      const values = clean.map(d => d[xColumn] as Date);
      xDomain = buildDateDomain(values);
    } else {
      const values = clean.map(d => d[xColumn] as number);
      xDomain = buildNumericDomain(values);
    }
  }
  if (options?.domain?.y) {
    yDomain = options.domain.y;
  } else {
    if (yIsDate) {
      const values = clean.map(d => d[yColumn] as Date);
      yDomain = buildDateDomain(values);
    } else {
      const values = clean.map(d => d[yColumn] as number);
      yDomain = buildNumericDomain(values);
    }
  }
  
  const plotOptions: Plot.PlotOptions = {
    x: {
      label: options?.x || xColumn,
      domainKey: xColumn,
      grid: true,
      domain: xDomain,
      nice: false,
      ...(xIsDate ? { type: 'utc' as any } : {})
    } as any,
    y: {
      label: options?.y || yColumn,
      domainKey: yColumn,
      grid: true,
      domain: yDomain,
      nice: false,
      ...(yIsDate ? { type: 'utc' as any } : {})
    } as any,
    r: { type: 'identity' } as any,
    marks: [Plot.dot(clean, dotConfig)],
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


