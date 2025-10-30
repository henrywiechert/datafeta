import * as Plot from '@observablehq/plot';
import { generatePairChartOptions } from '../chartTypes/cellCharts';
import { Field } from '../../types';
import { ChartTypeOverrides } from '../helpers/chartTypeResolver';
import { computeSharedNumericDomains } from '../domains/numericDomains';
import { computeSharedMeasureDomains } from '../domains/measureDomains';
import { ChartGenerationContext, PlotResult } from '../types';
import { FieldAnalysis } from '../analysis/fieldAnalysis';
import { deriveColorScaleInfo } from '../utils/colorSchemeUtils';

export type CartesianPlot = {
  id: string;
  title: string;
  options: Plot.PlotOptions;
  position: { row: number; col: number };
};

/**
 * Build a cartesian pairing grid between xCandidates and yCandidates.
 * - If both are measures → scatter by their measure columns
 * - If one is measure and other is dimension → line chart
 * - If both are dimensions → scatter
 * Uses CSS grid with positions. For now, non-bar charts use 'fr' sizing.
 */
export function generateCartesianGrid(
  context: ChartGenerationContext,
  analysis: FieldAnalysis,
  xCandidates: Field[],
  yCandidates: Field[],
  overrides?: ChartTypeOverrides
): PlotResult {
  const { queryResult, colorField, colorScheme, sizeField, sizeRange, manualSize } = context;
  const data = queryResult.rows;

  // Compute shared domains for any measures used in the grid
  const sharedMeasureDomains = computeSharedMeasureDomains(data, xCandidates, yCandidates, colorField);

  const labelCfg = buildLabelCfg(context);
  const plots = generateCartesianPlots(
    data,
    xCandidates,
    yCandidates,
    sharedMeasureDomains,
    overrides,
    colorField,
    colorScheme,
    sizeField,
    sizeRange,
    manualSize,
    labelCfg
  );

  // Derive per-column width and per-row height from plots' options when available
  const columnSizes: Array<number | 'fr'> = Array.from({ length: xCandidates.length }, (_, c) => {
    const sample = plots.find((p) => p.position.col === c);
    const w = (sample as any)?.options?.width;
    return typeof w === 'number' ? w : 'fr';
  });
  const rowSizes: Array<number | 'fr'> = Array.from({ length: yCandidates.length }, (_, r) => {
    const sample = plots.find((p) => p.position.row === r);
    const h = (sample as any)?.options?.height;
    return typeof h === 'number' ? h : 'fr';
  });

  return {
    library: 'observable-plot',
    plots,
    sharedDomains: { byMeasure: sharedMeasureDomains as any },
    layout: {
      type: 'grid',
      columns: xCandidates.length,
      rows: yCandidates.length,
      columnSizes,
      rowSizes,
    },
  };
}

/**
 * Build plot specs for all X×Y candidate pairs. Shared measure domains are provided by caller.
 */
export function generateCartesianPlots(
  data: any[],
  xCandidates: Field[],
  yCandidates: Field[],
  sharedMeasureDomains: Record<string, [number, number] | [Date, Date]>,
  overrides?: ChartTypeOverrides,
  colorField?: Field,
  colorScheme?: string,
  sizeField?: Field,
  sizeRange?: [number, number],
  manualSize?: number,
  labelCfg?: { labelFields: Field[]; labelsEnabled: boolean; samplingStrategy: 'auto' | 'all' | 'sample'; samplingThreshold: number; sampleEvery: number }
): CartesianPlot[] {
  const plots: CartesianPlot[] = [];

  // Compute shared numeric domains for both measures and continuous dimensions
  // (this unifies scales across the whole matrix when the same field appears).
  const sharedNumeric = computeSharedNumericDomains(data, xCandidates as any[], yCandidates as any[]);

  // Compute a shared color domain across the entire grid when a color field is present
  const sharedColorScale = colorField ? deriveColorScaleInfo(data, colorField, colorScheme) : null;

  for (let r = 0; r < yCandidates.length; r++) {
    for (let c = 0; c < xCandidates.length; c++) {
      const xField = xCandidates[c];
      const yField = yCandidates[r];

      let options: Plot.PlotOptions = generatePairChartOptions(
        data,
        xField,
        yField,
        { ...sharedMeasureDomains, ...sharedNumeric },
        overrides,
        colorField,
        sizeField,
        sizeRange,
        manualSize,
        colorScheme,
        labelCfg
      );

      // Apply shared color domain to keep color mapping consistent across the grid
      if (sharedColorScale) {
        const colorLabel = colorField?.columnName;
        const sharedConfig = sharedColorScale.kind === 'continuous'
          ? {
              type: 'linear',
              domain: sharedColorScale.domain as [number, number],
              range: sharedColorScale.range,
              clamp: true,
              label: colorLabel,
            }
          : {
              type: 'ordinal' as any,
              domain: sharedColorScale.domain as any[],
              range: sharedColorScale.range,
              label: colorLabel,
            };

        options = {
          ...options,
          color: {
            ...(options as any).color,
            ...sharedConfig,
          } as any,
        };
      }
      const title = buildCellTitle(xField, yField);
      plots.push({ id: `cell-${r}-${c}`, title, options, position: { row: r, col: c } });
    }
  }

  return plots;
}

function buildCellTitle(xField: Field, yField: Field): string {
  const xLabel = xField.type === 'measure' ? `${xField.aggregation || 'sum'}(${xField.columnName})` : xField.columnName;
  const yLabel = yField.type === 'measure' ? `${yField.aggregation || 'sum'}(${yField.columnName})` : yField.columnName;
  return `${yLabel} vs ${xLabel}`;
}

function buildLabelCfg(context: ChartGenerationContext) {
  const {
    labelFields = [],
    labelsEnabled = false,
    labelSamplingStrategy = 'auto',
    labelSamplingThreshold = 300,
    labelSampleEvery = 1,
  } = context as any;
  if (!labelsEnabled && (labelFields?.length || 0) === 0) return undefined;
  return {
    labelFields,
    labelsEnabled,
    samplingStrategy: labelSamplingStrategy,
    samplingThreshold: labelSamplingThreshold,
    sampleEvery: labelSampleEvery,
  };
}
