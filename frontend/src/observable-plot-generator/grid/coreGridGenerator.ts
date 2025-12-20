import * as Plot from '@observablehq/plot';
import { generatePairChartOptions } from '../chartTypes/cellCharts';
import { Field } from '../../types';
import { ChartTypeOverrides, mapUserChartTypeToCellChartType } from '../helpers/chartTypeResolver';
import { computeSharedNumericDomains } from '../domains/numericDomains';
import { computeSharedMeasureDomains } from '../domains/measureDomains';
import { ChartGenerationContext, PlotResult } from '../types';
import { FieldOverrideState, UserChartType } from '../../types';
import { FieldOverrideTarget } from '../utils/fieldOverrides';
import { FieldAnalysis } from '../analysis/fieldAnalysis';
import { deriveColorScaleInfo, applyMeasureNameColorOverrides } from '../utils/colorSchemeUtils';
import { isMeasureValuesField, combineMeasureValuesOverrides } from '../../utils/syntheticFields';
import { hasHeterogeneousChartTypes, generateMeasureValuesMultiMarkPlot } from '../chartTypes/measureValuesMultiMark';

export type CartesianPlot = {
  id: string;
  title: string;
  options: Plot.PlotOptions;
  position: { row: number; col: number };
};

/**
 * Build a cartesian pairing grid between xCandidates and yCandidates.
 * - If both are measures → scatter by their measure columns
 * - If one is measure and other is dimension → line chart
 * - If both are dimensions → scatter
 * Uses CSS grid with positions. For now, non-bar charts use 'fr' sizing.
 */
export function generateCartesianGrid(
  context: ChartGenerationContext,
  analysis: FieldAnalysis,
  xCandidates: Field[],
  yCandidates: Field[],
  overrides?: ChartTypeOverrides
): PlotResult {
  const { queryResult, colorField, colorScheme, colorBias, sizeField, sizeRange, manualSize } = context;
  const data = queryResult.rows;

  // Compute shared domains for any measures used in the grid
  const sharedMeasureDomains = computeSharedMeasureDomains(data, xCandidates, yCandidates, colorField);

  const labelCfg = buildLabelCfg(context);
  const plots = generateCartesianPlots(
    data,
    xCandidates,
    yCandidates,
    sharedMeasureDomains,
    overrides,
    colorField,
    colorScheme,
    colorBias,
    sizeField,
    sizeRange,
    manualSize,
    context.manualColor,
    labelCfg,
    context.fieldOverrides,
    context.fieldOverrideTargets,
    [...xCandidates, ...yCandidates, ...(colorField ? [colorField] : []), ...(sizeField ? [sizeField] : [])],
    context.tooltipFields,
    context.globalChartType,
    context.measureValuesSourceFields
  );

  // Derive per-column width and per-row height from plots' options when available
  const columnSizes: Array<number | 'fr'> = Array.from({ length: xCandidates.length }, (_, c) => {
    const sample = plots.find((p) => p.position.col === c);
    const w = (sample as any)?.options?.width;
    return typeof w === 'number' ? w : 'fr';
  });
  const rowSizes: Array<number | 'fr'> = Array.from({ length: yCandidates.length }, (_, r) => {
    const sample = plots.find((p) => p.position.row === r);
    const h = (sample as any)?.options?.height;
    return typeof h === 'number' ? h : 'fr';
  });

  return {
    library: 'observable-plot',
    plots,
    sharedDomains: { byMeasure: sharedMeasureDomains as any },
    layout: {
      type: 'grid',
      columns: xCandidates.length,
      rows: yCandidates.length,
      columnSizes,
      rowSizes,
    },
  };
}

/**
 * Build plot specs for all X×Y candidate pairs. Shared measure domains are provided by caller.
 */
