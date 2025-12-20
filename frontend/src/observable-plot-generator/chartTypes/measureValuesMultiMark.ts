/**
 * Multi-mark chart generator for MeasureValues with per-measure chart type overrides.
 * 
 * When MeasureValues is used and source measures have different chart type overrides,
 * this generates a single plot with multiple mark layers - one per measure - where
 * each measure can use a different mark type (line, scatter, bar, etc.).
 */

import * as Plot from '@observablehq/plot';
import { Field, FieldOverrideState, UserChartType } from '../../types';
import { MEASURE_NAMES_FIELD, MEASURE_VALUES_FIELD } from '../../utils/syntheticFields';
import { getResultColumnName } from '../../utils/fieldUtils';
import { DEFAULT_CHART_COLOR } from '../../config/chartLayoutConfig';
import { deriveColorScaleInfo, ColorScaleInfo } from '../utils/colorSchemeUtils';

/**
 * Check if source measures have heterogeneous (different) chart type overrides.
 * Returns true if at least two measures have different chart types specified,
 * OR if at least one measure has a chart type override (allowing mixed default + override).
 */
export function hasHeterogeneousChartTypes(
  measureValuesSourceFields: Field[] | undefined,
  fieldOverrides: Record<string, FieldOverrideState> | undefined
): boolean {
  if (!measureValuesSourceFields?.length || !fieldOverrides) {
    return false;
  }

  const definedChartTypes: UserChartType[] = [];
  
  for (const sourceField of measureValuesSourceFields) {
    const override = fieldOverrides[sourceField.id];
    if (override?.chartType) {
      definedChartTypes.push(override.chartType);
    }
  }

  // Return true if:
  // 1. At least one measure has a chart type override (will mix with defaults)
  // 2. Or multiple measures have different chart types
  if (definedChartTypes.length === 0) {
    return false;
  }

  // Check if there are different chart types among the defined ones
  const uniqueTypes = new Set(definedChartTypes);
  
  // If there's at least one defined chart type, use multi-mark rendering
  // This allows mixing overridden measures with default-type measures
  return definedChartTypes.length > 0;
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
  defaultSize: number = 5
): number {
  const override = fieldOverrides?.[measureField.id];
  return override?.manualSize ?? defaultSize;
}

/**
 * Get the color for a specific measure from overrides.
 */
function getMeasureColor(
  measureField: Field,
  fieldOverrides: Record<string, FieldOverrideState> | undefined,
  defaultColors: string[],
  measureIndex: number
): string {
  const override = fieldOverrides?.[measureField.id];
  if (override?.manualColor) {
    return override.manualColor;
  }
  return defaultColors[measureIndex % defaultColors.length];
}

interface MultiMarkConfig {
  data: any[];
  xField: Field;
  yField: Field; // This would be MeasureValues typically
  measureValuesSourceFields: Field[];
  fieldOverrides: Record<string, FieldOverrideState>;
  colorField?: Field;
  colorScheme?: string;
  colorBias?: number;
  sizeField?: Field;
  sizeRange?: [number, number];
  manualSize?: number;
  sharedDomains?: Record<string, [number, number] | [Date, Date]>;
  tooltipFields?: Field[];
}

/**
 * Create marks for a specific chart type.
 * Returns an array of marks (some chart types need multiple marks, e.g., line + dots for hover).
 */
