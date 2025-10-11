import * as Plot from '@observablehq/plot';
import { DEFAULT_CHART_COLOR } from '../../config/chartLayoutConfig';
import { Field } from '../../types';
import { getResultColumnName } from '../../utils/fieldUtils';
import { getPlotColorConfig } from '../utils/colorSchemeUtils';

/**
 * Scatter chart for continuous measure vs continuous measure or dimension.
 */
export function scatterChart(
  data: any[],
  xColumn: string,
  yColumn: string,
  options?: { x?: string; y?: string; domain?: { x?: [number, number]; y?: [number, number] } },
  colorField?: Field,
  colorScheme?: string
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
  
  if (colorField) {
    const colorColumnName = getResultColumnName(colorField);
    dotConfig.fill = colorColumnName;
  } else {
    dotConfig.fill = DEFAULT_CHART_COLOR;
  }
  // Enable tooltip on points; use pointer along X for easier targeting
  // Use format to only show x/y channels and rely on Plot's name-value layout for bold-ish labels.
  dotConfig.tip = {
    closest: "xy",
    preferredAnchor: 'top-right',
    format: { [xLabel]: true, [yLabel]: true, x: false, y: false, fill: false, r: false }
  } as any;
  
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
    const colorColumnName = getResultColumnName(colorField);
    const colorValues = Array.from(new Set(clean.map(row => row[colorColumnName])));
    const colorConfig = getPlotColorConfig(colorScheme);
    plotOptions.color = {
      domain: colorValues,
      ...colorConfig as any,
      type: 'ordinal' as any
    };
  }
  
  return plotOptions;
}


