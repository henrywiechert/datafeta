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
import { DEFAULT_CHART_COLOR, SIZE_DEFAULTS_BY_CHART_TYPE } from '../../config/chartLayoutConfig';
import { Field } from '../../types';
import { getResultColumnName, getFieldDisplayName } from '../../utils/fieldUtils';
import { deriveColorScaleInfo } from '../utils/colorSchemeUtils';
import { createSizeScale } from '../utils/sizeUtils';
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
  /**
   * When provided, switches the heatmap from a band-filling `Plot.cell` to a
   * `Plot.dot` with `symbol: 'square'` so the size-shelf measure can scale
   * each square (Tableau-style "size on heatmap"). Without a size field the
   * cell mark is preferred because it fills its band cleanly.
   */
  sizeField?: Field | null;
  sizeRange?: [number, number];
  manualSize?: number;
  /**
   * Optional fields whose per-row values are rendered as text labels on each
   * cell. The first label field's column drives the visible text; further
   * fields could be supported by stacking marks if needed in the future.
   */
  labelFields?: Field[];
  tooltipFields?: Field[];
  facetFields?: Field[];
}

const HEATMAP_X_INDEX_COL = '__heatmapXIndex';
const HEATMAP_Y_INDEX_COL = '__heatmapYIndex';
const HEATMAP_SCALE_COL = '__heatmapCellScale';

function domainValueKey(value: any): string {
  if (value instanceof Date) return `date:${value.getTime()}`;
  return `${typeof value}:${String(value)}`;
}

function getOrderedDistinctValues(data: any[], column: string): any[] {
  const values: any[] = [];
  const seen = new Set<string>();
  data.forEach((row) => {
    const value = row?.[column];
    const key = domainValueKey(value);
    if (seen.has(key)) return;
    seen.add(key);
    values.push(value);
  });

  return values.sort((a, b) => {
    const numA = typeof a === 'number' && Number.isFinite(a)
      ? a
      : (typeof a === 'string' && a.trim() !== '' && Number.isFinite(Number(a)) ? Number(a) : null);
    const numB = typeof b === 'number' && Number.isFinite(b)
      ? b
      : (typeof b === 'string' && b.trim() !== '' && Number.isFinite(Number(b)) ? Number(b) : null);
    if (numA !== null && numB !== null) {
      return numA - numB;
    }
    if (a instanceof Date && b instanceof Date) {
      return a.getTime() - b.getTime();
    }
    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
  });
}

function formatHeatmapAxisTick(value: any): string {
  return formatHeatmapLabel(value);
}

