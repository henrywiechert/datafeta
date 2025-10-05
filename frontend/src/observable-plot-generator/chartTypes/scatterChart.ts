import * as Plot from '@observablehq/plot';
import { DEFAULT_CHART_COLOR, DEFAULT_COLOR_SCHEME } from '../../config/chartLayoutConfig';
import { Field } from '../../types';

/**
 * Scatter chart for continuous measure vs continuous measure or dimension.
 */
export function scatterChart(
  data: any[],
  xColumn: string,
  yColumn: string,
  options?: { x?: string; y?: string; domain?: { x?: [number, number]; y?: [number, number] } },
  colorField?: Field
): Plot.PlotOptions {
  const clean = Array.isArray(data)
    ? data.filter((d) => Number.isFinite(d[xColumn]) && Number.isFinite(d[yColumn]))
    : [];

  if (clean.length === 0) {
    // Render empty axes (no points) so the cell shape matches others
    return {
      x: { label: options?.x || xColumn, grid: true, domain: options?.domain?.x },
      y: { label: options?.y || yColumn, grid: true, domain: options?.domain?.y },
      marks: [Plot.ruleX([0]), Plot.ruleY([0])],
    };
  }

  const dotConfig: any = { x: xColumn, y: yColumn, r: 4 };
  
  if (colorField) {
    dotConfig.fill = colorField.columnName;
  } else {
    dotConfig.fill = DEFAULT_CHART_COLOR;
  }
  
  const plotOptions: Plot.PlotOptions = {
    // Provide labels and retain as keys for domain application
    x: { label: options?.x || xColumn, grid: true, domain: options?.domain?.x },
    y: { label: options?.y || yColumn, grid: true, domain: options?.domain?.y },
    marks: [
      Plot.dot(clean, dotConfig),
      Plot.ruleX([0]),
      Plot.ruleY([0]),
    ],
  };
  
  if (colorField) {
    // Get unique color values for the domain
    const colorValues = Array.from(new Set(clean.map(row => row[colorField.columnName])));
    plotOptions.color = {
      domain: colorValues,
      scheme: DEFAULT_COLOR_SCHEME,
      type: 'ordinal' as any
    };
  }
  
  return plotOptions;
}


