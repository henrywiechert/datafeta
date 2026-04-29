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
