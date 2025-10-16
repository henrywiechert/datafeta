import { ChartGenerationContext } from '../types';
import { getFieldColumnName } from '../helpers/fields';
import { resolveMeasureAlias, buildBarOptions, computeBandPaddingFromSizeField } from './barCore';
import { deriveColorScaleInfo } from '../utils/colorSchemeUtils';
import { getResultColumnName } from '../../utils/fieldUtils';

// Unified bar chart: single & (future) multi-measure handled via higher-level orchestrators.
// This file now simply selects orientation + fields and delegates to barCore.

export function barChart(context: ChartGenerationContext) {
  const { queryResult, xFields, yFields, colorField, colorScheme, sizeField, sizeRange, manualSize } = context;
  const data = queryResult.rows;

  const yMeasure = yFields.find(f => f.type === 'measure');
  const xMeasure = xFields.find(f => f.type === 'measure');
  if (!yMeasure && !xMeasure) throw new Error('Bar chart requires at least one measure.');

  const orientation = yMeasure ? 'vertical' : 'horizontal';
  const measureField = (yMeasure || xMeasure)!;
  const measureName = resolveMeasureAlias(measureField);

  const dimensionField = orientation === 'vertical'
    ? xFields.find(f => f.type === 'dimension')
    : yFields.find(f => f.type === 'dimension');
  const categoryColumn = dimensionField ? getFieldColumnName(dimensionField) : undefined;

  const colorColumn = colorField ? getResultColumnName(colorField) : undefined;
  const colorScale = colorField ? deriveColorScaleInfo(data, colorField, colorScheme) : null;

  // Derive dynamic band padding with manual size
  const dynamicPadding = computeBandPaddingFromSizeField(data, sizeField, {
    manualSize,
  }) ?? undefined;

  return buildBarOptions({
    data,
    measureName,
    orientation,
    categoryColumn,
    colorColumn,
  colorScale,
    bandPadding: dynamicPadding,
    zeroBaseline: true,
    tooltipColumns: [colorField?.columnName, sizeField?.columnName].filter(Boolean) as string[],
    singleBarSizeMultiplier: 2, // legacy visual sizing for single bar (restored)
  });
}