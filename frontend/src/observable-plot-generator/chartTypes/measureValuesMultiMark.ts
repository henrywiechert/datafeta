/**
 * Multi-mark chart generator for MeasureValues with per-measure chart type overrides.
 * 
 * When MeasureValues is used and source measures have different chart type overrides,
 * this generates a single plot with multiple mark layers - one per measure - where
 * each measure can use a different mark type (line, scatter, bar, etc.).
 */

import * as Plot from '@observablehq/plot';
import { Field, FieldOverrideState, UserChartType } from '../../types';
import { MEASURE_NAMES_FIELD } from '../../utils/syntheticFields';
import { getResultColumnName } from '../../utils/fieldUtils';
import { ColorScaleInfo } from '../utils/colorSchemeUtils';
import { createTooltipFieldsGetter } from '../utils/tooltipUtils';

/**
 * Check if source measures have heterogeneous (different) chart type overrides.
 * Returns true if at least one measure has a chart type override.
 */
export function hasHeterogeneousChartTypes(
  measureValuesSourceFields: Field[] | undefined,
  fieldOverrides: Record<string, FieldOverrideState> | undefined
): boolean {
  if (!measureValuesSourceFields?.length || !fieldOverrides) {
    return false;
  }

  for (const sourceField of measureValuesSourceFields) {
    const override = fieldOverrides[sourceField.id];
    if (override?.chartType) {
      return true;
    }
  }

  return false;
}

/**
 * Get the chart type for a specific measure, falling back to default.
 */
function getMeasureChartType(
  measureField: Field,
  fieldOverrides: Record<string, FieldOverrideState> | undefined,
  defaultChartType: UserChartType = 'line'
): UserChartType {
  const override = fieldOverrides?.[measureField.id];
  return override?.chartType || defaultChartType;
}

/**
 * Get the size for a specific measure from overrides.
 */
function getMeasureSize(
  measureField: Field,
  fieldOverrides: Record<string, FieldOverrideState> | undefined,
  defaultSize: number = 4
): number {
  const override = fieldOverrides?.[measureField.id];
  return override?.manualSize ?? defaultSize;
}

interface MultiMarkConfig {
  data: any[];
  xField: Field;
  yField: Field;
  measureValuesSourceFields: Field[];
  fieldOverrides: Record<string, FieldOverrideState>;
  colorField?: Field;
  colorScheme?: string;
  sharedColorScale?: ColorScaleInfo | null;
  manualSize?: number;
  sharedDomains?: Record<string, [number, number] | [Date, Date]>;
  tooltipFields?: Field[];
}

/**
 * Create marks for a specific chart type.
 * Returns an array of marks (some chart types need multiple marks, e.g., line + dots).
 */
function createMarksForType(
  chartType: UserChartType,
  filteredData: any[],
  xColumn: string,
  yColumn: string,
  colorValue: string | ((d: any) => any),
  sizeValue: number,
  orientation: 'vertical' | 'horizontal',
  tooltipChannels?: Record<string, any>
): Plot.Markish[] {
  // Common options (no tip - we use custom tooltips)
  const baseOptions: any = {
    x: xColumn,
    y: yColumn,
  };

  // Add tooltip channels for hover interaction
  if (tooltipChannels) {
    baseOptions.channels = tooltipChannels;
  }

  switch (chartType) {
    case 'line': {
      // Line chart with visible dots (like the original lineChart)
      const lineConfig: any = {
        ...baseOptions,
        stroke: colorValue,
        strokeWidth: sizeValue,
        z: colorValue, // Group lines by color
      };
      const dotConfig: any = {
        ...baseOptions,
        fill: colorValue,
        r: Math.max(2, sizeValue / 2), // Dot size proportional to line width
        channels: tooltipChannels,
      };
      // Invisible hover dots for better tooltip detection
      const hoverDotConfig: any = {
        x: xColumn,
        y: yColumn,
        r: 6,
        fill: 'transparent',
        stroke: 'transparent',
        strokeWidth: 0,
      };
      return [
        Plot.line(filteredData, lineConfig),
        Plot.dot(filteredData, dotConfig),
        Plot.dot(filteredData, hoverDotConfig),
      ];
    }

    case 'tick':
      if (orientation === 'vertical') {
        return [Plot.tickY(filteredData, {
          ...baseOptions,
          stroke: colorValue,
          strokeWidth: sizeValue,
        })];
      } else {
        return [Plot.tickX(filteredData, {
          x: yColumn,
          y: xColumn,
          stroke: colorValue,
          strokeWidth: sizeValue,
          channels: tooltipChannels,
        })];
      }

    case 'bar':
      if (orientation === 'vertical') {
        return [Plot.barY(filteredData, {
          ...baseOptions,
          fill: colorValue,
        })];
      } else {
        return [Plot.barX(filteredData, {
          x: yColumn,
          y: xColumn,
          fill: colorValue,
          channels: tooltipChannels,
        })];
      }

    case 'scatter':
    default:
      return [Plot.dot(filteredData, {
        ...baseOptions,
        fill: colorValue,
        r: sizeValue,
      })];
  }
}

