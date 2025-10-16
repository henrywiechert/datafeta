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
      x: { label: options?.x || xColumn, grid: true, domain: options?.domain?.x },
      y: { label: options?.y || yColumn, grid: true, domain: options?.domain?.y },
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
    }
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
  // Enable tooltip on points; use pointer along X for easier targeting
  // Use format to only show x/y channels and rely on Plot's name-value layout for bold-ish labels.
  const tipFormat: any = { [xLabel]: true, [yLabel]: true, x: false, y: false, fill: false, r: false };
  
  if (colorField) {
    tipFormat[colorField.columnName] = true;
  }
  
  if (sizeField) {
    tipFormat[sizeField.columnName] = true;
  }
  
  dotConfig.tip = {
    closest: "xy",
    preferredAnchor: 'top-right',
    format: tipFormat
  } as any;
  
  const plotOptions: Plot.PlotOptions = {
    // Provide labels and retain as keys for domain application
    x: { label: options?.x || xColumn, grid: true, domain: options?.domain?.x },
    y: { label: options?.y || yColumn, grid: true, domain: options?.domain?.y },
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