function createMarksForType(
  chartType: UserChartType,
  filteredData: any[],
  xColumn: string,
  yColumn: string,
  color: string,
  measureName: string,
  sizeValue: number,
  orientation: 'vertical' | 'horizontal' = 'vertical'
): Plot.Markish[] {
  const marks: Plot.Markish[] = [];
  
  // Tooltip function
  const tooltip = (d: any) => `${measureName}: ${d[yColumn]}`;

  switch (chartType) {
    case 'line':
      // Line mark
      marks.push(Plot.line(filteredData, {
        x: xColumn,
        y: yColumn,
        stroke: color,
        strokeWidth: 2,
        curve: 'catmull-rom',
      }));
      // Add dots on the line for better visibility
      marks.push(Plot.dot(filteredData, {
        x: xColumn,
        y: yColumn,
        fill: color,
        r: 3,
        tip: true,
        title: tooltip,
      }));
      break;

    case 'tick':
      // Tick marks for continuous dimensions
      if (orientation === 'vertical') {
        marks.push(Plot.tickY(filteredData, {
          x: xColumn,
          y: yColumn,
          stroke: color,
          strokeWidth: 2,
          tip: true,
          title: tooltip,
        }));
      } else {
        marks.push(Plot.tickX(filteredData, {
          x: yColumn,
          y: xColumn,
          stroke: color,
          strokeWidth: 2,
          tip: true,
          title: tooltip,
        }));
      }
      break;

    case 'bar':
      // For bars, use appropriate orientation
      if (orientation === 'vertical') {
        marks.push(Plot.barY(filteredData, {
          x: xColumn,
          y: yColumn,
          fill: color,
          tip: true,
          title: tooltip,
        }));
      } else {
        marks.push(Plot.barX(filteredData, {
          x: yColumn,
          y: xColumn,
          fill: color,
          tip: true,
          title: tooltip,
        }));
      }
      break;

    case 'scatter':
    default:
      marks.push(Plot.dot(filteredData, {
        x: xColumn,
        y: yColumn,
        fill: color,
        r: sizeValue,
        tip: true,
        title: tooltip,
      }));
      break;
  }

  return marks;
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
    sharedDomains,
    manualSize = 5,
  } = config;

  // Determine which field is MeasureValues and which is the category/x-axis
  const isMeasureValuesOnY = yField.syntheticType === 'MeasureValues';
  const measureValuesField = isMeasureValuesOnY ? yField : xField;
  
  // IMPORTANT: Use getResultColumnName to get the actual column name in the data
  // This handles aggregation aliases like "SUM(MeasureValues)" instead of just "MeasureValues"
  const measureValuesColumn = getResultColumnName(measureValuesField);
  const measureNamesColumn = MEASURE_NAMES_FIELD;
  
  // The other axis field (usually a dimension for x-axis)
  const categoryField = isMeasureValuesOnY ? xField : yField;
  const categoryColumn = getResultColumnName(categoryField);
  
  // Determine orientation for bar charts
  const orientation: 'vertical' | 'horizontal' = isMeasureValuesOnY ? 'vertical' : 'horizontal';

  // Default color palette (steelblue-based)
  const defaultColors = [
    'steelblue', '#f28e2c', '#e15759', '#76b7b2', '#59a14f',
    '#edc949', '#af7aa1', '#ff9da7', '#9c755f', '#bab0ab'
  ];

  // Create marks for each source measure
  const allMarks: Plot.Markish[] = [];

  for (let i = 0; i < measureValuesSourceFields.length; i++) {
    const measureField = measureValuesSourceFields[i];
    const measureName = measureField.columnName;
    
    // Filter data to only rows for this measure
    const filteredData = data.filter(row => row[measureNamesColumn] === measureName);
    
    if (filteredData.length === 0) continue;

    // Get chart type for this measure (default to line for multi-measure)
    const chartType = getMeasureChartType(measureField, fieldOverrides, 'line');
    
    // Get color for this measure
    const color = getMeasureColor(measureField, fieldOverrides, defaultColors, i);
    
    // Get size for this measure
    const sizeValue = getMeasureSize(measureField, fieldOverrides, manualSize);

    // Create the appropriate marks for this measure
    const measureMarks = createMarksForType(
      chartType,
      filteredData,
      isMeasureValuesOnY ? categoryColumn : measureValuesColumn,
      isMeasureValuesOnY ? measureValuesColumn : categoryColumn,
      color,
      measureName,
      sizeValue,
      orientation
    );

    allMarks.push(...measureMarks);
  }

  // Add a baseline rule at y=0 for reference
  allMarks.push(Plot.ruleY([0], { stroke: '#ccc', strokeWidth: 1 }));

  // Build axis configurations
  // Use friendly display names for labels, but the column names are used internally
  const xAxisConfig: any = {
    label: isMeasureValuesOnY ? categoryField.columnName : measureValuesField.columnName,
    grid: true,
  };
  
  const yAxisConfig: any = {
    label: isMeasureValuesOnY ? measureValuesField.columnName : categoryField.columnName,
    grid: true,
    nice: true,
  };

  // Apply shared domains if available
  // Check both the raw column name and the aggregated alias
  if (sharedDomains) {
    const measureDomain = sharedDomains[measureValuesColumn] || sharedDomains[MEASURE_VALUES_FIELD];
    if (measureDomain) {
      if (isMeasureValuesOnY) {
        yAxisConfig.domain = measureDomain;
      } else {
        xAxisConfig.domain = measureDomain;
      }
    }
  }

  // Build legend showing measure names with their colors
  const legendDomain = measureValuesSourceFields.map(f => f.columnName);
  const legendRange = measureValuesSourceFields.map((f, i) => 
    getMeasureColor(f, fieldOverrides, defaultColors, i)
  );

  return {
    x: xAxisConfig,
    y: yAxisConfig,
    color: {
      type: 'ordinal',
      domain: legendDomain,
      range: legendRange,
      legend: true,
    },
    marks: allMarks,
  };
}