/**
 * Generate a multi-mark plot for MeasureValues with per-measure chart types.
 * Each source measure is rendered as a separate mark layer with its own chart type.
 */
export function generateMeasureValuesMultiMarkPlot(config: MultiMarkConfig): Plot.PlotOptions {
  const {
    data,
    xField,
    yField,
    measureValuesSourceFields,
    fieldOverrides,
    colorField,
    sharedColorScale,
    sharedDomains,
    manualSize = 4,
    tooltipFields,
  } = config;

  // Determine which field is MeasureValues and which is the category/x-axis
  const isMeasureValuesOnY = yField.syntheticType === 'MeasureValues';
  const measureValuesField = isMeasureValuesOnY ? yField : xField;
  
  // Get the actual column name in the data (handles aggregation aliases)
  const measureValuesColumn = getResultColumnName(measureValuesField);
  const measureNamesColumn = MEASURE_NAMES_FIELD;
  
  // The other axis field
  const categoryField = isMeasureValuesOnY ? xField : yField;
  const categoryColumn = getResultColumnName(categoryField);
  
  const orientation: 'vertical' | 'horizontal' = isMeasureValuesOnY ? 'vertical' : 'horizontal';

  // Build tooltip channels from tooltipFields if provided
  let tooltipChannels: Record<string, any> | undefined;
  if (tooltipFields && tooltipFields.length > 0) {
    tooltipChannels = {};
    for (const field of tooltipFields) {
      const colName = getResultColumnName(field);
      tooltipChannels[field.columnName] = { value: colName, label: field.columnName };
    }
  }

  // Create marks for each source measure
  const allMarks: Plot.Markish[] = [];

  // Check if we have a color field (like MeasureNames on Color)
  // If so, use the MeasureNames column for color instead of per-measure colors
  const hasColorField = !!colorField;
  const colorColumn = colorField ? getResultColumnName(colorField) : undefined;

  for (let i = 0; i < measureValuesSourceFields.length; i++) {
    const measureField = measureValuesSourceFields[i];
    const measureName = measureField.columnName;
    
    // Filter data to only rows for this measure
    const filteredData = data.filter(row => row[measureNamesColumn] === measureName);
    
    if (filteredData.length === 0) continue;

    // Get chart type for this measure
    const chartType = getMeasureChartType(measureField, fieldOverrides, 'line');
    
    // Get size for this measure
    const sizeValue = getMeasureSize(measureField, fieldOverrides, manualSize);

    // Determine color: use color column if color field exists, otherwise use measure name
    // This ensures the color from the global color encoding is used
    const colorValue = hasColorField ? colorColumn! : measureName;

    // Create the marks for this measure (may be multiple, e.g., line + dots)
    const marks = createMarksForType(
      chartType,
      filteredData,
      isMeasureValuesOnY ? categoryColumn : measureValuesColumn,
      isMeasureValuesOnY ? measureValuesColumn : categoryColumn,
      colorValue,
      sizeValue,
      orientation,
      tooltipChannels
    );

    allMarks.push(...marks);
  }

  // Add a baseline rule at y=0
  allMarks.push(Plot.ruleY([0], { stroke: '#ddd', strokeWidth: 1 }));

  // Build axis configurations
  const xAxisConfig: any = {
    label: categoryField.columnName,
    grid: true,
  };
  
  const yAxisConfig: any = {
    label: measureValuesField.columnName,
    grid: true,
    nice: true,
  };

  // Apply shared domains if available
  if (sharedDomains) {
    const measureDomain = sharedDomains[measureValuesColumn];
    if (measureDomain) {
      if (isMeasureValuesOnY) {
        yAxisConfig.domain = measureDomain;
      } else {
        xAxisConfig.domain = measureDomain;
      }
    }
  }

  // Build the plot options
  const plotOptions: Plot.PlotOptions = {
    x: xAxisConfig,
    y: yAxisConfig,
    marks: allMarks,
  };

  // Apply the shared color scale if available (from the parent context)
  // This uses the same color configuration as the rest of the chart system
  // Note: legend is NOT set here - it comes from the parent coordinator
  if (sharedColorScale) {
    const colorConfig = sharedColorScale.kind === 'continuous'
      ? {
          type: 'linear' as const,
          domain: sharedColorScale.domain as [number, number],
          range: sharedColorScale.range,
          clamp: true,
        }
      : {
          type: 'ordinal' as const,
          domain: sharedColorScale.domain as any[],
          range: sharedColorScale.range,
        };
    
    (plotOptions as any).color = {
      ...colorConfig,
      label: colorField?.columnName,
    };
  }

  // Add custom tooltip configuration (same system as other chart types)
  const xLabel = categoryField.columnName;
  const yLabel = measureValuesField.columnName;
  (plotOptions as any).__customTooltip = {
    enabled: true,
    data: data,
    getFields: createTooltipFieldsGetter(
      [
        { label: xLabel, column: categoryColumn },
        { label: yLabel, column: measureValuesColumn }
      ],
      colorField,
      undefined, // sizeField not applicable here
      tooltipFields
    )
  };

  return plotOptions;
}
