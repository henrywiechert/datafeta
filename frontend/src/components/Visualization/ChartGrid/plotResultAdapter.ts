import { PlotResult } from '../../../observable-plot-generator/types';
import { GridHeaderAxis, GridHeaders, GridResultModel } from './gridModel';

function buildHeaderAxis(
  levels: Array<{ fieldLabel: string; values: any[] }> | undefined,
  baseSpan: number,
  orderedValueTuples: any[][] | undefined,
): GridHeaderAxis | undefined {
  if (!levels || levels.length === 0) {
    return undefined;
  }

  return {
    levels: levels.map((level) => ({
      fieldLabel: level.fieldLabel,
      values: level.values,
    })),
    baseSpan: Math.max(1, baseSpan),
    ...(orderedValueTuples && orderedValueTuples.length > 0
      ? { orderedValueTuples }
      : {}),
  };
}

function buildHeaders(plotResult: PlotResult): GridHeaders | undefined {
  const facetLabels = plotResult.facetLabels;
  if (!facetLabels) return undefined;

  const rowBaseSpan =
    facetLabels.spans?.baseRows ??
    facetLabels.groupSpan?.rowsPerFacet ??
    1;
  const colBaseSpan =
    facetLabels.spans?.baseCols ??
    facetLabels.groupSpan?.columnsPerFacet ??
    1;

  return {
    rows: buildHeaderAxis(facetLabels.rowsLevels, rowBaseSpan, facetLabels.rowsOrderedValueTuples),
    cols: buildHeaderAxis(facetLabels.colsLevels, colBaseSpan, facetLabels.colsOrderedValueTuples),
  };
}

/**
 * Adapt the legacy `PlotResult` into the canonical `GridResultModel`.
 *
 * Transitional translation: the chart generator continues to produce
 * `PlotResult`, while ChartGrid components consume `GridResultModel`. PR 5
 * will move this boundary into the generator and delete the adapter.
 *
 * Pie cells preserve `renderer` and `pieSpec` as passthroughs on the plot
 * cell content; PR 4 will replace this with `kind: 'pie'` cell content.
 */
export function adaptPlotResultToGridModel(plotResult: PlotResult): GridResultModel {
  return {
    cells: plotResult.plots.map((plot) => ({
      id: plot.id,
      position: plot.position,
      content: {
        kind: 'plot' as const,
        options: plot.options,
        facetBackground: plot.facetBackground,
        renderer: plot.renderer,
        pieSpec: plot.pieSpec,
      },
      metadata: {
        title: plot.title,
        xField: plot.xField,
        yField: plot.yField,
      },
    })),
    layout: { ...plotResult.layout },
    headers: buildHeaders(plotResult),
    sharedDomains: plotResult.sharedDomains?.byMeasure
      ? { byMeasure: plotResult.sharedDomains.byMeasure }
      : undefined,
  };
}
