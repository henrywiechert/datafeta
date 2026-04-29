/**
 * Heatmap Chart
 *
 * Renders a 2-D matrix of cells via Observable Plot's `Plot.cell` mark.
 *
 * Shape: discrete dimension on X, discrete dimension on Y, optional measure (or
 * any field) on the color shelf for the fill encoding. Empty (xField, yField,
 * fill) is supported but produces a degenerate single-color grid.
 *
 * Notes:
 * - X/Y axes use `band` scales so they line up with discrete categories.
 * - Aggregation is expected to happen upstream (the query path GROUPs BY when a
 *   measure with an aggregation is present); we do not aggregate here.
 * - Color uses the existing `deriveColorScaleInfo` so heatmap shares scale,
 *   bias, and per-measure overrides with the rest of the app.
 *
 * Performance note (for the PR description, not behaviour):
 * - `Plot.cell` renders one SVG `<rect>` per row, so cost is roughly O(rows).
 *   For a typical heatmap (a few hundred to a few thousand cells) it
 *   outperforms a CSS grid wrapping React components, which adds DOM/layout
 *   overhead per cell. CSS-grid only starts to win when you need rich per-cell
 *   React content (text, multiple shapes, tooltips with custom UI), which is
 *   what the `table-refactor` chart type is for.
 */
import * as Plot from '@observablehq/plot';
import { DEFAULT_CHART_COLOR } from '../../config/chartLayoutConfig';
import { Field } from '../../types';
import { getResultColumnName, getFieldDisplayName } from '../../utils/fieldUtils';
import { deriveColorScaleInfo } from '../utils/colorSchemeUtils';
import { createTooltipFieldsGetter } from '../utils/tooltipUtils';
import { ChartGenerationContext, PlotResult, SharedDomains } from '../types';
import { FacetPlan, planFacets } from '../faceting/facetPlanner';
import {
  coordinateFacetedGrid,
  CellGenerator,
  CellResult,
  FacetCellContext,
} from '../faceting/facetCoordinator';

export interface HeatmapOptionsInput {
  data: any[];
  xField: Field;
  yField: Field;
  colorField?: Field | null;
  colorScheme?: string;
  colorBias?: number;
  manualColor?: string;
  tooltipFields?: Field[];
  facetFields?: Field[];
}

export function buildHeatmapOptions(input: HeatmapOptionsInput): Plot.PlotOptions {
  const {
    data,
    xField,
    yField,
    colorField,
    colorScheme,
    colorBias,
    manualColor,
    tooltipFields,
    facetFields,
  } = input;

  const xCol = getResultColumnName(xField);
  const yCol = getResultColumnName(yField);
  const fillCol = colorField ? getResultColumnName(colorField) : undefined;

  const colorScale = colorField
    ? deriveColorScaleInfo(data, colorField, colorScheme, colorBias)
    : null;

  // Build the color scale config for Plot. For continuous (typical for
  // measures), use a linear scale; for categorical, pass an ordinal scale.
  let colorOption: Plot.ScaleOptions | undefined;
  if (colorScale && fillCol) {
    if (colorScale.kind === 'continuous') {
      colorOption = {
        type: 'linear',
        domain: colorScale.domain as [number, number],
        range: colorScale.range,
        ...(colorScale.interpolate ? { interpolate: colorScale.interpolate } : {}),
        label: getFieldDisplayName(colorField as Field),
      };
    } else {
      colorOption = {
        type: 'categorical',
        domain: colorScale.domain as any[],
        range: colorScale.range,
        label: getFieldDisplayName(colorField as Field),
      };
    }
  }

  // Resolve a manual fallback fill when there is no color field.
  const effectiveManualFill = manualColor || DEFAULT_CHART_COLOR;

  // Tooltip plumbing — mirrors other chart types so tooltip-driven filtering
  // continues to work.
  const tooltipGetter = createTooltipFieldsGetter(
    [
      { label: getFieldDisplayName(xField), column: xCol, sourceField: xField },
      { label: getFieldDisplayName(yField), column: yCol, sourceField: yField },
    ],
    colorField || undefined,
    undefined,
    tooltipFields,
    [],
    facetFields,
  );

  const cellOptions: Plot.CellOptions = {
    x: xCol,
    y: yCol,
    ...(fillCol ? { fill: fillCol } : { fill: effectiveManualFill }),
    inset: 0.5,
    title: (d: any) => {
      const fields = tooltipGetter(d);
      return fields.map((f) => `${f.label}: ${f.formattedValue}`).join('\n');
    },
  } as Plot.CellOptions;

  return {
    x: { type: 'band', label: getFieldDisplayName(xField) },
    y: { type: 'band', label: getFieldDisplayName(yField) },
    ...(colorOption ? { color: colorOption } : {}),
    marks: [Plot.cell(data, cellOptions)],
  };
}

