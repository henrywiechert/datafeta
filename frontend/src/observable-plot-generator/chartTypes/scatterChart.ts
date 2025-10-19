import * as Plot from '@observablehq/plot';
import { DEFAULT_CHART_COLOR } from '../../config/chartLayoutConfig';
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
  options?: { x?: string; y?: string; domain?: { x?: [number, number]; y?: [number, number] } },
  colorField?: Field,
  colorScheme?: string,
  sizeField?: Field,
  sizeRange?: [number, number],
  manualSize?: number
): Plot.PlotOptions {
  const clean = Array.isArray(data)
    ? data.filter((d) => Number.isFinite(d[xColumn]) && Number.isFinite(d[yColumn]))
    : [];

  if (clean.length === 0) {
    // Render empty axes (no points) so the cell shape matches others
    return {
      x: { label: options?.x || xColumn, domainKey: xColumn, grid: true, domain: options?.domain?.x } as any,
      y: { label: options?.y || yColumn, domainKey: yColumn, grid: true, domain: options?.domain?.y } as any,
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
  
  // Calculate domains: use shared domains if provided (for faceting/grids), otherwise calculate from local data
  let xDomain: [number, number];
  let yDomain: [number, number];
  
  // X domain: use shared if provided, otherwise calculate from data
  if (options?.domain?.x) {
    xDomain = options.domain.x;
  } else {
    const xValues = clean.map(d => d[xColumn]);
    const xMin = Math.min(...xValues);
    const xMax = Math.max(...xValues);
    const xRange = xMax - xMin;
    const xPadding = xRange * 0.05; // 5% padding on each side
    xDomain = [xMin - xPadding, xMax + xPadding] as [number, number];
  }
  
  // Y domain: use shared if provided, otherwise calculate from data
  if (options?.domain?.y) {
    yDomain = options.domain.y;
  } else {
    const yValues = clean.map(d => d[yColumn]);
    const yMin = Math.min(...yValues);
    const yMax = Math.max(...yValues);
    const yRange = yMax - yMin;
    const yPadding = yRange * 0.05; // 5% padding on each side
    yDomain = [yMin - yPadding, yMax + yPadding] as [number, number];
  }
  
  const plotOptions: Plot.PlotOptions = {
    // Provide labels and retain as keys for domain application
    x: { label: options?.x || xColumn, domainKey: xColumn, grid: true, domain: xDomain, nice: false } as any,
    y: { label: options?.y || yColumn, domainKey: yColumn, grid: true, domain: yDomain, nice: false } as any,
    // Ensure r values returned by dotConfig.r are treated as absolute radii (no further scaling)
    r: { type: 'identity' } as any,
    marks: [
      Plot.dot(clean, dotConfig),
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