function normalizeHeatmapCellScale(size: number, fullCellSize: number): number {
  if (!Number.isFinite(size) || fullCellSize <= 0) return 1;
  return Math.max(0.05, Math.min(1, size / fullCellSize));
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
    sizeField,
    sizeRange,
    manualSize,
    labelFields,
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
    sizeField || undefined,
    tooltipFields,
    [],
    facetFields,
  );

  // Pick the primary mark. With size-shelf encoding we render dots so each
  // square shrinks/grows with the field. We also honor an explicit manual-size
  // slider change by switching to a fixed-size square-dot heatmap, while the
  // default heatmap size continues to render band-filling cells.
  const heatmapDefaultManualSize = SIZE_DEFAULTS_BY_CHART_TYPE.heatmap;
  const hasManualSizeOverride =
    Number.isFinite(manualSize as number) &&
    (manualSize as number) > 0 &&
    (manualSize as number) !== heatmapDefaultManualSize;
  const useScaledRectMark = !!sizeField || hasManualSizeOverride;
  const sizeCol = sizeField ? getResultColumnName(sizeField) : undefined;
  const xDomainValues = getOrderedDistinctValues(data, xCol);
  const yDomainValues = getOrderedDistinctValues(data, yCol);
  const xIndexByValue = new Map(xDomainValues.map((value, index) => [domainValueKey(value), index]));
  const yIndexByValue = new Map(yDomainValues.map((value, index) => [domainValueKey(value), index]));
  const effectiveSizeRange = sizeRange ?? [4, 20];
  const sizeScale = createSizeScale(
    data,
    sizeField || null,
    effectiveSizeRange,
    manualSize ?? heatmapDefaultManualSize,
  );
  const sizedHeatmapData = data.map((row) => {
    const scaledSize = sizeField
      ? sizeScale.getSizeForValue(row?.[sizeCol as string])
      : (manualSize ?? heatmapDefaultManualSize);
    return {
      ...row,
      [HEATMAP_X_INDEX_COL]: xIndexByValue.get(domainValueKey(row?.[xCol])) ?? 0,
      [HEATMAP_Y_INDEX_COL]: yIndexByValue.get(domainValueKey(row?.[yCol])) ?? 0,
      [HEATMAP_SCALE_COL]: normalizeHeatmapCellScale(scaledSize, heatmapDefaultManualSize),
    };
  });

  const primaryMark = useScaledRectMark
    ? Plot.rect(sizedHeatmapData, {
        x1: (d: any) => d[HEATMAP_X_INDEX_COL] - d[HEATMAP_SCALE_COL] / 2,
        x2: (d: any) => d[HEATMAP_X_INDEX_COL] + d[HEATMAP_SCALE_COL] / 2,
        y1: (d: any) => d[HEATMAP_Y_INDEX_COL] - d[HEATMAP_SCALE_COL] / 2,
        y2: (d: any) => d[HEATMAP_Y_INDEX_COL] + d[HEATMAP_SCALE_COL] / 2,
        ...(fillCol ? { fill: fillCol } : { fill: effectiveManualFill }),
        inset: 0,
      } as Plot.RectOptions)
    : Plot.cell(data, {
        x: xCol,
        y: yCol,
        ...(fillCol ? { fill: fillCol } : { fill: effectiveManualFill }),
        inset: 0.5,
      } as Plot.CellOptions);

  // Optional text overlay: render the first label field's value (or, if it's
  // a measure, its formatted value) inside each cell. A multi-source label
  // model exists for the table chart type but is overkill here — heatmaps
  // typically display a single value per cell.
  const marks: any[] = [primaryMark];
  const primaryLabelField = labelFields?.[0];
  if (primaryLabelField) {
    const labelCol = getResultColumnName(primaryLabelField);
    marks.push(
      Plot.text(useScaledRectMark ? sizedHeatmapData : data, {
        x: useScaledRectMark ? HEATMAP_X_INDEX_COL : xCol,
        y: useScaledRectMark ? HEATMAP_Y_INDEX_COL : yCol,
        text: (d: any) => formatHeatmapLabel(d?.[labelCol]),
        fill: 'currentColor',
        stroke: 'white',
        strokeWidth: 3,
        paintOrder: 'stroke',
        fontSize: 11,
        frameAnchor: 'middle',
      } as Plot.TextOptions),
    );
  }

  const xTickPositions = xDomainValues.map((_, index) => index);
  const yTickPositions = yDomainValues.map((_, index) => index);

  const options: Plot.PlotOptions = {
    x: useScaledRectMark
      ? {
          type: 'linear',
          label: getFieldDisplayName(xField),
          domain: [-0.5, Math.max(0.5, xDomainValues.length - 0.5)],
          ticks: xTickPositions,
          tickFormat: (value: any) => formatHeatmapAxisTick(xDomainValues[Math.round(Number(value))]),
        }
      : { type: 'band', label: getFieldDisplayName(xField) },
    y: useScaledRectMark
      ? {
          type: 'linear',
          label: getFieldDisplayName(yField),
          domain: [-0.5, Math.max(0.5, yDomainValues.length - 0.5)],
          ticks: yTickPositions,
          tickFormat: (value: any) => formatHeatmapAxisTick(yDomainValues[Math.round(Number(value))]),
        }
      : { type: 'band', label: getFieldDisplayName(yField) },
    ...(colorOption ? { color: colorOption } : {}),
    marks,
  };

  (options as any).__customTooltip = {
    enabled: true,
    data,
    getFields: tooltipGetter,
  };

  return options;
}

/**
 * Format a value for display as a heatmap cell label.
 *
 * Numeric values use `toLocaleString` so large measures get thousands
 * separators; everything else falls back to `String(...)`. Null / undefined
 * render as an empty label so empty cells stay visually clean.
 */
function formatHeatmapLabel(value: any): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' && Number.isFinite(value)) return value.toLocaleString();
  if (value instanceof Date) return value.toLocaleString();
  return String(value);
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
 * Tableau convention: the *innermost* field on each shelf (last one on X, last
 * on Y) drives the chart axes; any *outer* fields ahead of it become row /
 * column facets stacked around the heatmap. We pick the last field on each
 * axis here so the user can drag a higher-level dimension to the left of the
 * heatmap field to wrap the chart in facets.
 *
 * We don't restrict to discrete dims because Plot's `band` scale renders any
 * field reasonably, and constraining the input would make the chart silently
 * disappear for borderline configurations.
 */
function pickHeatmapAxisFields(
  context: ChartGenerationContext,
): { xField: Field; yField: Field } | null {
  const xField = context.xFields[context.xFields.length - 1];
  const yField = context.yFields[context.yFields.length - 1];
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
      sizeField: context.sizeField || null,
      sizeRange: context.sizeRange,
      manualSize: context.manualSize,
      labelFields: context.labelFields,
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