/**
 * Build the message used by the heatmap entry point when the field
 * configuration cannot be resolved into a single (x, y) chart.
 */
function createHeatmapMessage(message: string): PlotResult {
  return {
    library: 'observable-plot',
    plots: [
      {
        id: 'heatmap-message',
        title: '',
        options: {
          marks: [
            Plot.text([message], {
              frameAnchor: 'middle',
              fontSize: 14,
              fill: 'gray',
            }),
          ],
        },
        position: { row: 0, col: 0 },
      },
    ],
    layout: {
      type: 'grid',
      columns: 1,
      rows: 1,
      columnSizes: ['fr'],
      rowSizes: ['fr'],
    },
  };
}

/**
 * Pick the heatmap's X / Y axis fields from the user's shelf configuration.
 *
 * The first field on each axis becomes the band-axis of the heatmap; any
 * remaining discrete dimensions on the same axis become facets stacked around
 * the chart. We don't restrict to discrete dims here because Plot's `band`
 * scale renders any field reasonably, and constraining the input would make
 * the chart silently disappear for borderline configurations.
 */
function pickHeatmapAxisFields(
  context: ChartGenerationContext,
): { xField: Field; yField: Field } | null {
  const xField = context.xFields[0];
  const yField = context.yFields[0];
  if (!xField || !yField) return null;
  return { xField, yField };
}

function createHeatmapCellGenerator(
  context: ChartGenerationContext,
  xField: Field,
  yField: Field,
): CellGenerator {
  return (
    cellData: any[],
    _cellContext: ChartGenerationContext,
    _sharedDomains: SharedDomains,
    _facetPosition: { row: number; col: number },
    facetCellContext?: FacetCellContext,
  ): CellResult => {
    const facetFields = facetCellContext
      ? [...facetCellContext.rowFacetFields, ...facetCellContext.colFacetFields]
      : [];

    const options = buildHeatmapOptions({
      data: cellData,
      xField,
      yField,
      colorField: context.colorField || null,
      colorScheme: context.colorScheme,
      colorBias: context.colorBias,
      manualColor: context.manualColor,
      tooltipFields: context.tooltipFields,
      facetFields,
    });

    return {
      plots: [
        {
          id: 'heatmap',
          title: '',
          options: options as any,
          position: { row: 0, col: 0 },
        },
      ],
      columns: 1,
      rows: 1,
      columnSizes: ['fr'],
      rowSizes: ['fr'],
    };
  };
}

/**
 * Drop the heatmap's chosen X / Y axis fields from the facet plan: those
 * dimensions belong to the heatmap's band axes, not to the surrounding
 * facet grid. Any extra discrete dims remain as facets.
 */
function filterHeatmapFacetPlan(
  plan: FacetPlan | null,
  xField: Field,
  yField: Field,
): FacetPlan | null {
  if (!plan) return null;
  const filtered: FacetPlan = {
    rowFacetFields: plan.rowFacetFields.filter((f) => f.id !== yField.id),
    colFacetFields: plan.colFacetFields.filter((f) => f.id !== xField.id),
  };
  return filtered;
}

/**
 * Public entry point for the `'heatmap'` global chart type. Bypasses the
 * default cartesian / cell-pair pipeline because heatmaps consume two
 * discrete dimensions as their own band axes (rather than as facets).
 */
export function generateHeatmapGrid(context: ChartGenerationContext): PlotResult {
  const picked = pickHeatmapAxisFields(context);
  if (!picked) {
    return createHeatmapMessage('Heatmap needs one field on X and one on Y.');
  }
  const { xField, yField } = picked;

  const cellGenerator = createHeatmapCellGenerator(context, xField, yField);
  const filteredPlan = filterHeatmapFacetPlan(planFacets(context), xField, yField);

  if (
    filteredPlan &&
    (filteredPlan.rowFacetFields.length > 0 || filteredPlan.colFacetFields.length > 0)
  ) {
    return coordinateFacetedGrid({
      context,
      plan: filteredPlan,
      cellGenerator,
    });
  }

  // No remaining facets → render a single full-size heatmap.
  const cell = cellGenerator(
    context.queryResult.rows,
    context,
    { measure: {}, numeric: {}, categorical: {}, colorScale: null },
    { row: 0, col: 0 },
  );
  return {
    library: 'observable-plot',
    plots: cell.plots,
    layout: {
      type: 'grid',
      columns: cell.columns,
      rows: cell.rows,
      columnSizes: cell.columnSizes || ['fr'],
      rowSizes: cell.rowSizes || ['fr'],
    },
  };
}
