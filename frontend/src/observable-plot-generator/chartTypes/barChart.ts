import * as Plot from '@observablehq/plot';
import { ChartGenerationContext } from '../types';
import { DEFAULT_CHART_COLOR, BAR_STEP_PX } from '../../config/chartLayoutConfig';
import { getResultColumnName } from '../../utils/fieldUtils';
import { getFieldColumnName } from '../helpers/fields';
import { getPlotColorConfig } from '../utils/colorSchemeUtils';

// -----------------------------------------------------------------------------
// Refactored bar chart implementation with orientation abstraction.
// Behavior parity with legacy version (zero-based domain, width/height logic).
// -----------------------------------------------------------------------------

const ORIENTATION = {
  vertical: {
    measureChannel: 'y' as const,
    categoryChannel: 'x' as const,
    bar: Plot.barY,
    rule: Plot.ruleY,
    pointer: 'y' as const,
    sizeProp: 'width' as const
  },
  horizontal: {
    measureChannel: 'x' as const,
    categoryChannel: 'y' as const,
    bar: Plot.barX,
    rule: Plot.ruleX,
    pointer: 'x' as const,
    sizeProp: 'height' as const
  }
};
type OrientationKey = keyof typeof ORIENTATION;

function numericExtent(rows: any[], column: string): [number, number] {
  let min = Infinity; let max = -Infinity;
  for (const row of rows) {
    const v = row[column];
    if (typeof v === 'number' && isFinite(v)) {
      if (v < min) min = v; if (v > max) max = v;
    }
  }
  if (min === Infinity || max === -Infinity) return [0, 0];
  return [min, max];
}

function legacyZeroBasedDomain(rows: any[], measureCol: string): [number, number] {
  const [, maxVal] = numericExtent(rows, measureCol);
  const upperRaw = Math.max(0, maxVal);
  const upper = upperRaw === 0 ? 1 : upperRaw * 1.05;
  return [0, upper];
}

function buildTooltipFormat(colorField?: any, sizeField?: any) {
  const fmt: Record<string, any> = { fill: false };
  if (colorField) fmt[colorField.columnName] = true;
  if (sizeField) fmt[sizeField.columnName] = true;
  return fmt;
}

function buildChannels(colorField?: any, sizeField?: any) {
  const channels: Record<string, { value: string; label: string }> = {};
  if (colorField) {
    const col = getFieldColumnName(colorField);
    channels[colorField.columnName] = { value: col, label: colorField.columnName };
  }
  if (sizeField) {
    const col = getResultColumnName(sizeField);
    channels[sizeField.columnName] = { value: col, label: sizeField.columnName };
  }
  return channels;
}

function buildColorScale(data: any[], colorField: any, colorScheme?: string) {
  if (!colorField) return undefined;
  const colorColumn = getFieldColumnName(colorField);
  const values = Array.from(new Set(data.map(r => r[colorColumn])));
  const cfg = getPlotColorConfig(colorScheme);
  return { domain: values, ...cfg, type: 'ordinal' as const };
}

export function barChart(context: ChartGenerationContext): Plot.PlotOptions {
  const { queryResult, xFields, yFields, colorField, colorScheme, sizeField } = context;
  const data = queryResult.rows;

  const yMeasure = yFields.find(f => f.type === 'measure');
  const xMeasure = xFields.find(f => f.type === 'measure');

  let orientation: OrientationKey;
  let measureField: any;
  if (yMeasure) {
    orientation = 'vertical';
    measureField = { ...yMeasure, aggregation: yMeasure.aggregation || 'sum' };
  } else if (xMeasure) {
    orientation = 'horizontal';
    measureField = { ...xMeasure, aggregation: xMeasure.aggregation || 'sum' };
  } else {
    throw new Error('Bar chart requires at least one measure.');
  }

  const O = ORIENTATION[orientation];
  const measureName = getResultColumnName(measureField);

  const dimensionField = orientation === 'vertical'
    ? xFields.find(f => f.type === 'dimension')
    : yFields.find(f => f.type === 'dimension');

  const SINGLE_CATEGORY = ' ';
  const categoryColumnName = dimensionField ? getFieldColumnName(dimensionField) : SINGLE_CATEGORY;
  const categories = dimensionField
    ? Array.from(new Set(data.map(r => r[categoryColumnName])))
    : [SINGLE_CATEGORY];

  const barCount = categories.length;
  const visualSize = barCount === 1 ? BAR_STEP_PX * 5 : barCount * BAR_STEP_PX;

  const [d0, d1] = legacyZeroBasedDomain(data, measureName);
  const tipFormat = buildTooltipFormat(colorField, sizeField);
  const channels = buildChannels(colorField, sizeField);

  const barConfig: any = {
    [O.measureChannel]: measureName,
    fill: colorField ? getFieldColumnName(colorField) : DEFAULT_CHART_COLOR,
    channels
  };
  if (dimensionField) {
    barConfig[O.categoryChannel] = categoryColumnName;
  } else {
    barConfig[O.categoryChannel] = () => SINGLE_CATEGORY;
  }

  const barMark = O.bar(data, { ...barConfig, tip: { pointer: O.pointer, preferredAnchor: 'top-right', format: tipFormat } });
  const zeroRule = O.rule([0]);

  const plotOptions: Plot.PlotOptions = {
    marks: [barMark, zeroRule],
    [O.sizeProp]: visualSize,
    [O.categoryChannel]: {
      label: categoryColumnName,
      domain: categories as any,
      type: 'band' as any,
      padding: 0.1 as any,
    },
    [O.measureChannel]: {
      grid: true,
      label: measureName,
      domain: [d0, d1] as any,
      nice: false,
    }
  } as any;

  const colorScale = colorField ? buildColorScale(data, colorField, colorScheme) : undefined;
  if (colorScale) {
    (plotOptions as any).color = colorScale;
  }

  return plotOptions;
}