export function generateCartesianPlots(
  data: any[],
  xCandidates: Field[],
  yCandidates: Field[],
  sharedMeasureDomains: Record<string, [number, number] | [Date, Date]>,
  overrides?: ChartTypeOverrides,
  colorField?: Field,
  colorScheme?: string,
  colorBias?: number,
  sizeField?: Field,
  sizeRange?: [number, number],
  manualSize?: number,
  manualColor?: string,
  labelCfg?: { labelFields: Field[]; labelsEnabled: boolean; samplingStrategy: 'auto' | 'all' | 'sample'; samplingThreshold: number; sampleEvery: number },
  fieldOverrides?: Record<string, FieldOverrideState>,
  fieldOverrideTargets?: FieldOverrideTarget[],
  allFields?: Field[],
  tooltipFields?: Field[],
  globalChartType?: UserChartType | null,
  measureValuesSourceFields?: Field[]
): CartesianPlot[] {
  const plots: CartesianPlot[] = [];

  // Compute shared numeric domains for both measures and continuous dimensions
  // (this unifies scales across the whole matrix when the same field appears).
  const sharedNumeric = computeSharedNumericDomains(data, xCandidates as any[], yCandidates as any[]);

  // Compute a shared color domain across the entire grid when a color field is present
  let sharedColorScale = colorField ? deriveColorScaleInfo(data, colorField, colorScheme, colorBias) : null;
  
  // Apply per-measure color overrides if color field is MeasureNames
  sharedColorScale = applyMeasureNameColorOverrides(
    sharedColorScale,
    colorField,
    measureValuesSourceFields,
    fieldOverrides
  );

  // Build lookup maps for overrides and fields
  const overrideMap: Record<string, FieldOverrideState> = fieldOverrides || {};
  const targetAxisByFieldId: Record<string, 'x' | 'y'> = {};
  (fieldOverrideTargets || []).forEach((t) => {
    targetAxisByFieldId[t.fieldId] = t.axis;
  });
  const fieldById: Record<string, Field> = {};
  (allFields || []).forEach((f) => {
    if (!fieldById[f.id]) {
      fieldById[f.id] = f;
    }
  });

  // Pre-compute combined override for MeasureValues if applicable
  const measureValuesOverride = combineMeasureValuesOverrides(
    measureValuesSourceFields,
    fieldOverrides
  );

  for (let r = 0; r < yCandidates.length; r++) {
    for (let c = 0; c < xCandidates.length; c++) {
      const xField = xCandidates[c];
      const yField = yCandidates[r];

      // Check if either axis has MeasureValues
      const xIsMeasureValues = isMeasureValuesField(xField);
      const yIsMeasureValues = isMeasureValuesField(yField);

      // Resolve effective overrides for this cell based on which axis is configured
      const xTargetAxis = targetAxisByFieldId[xField.id];
      const yTargetAxis = targetAxisByFieldId[yField.id];
      
      // For MeasureValues fields, use the combined override from source measures
      const xOverride = xIsMeasureValues 
        ? measureValuesOverride 
        : (xTargetAxis === 'x' ? overrideMap[xField.id] : undefined);
      const yOverride = yIsMeasureValues 
        ? measureValuesOverride 
        : (yTargetAxis === 'y' ? overrideMap[yField.id] : undefined);

      // Prefer X-axis override when both are present (defensive; rules should prevent this)
      const cellOverride: FieldOverrideState | undefined = xOverride || yOverride;

      // Start from global encodings
      let cellColorField: Field | undefined | null = colorField;
      let cellColorScheme: string | undefined = colorScheme;
      let cellColorBias: number | undefined = colorBias;
      let cellManualColor: string | undefined = manualColor;
      let cellSizeField: Field | undefined | null = sizeField;
      let cellSizeRange: [number, number] | undefined = sizeRange;
      let cellManualSize: number | undefined = manualSize;

      // Build per-cell chart type override from fieldOverrides or global chart type
      let cellChartTypeOverrides: ChartTypeOverrides | undefined = overrides;
      if (cellOverride?.chartType) {
        // Per-field chart type override takes precedence
        // Determine which axis has the override (prefer X if both have it)
        const overrideAxis = xOverride?.chartType ? 'x' : 'y';
        const cellChartType = mapUserChartTypeToCellChartType(
          cellOverride.chartType,
          overrideAxis,
          xField,
          yField
        );
        cellChartTypeOverrides = {
          ...overrides,
          byFieldId: {
            ...(overrides?.byFieldId || {}),
            [overrideAxis === 'x' ? xField.id : yField.id]: cellChartType,
          },
        };
      } else if (globalChartType) {
        // Fall back to global chart type when no per-field override is set
        // Use x-axis field as the primary for mapping (arbitrary choice, works for most cases)
        const globalCellChartType = mapUserChartTypeToCellChartType(
          globalChartType,
          xField.type === 'measure' ? 'x' : 'y',
          xField,
          yField
        );
        cellChartTypeOverrides = {
          ...overrides,
          global: globalCellChartType,
        };
      }

      if (cellOverride) {
        // Color field: prefer stored field object, fallback to lookup by ID
        if (cellOverride.colorField) {
          cellColorField = cellOverride.colorField;
        } else if (cellOverride.colorFieldId) {
          const cf = fieldById[cellOverride.colorFieldId];
          if (cf) {
            cellColorField = cf;
          }
        }
        if (cellOverride.colorScheme !== undefined) {
          cellColorScheme = cellOverride.colorScheme;
        }
        if (cellOverride.colorBias !== undefined) {
          cellColorBias = cellOverride.colorBias;
        }
        if (cellOverride.manualColor) {
          cellManualColor = cellOverride.manualColor;
        }

        // Size field: prefer stored field object, fallback to lookup by ID
        if (cellOverride.sizeField) {
          cellSizeField = cellOverride.sizeField;
        } else if (cellOverride.sizeFieldId) {
          const sf = fieldById[cellOverride.sizeFieldId];
          if (sf) {
            cellSizeField = sf;
          }
        }
        if (cellOverride.sizeRange) {
          cellSizeRange = cellOverride.sizeRange;
        }
        if (cellOverride.manualSize !== undefined) {
          cellManualSize = cellOverride.manualSize;
        }
      }

      // Check if we need multi-mark rendering for MeasureValues with heterogeneous chart types
      const needsMultiMark = (xIsMeasureValues || yIsMeasureValues) && 
        measureValuesSourceFields?.length && 
        hasHeterogeneousChartTypes(measureValuesSourceFields, fieldOverrides);

      let options: Plot.PlotOptions;
      
      if (needsMultiMark) {
        // Use multi-mark rendering for per-measure chart types
        options = generateMeasureValuesMultiMarkPlot({
          data,
          xField,
          yField,
          measureValuesSourceFields: measureValuesSourceFields!,
          fieldOverrides: fieldOverrides || {},
          colorField: cellColorField || undefined,
          sharedColorScale: sharedColorScale,
          manualSize: cellManualSize,
          sharedDomains: { ...sharedMeasureDomains, ...sharedNumeric },
          tooltipFields,
        });
      } else {
        // Standard single-mark rendering
        options = generatePairChartOptions(
          data,
          xField,
          yField,
          { ...sharedMeasureDomains, ...sharedNumeric },
          cellChartTypeOverrides,
          cellColorField || undefined,
          cellSizeField || undefined,
          cellSizeRange,
          cellManualSize,
          cellColorScheme,
          cellColorBias,
          cellManualColor,
          (() => {
            // Per-cell label configuration based on dataLabelMode and labelFields
            if (!labelCfg) return undefined;
            if (cellOverride?.dataLabelMode === 'off') {
              return undefined;
            }
            
            // Build effective labelCfg for this cell
            let effectiveLabelCfg = { ...labelCfg };
            
            // If cell override has labelFields, use those instead of global
            if (cellOverride?.labelFields && cellOverride.labelFields.length > 0) {
              effectiveLabelCfg = {
                ...effectiveLabelCfg,
                labelFields: cellOverride.labelFields,
              };
            }
            
            // If dataLabelMode is 'on', force enable labels
            if (cellOverride?.dataLabelMode === 'on') {
              effectiveLabelCfg.labelsEnabled = true;
            }
            
            return effectiveLabelCfg;
          })(),
          tooltipFields
        );
      }

      // Apply shared color domain to keep color mapping consistent across the grid
      if (sharedColorScale) {
        const colorLabel = colorField?.columnName;
        const sharedConfig = sharedColorScale.kind === 'continuous'
          ? {
              type: 'linear',
              domain: sharedColorScale.domain as [number, number],
              range: sharedColorScale.range,
              clamp: true,
              label: colorLabel,
            }
          : {
              type: 'ordinal' as any,
              domain: sharedColorScale.domain as any[],
              range: sharedColorScale.range,
              label: colorLabel,
            };

        options = {
          ...options,
          color: {
            ...(options as any).color,
            ...sharedConfig,
          } as any,
        };
      }
      const title = buildCellTitle(xField, yField);
      plots.push({ id: `cell-${r}-${c}`, title, options, position: { row: r, col: c } });
    }
  }

  return plots;
}

function buildCellTitle(xField: Field, yField: Field): string {
  const xLabel = xField.type === 'measure' ? `${xField.aggregation || 'sum'}(${xField.columnName})` : xField.columnName;
  const yLabel = yField.type === 'measure' ? `${yField.aggregation || 'sum'}(${yField.columnName})` : yField.columnName;
  return `${yLabel} vs ${xLabel}`;
}

function buildLabelCfg(context: ChartGenerationContext) {
  const {
    labelFields = [],
    labelsEnabled = false,
    labelSamplingStrategy = 'auto',
    labelSamplingThreshold = 300,
    labelSampleEvery = 1,
  } = context as any;
  if (!labelsEnabled && (labelFields?.length || 0) === 0) return undefined;
  return {
    labelFields,
    labelsEnabled,
    samplingStrategy: labelSamplingStrategy,
    samplingThreshold: labelSamplingThreshold,
    sampleEvery: labelSampleEvery,
  };
}
