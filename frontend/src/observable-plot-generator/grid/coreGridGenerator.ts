import * as Plot from '@observablehq/plot';
import { generatePairChartOptions } from '../chartTypes/cellCharts';
import { Field } from '../../types';
import { ChartTypeOverrides } from '../helpers/chartTypeResolver';
import { computeSharedNumericDomains } from '../domains/numericDomains';
import { computeSharedMeasureDomains } from '../domains/measureDomains';
import { ChartGenerationContext, PlotResult } from '../types';
import { FieldAnalysis } from '../analysis/fieldAnalysis';

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
  const { queryResult } = context;
  const data = queryResult.rows;

  // Compute shared domains for any measures used in the grid
  const sharedMeasureDomains = computeSharedMeasureDomains(data, xCandidates, yCandidates);

  const plots = generateCartesianPlots(data, xCandidates, yCandidates, sharedMeasureDomains, overrides);

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
  sharedMeasureDomains: Record<string, [number, number]>,
  overrides?: ChartTypeOverrides
): CartesianPlot[] {
  const plots: CartesianPlot[] = [];

  // Compute shared numeric domains for both measures and continuous dimensions
  // (this unifies scales across the whole matrix when the same field appears).
  const sharedNumeric = computeSharedNumericDomains(data, xCandidates as any[], yCandidates as any[]);

  for (let r = 0; r < yCandidates.length; r++) {
    for (let c = 0; c < xCandidates.length; c++) {
      const xField = xCandidates[c];
      const yField = yCandidates[r];

      const options: Plot.PlotOptions = generatePairChartOptions(
        data,
        xField,
        yField,
        { ...sharedMeasureDomains, ...sharedNumeric },
        overrides
      );
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
