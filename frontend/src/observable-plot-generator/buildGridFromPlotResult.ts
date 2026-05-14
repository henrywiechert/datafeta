// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { PlotResult } from './types';
import { GridCellContent, GridHeaderAxis, GridHeaders, GridResultModel } from './gridModel';

/**
 * Internal translation step that converts the legacy `PlotResult` produced by
 * the chart pipeline into the canonical `GridResultModel` returned by
 * `generatePlot`. Faceting and chart-type helpers continue to thread
 * `PlotResult` between themselves; the boundary is collapsed here so that
 * downstream consumers (ChartGrid and friends) only deal with the grid model.
 */

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

function buildCellContent(plot: PlotResult['plots'][number]): GridCellContent {
  // Pie cells: the chart pipeline marks them with `renderer === 'pie-svg'`
  // and a populated `pieSpec`. Translate into a dedicated `kind: 'pie'` cell
  // so downstream components dispatch on the cell kind rather than on the
  // legacy `renderer` discriminator. The `__customTooltip` option is hoisted
  // into `tooltipConfig` for `PieSvgRenderer`.
  if (plot.renderer === 'pie-svg' && plot.pieSpec) {
    const tooltipConfig = (plot.options as any)?.__customTooltip;
    return {
      kind: 'pie',
      pieSpec: plot.pieSpec,
      tooltipConfig,
      facetBackground: plot.facetBackground,
    };
  }

  return {
    kind: 'plot',
    options: plot.options,
    facetBackground: plot.facetBackground,
  };
}

/**
 * Translate the internal `PlotResult` into the canonical `GridResultModel`.
 *
 * Used by `generatePlot` at the public boundary. Not exported for general use:
 * downstream code should depend on `GridResultModel` directly.
 */
export function buildGridFromPlotResult(plotResult: PlotResult): GridResultModel {
  return {
    cells: plotResult.plots.map((plot) => ({
      id: plot.id,
      position: plot.position,
      content: buildCellContent(plot),
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
