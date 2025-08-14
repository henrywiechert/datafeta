import * as Plot from '@observablehq/plot';
import { DEFAULT_CHART_COLOR, BAR_STEP_PX } from '../../config/chartLayoutConfig';
import { getResultColumnName } from '../../utils/fieldUtils';

export type CartesianPlot = {
  id: string;
  title: string;
  options: Plot.PlotOptions;
  position: { row: number; col: number };
};

/**
 * Build plot specs for all X×Y candidate pairs. Shared measure domains are provided by caller.
 */
export function generateCartesianPlots(
  data: any[],
  xCandidates: any[],
  yCandidates: any[],
  sharedMeasureDomains: Record<string, [number, number]>
): CartesianPlot[] {
  const plots: CartesianPlot[] = [];

  for (let r = 0; r < yCandidates.length; r++) {
    for (let c = 0; c < xCandidates.length; c++) {
      const xField = xCandidates[c];
      const yField = yCandidates[r];

      const xIsMeasure = xField.type === 'measure';
      const yIsMeasure = yField.type === 'measure';
      const xLabel = xIsMeasure
        ? getResultColumnName({ ...xField, aggregation: xField.aggregation || 'sum' } as any)
        : xField.columnName;
      const yLabel = yIsMeasure
        ? getResultColumnName({ ...yField, aggregation: yField.aggregation || 'sum' } as any)
        : yField.columnName;

      let options: Plot.PlotOptions;
      const title = `${yLabel} vs ${xLabel}`;

      if (xIsMeasure && yIsMeasure) {
        options = {
          x: { label: xLabel, grid: true, domain: sharedMeasureDomains[xLabel] },
          y: { label: yLabel, grid: true, domain: sharedMeasureDomains[yLabel] },
          marks: [
            Plot.dot(data, { x: xLabel, y: yLabel, fill: DEFAULT_CHART_COLOR, r: 4 }),
            Plot.ruleX([0]),
            Plot.ruleY([0]),
          ],
        };
      } else if (xIsMeasure && !yIsMeasure) {
        if (yField.flavour === 'continuous') {
          options = {
            x: { label: xLabel, grid: true, domain: sharedMeasureDomains[xLabel] },
            y: { label: yLabel, grid: true },
            marks: [
              Plot.line(data, { x: yLabel, y: xLabel, stroke: DEFAULT_CHART_COLOR }),
              Plot.dot(data, { x: yLabel, y: xLabel, fill: DEFAULT_CHART_COLOR, r: 2 }),
            ],
          };
        } else {
          const categoryCount = new Set(data.map((row: any) => row[yLabel])).size;
          const heightPx = Math.max(BAR_STEP_PX * 2, categoryCount * BAR_STEP_PX);
          options = {
            x: { label: xLabel, grid: true, domain: sharedMeasureDomains[xLabel] },
            y: { label: yLabel },
            height: heightPx,
            marks: [
              Plot.ruleX([0]),
              Plot.barX(data, { x: xLabel, y: yLabel, fill: DEFAULT_CHART_COLOR }),
            ],
          } as Plot.PlotOptions;
        }
      } else if (!xIsMeasure && yIsMeasure) {
        if (xField.flavour === 'continuous') {
          options = {
            x: { label: xLabel, grid: true },
            y: { label: yLabel, grid: true, domain: sharedMeasureDomains[yLabel] },
            marks: [
              Plot.line(data, { x: xLabel, y: yLabel, stroke: DEFAULT_CHART_COLOR }),
              Plot.dot(data, { x: xLabel, y: yLabel, fill: DEFAULT_CHART_COLOR, r: 2 }),
            ],
          };
        } else {
          const categoryCount = new Set(data.map((row: any) => row[xLabel])).size;
          const widthPx = Math.max(BAR_STEP_PX * 2, categoryCount * BAR_STEP_PX);
          options = {
            y: { label: yLabel, grid: true, domain: sharedMeasureDomains[yLabel] },
            x: { label: xLabel },
            width: widthPx,
            marks: [
              Plot.ruleY([0]),
              Plot.barY(data, { x: xLabel, y: yLabel, fill: DEFAULT_CHART_COLOR }),
            ],
          } as Plot.PlotOptions;
        }
      } else {
        options = {
          x: { label: xLabel, grid: true },
          y: { label: yLabel, grid: true },
          marks: [Plot.dot(data, { x: xLabel, y: yLabel, fill: DEFAULT_CHART_COLOR, r: 4 })],
        };
      }

      plots.push({ id: `cell-${r}-${c}`, title, options, position: { row: r, col: c } });
    }
  }

  return plots;
}


