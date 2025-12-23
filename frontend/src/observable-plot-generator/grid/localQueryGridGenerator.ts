/**
 * Local Query Grid Generator
 * 
 * Async version of coreGridGenerator that uses DuckDB WASM for per-chart queries.
 * This enables optimal per-pair DISTINCT and ROUND operations.
 */

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
import { hasAnyMeasureOverrides, generateMeasureValuesMultiMarkPlot } from '../chartTypes/measureValuesMultiMark';
import { chartQueryService, ChartQueryOptions } from '../../services/chartQueryService';
import { CartesianPlot } from './coreGridGenerator';
import { getFieldOutputColumnName } from '../../utils/fieldColumnName';

export interface LocalQueryGridOptions {
  /** Cache key (table name) in DuckDB WASM */
  cacheKey: string;
  /** Enable adaptive rounding for large datasets */
  enableRounding?: boolean;
  /** Target buckets per dimension when rounding */
  targetBuckets?: number;
  /** Cardinality threshold for auto-enabling rounding */
  roundingThreshold?: number;
}

/**
 * Build a cartesian pairing grid using local DuckDB WASM queries.
 * 
 * This is an async version of generateCartesianGrid that:
 * - Queries each chart pair independently via DuckDB WASM
 * - Applies per-pair DISTINCT and optional ROUND
 * - Avoids the cross-product problem of multi-dimensional queries
 * 
 * @param context - Chart generation context
 * @param analysis - Field analysis results
 * @param xCandidates - X-axis candidate fields
 * @param yCandidates - Y-axis candidate fields
 * @param localOptions - Local query options (cache key, rounding settings)
 * @param overrides - Chart type overrides
 * @returns PlotResult with optimized per-chart data
 */
export async function generateCartesianGridLocal(
  context: ChartGenerationContext,
  analysis: FieldAnalysis,
  xCandidates: Field[],
  yCandidates: Field[],
  localOptions: LocalQueryGridOptions,
  overrides?: ChartTypeOverrides
): Promise<PlotResult> {
  const { colorField, colorScheme, colorBias, sizeField, sizeRange, manualSize } = context;

  // Build label configuration
  const labelCfg = buildLabelCfg(context);

  // Generate plots with per-chart local queries
  const plots = await generateCartesianPlotsLocal(
    context,
    xCandidates,
    yCandidates,
    localOptions,
    overrides,
    labelCfg
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
    sharedDomains: { byMeasure: {} }, // Domains computed per-chart
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
 * Build plot specs for all X×Y candidate pairs using local DuckDB WASM queries.
 */
async function generateCartesianPlotsLocal(
  context: ChartGenerationContext,
  xCandidates: Field[],
  yCandidates: Field[],
  localOptions: LocalQueryGridOptions,
  overrides?: ChartTypeOverrides,
  labelCfg?: { labelFields: Field[]; labelsEnabled: boolean; samplingStrategy: 'auto' | 'all' | 'sample'; samplingThreshold: number; sampleEvery: number }
): Promise<CartesianPlot[]> {
  const {
    colorField,
    colorScheme,
    colorBias,
    sizeField,
    sizeRange,
    manualSize,
    manualColor,
    fieldOverrides,
    fieldOverrideTargets,
    tooltipFields,
    globalChartType,
    measureValuesSourceFields,
  } = context;

  const {
    cacheKey,
    enableRounding = true,
    targetBuckets = 100,
    roundingThreshold = 10000,
  } = localOptions;

  // Build lookup maps for overrides and fields
  const overrideMap: Record<string, FieldOverrideState> = fieldOverrides || {};
  const targetAxisByFieldId: Record<string, 'x' | 'y'> = {};
  (fieldOverrideTargets || []).forEach((t) => {
    targetAxisByFieldId[t.fieldId] = t.axis;
  });

  const allFields = [
    ...xCandidates,
    ...yCandidates,
    ...(colorField ? [colorField] : []),
    ...(sizeField ? [sizeField] : []),
  ];
  const fieldById: Record<string, Field> = {};
  allFields.forEach((f) => {
    if (!fieldById[f.id]) {
      fieldById[f.id] = f;
    }
  });

  // Pre-compute combined override for MeasureValues if applicable
  const measureValuesOverride = combineMeasureValuesOverrides(
    measureValuesSourceFields,
    fieldOverrides
  );

  // Build chart query options
  const queryOptions: ChartQueryOptions = {
    rounding: enableRounding,
    targetBuckets,
    roundingThreshold,
    additionalColumns: [
      ...(colorField ? [getFieldOutputColumnName(colorField)] : []),
      ...(sizeField ? [getFieldOutputColumnName(sizeField)] : []),
      ...(labelCfg?.labelFields?.map(f => getFieldOutputColumnName(f)) || []),
      ...(tooltipFields?.map(f => getFieldOutputColumnName(f)) || []),
    ].filter((v, i, a) => a.indexOf(v) === i), // Deduplicate
  };

  // Generate plots in parallel
  const plotPromises: Promise<CartesianPlot>[] = [];

  for (let r = 0; r < yCandidates.length; r++) {
    for (let c = 0; c < xCandidates.length; c++) {
      const xField = xCandidates[c];
      const yField = yCandidates[r];

      plotPromises.push(
        generateSinglePlotLocal(
          cacheKey,
          xField,
          yField,
          queryOptions,
          r,
          c,
          {
            colorField,
            colorScheme,
            colorBias,
            sizeField,
            sizeRange,
            manualSize,
            manualColor,
            overrideMap,
            targetAxisByFieldId,
            fieldById,
            measureValuesOverride,
            measureValuesSourceFields,
            fieldOverrides,
            globalChartType,
            overrides,
            labelCfg,
            tooltipFields,
          }
        )
      );
    }
  }

  return Promise.all(plotPromises);
}

/**
 * Generate a single plot using local DuckDB WASM query.
 */
async function generateSinglePlotLocal(
  cacheKey: string,
  xField: Field,
  yField: Field,
  queryOptions: ChartQueryOptions,
  row: number,
  col: number,
  config: {
    colorField?: Field | null;
    colorScheme?: string;
    colorBias?: number;
    sizeField?: Field | null;
    sizeRange?: [number, number];
    manualSize?: number;
    manualColor?: string;
    overrideMap: Record<string, FieldOverrideState>;
    targetAxisByFieldId: Record<string, 'x' | 'y'>;
    fieldById: Record<string, Field>;
    measureValuesOverride?: FieldOverrideState;
    measureValuesSourceFields?: Field[];
    fieldOverrides?: Record<string, FieldOverrideState>;
    globalChartType?: UserChartType | null;
    overrides?: ChartTypeOverrides;
    labelCfg?: any;
    tooltipFields?: Field[];
  }
): Promise<CartesianPlot> {
  const {
    colorField,
    colorScheme,
    colorBias,
    sizeField,
    sizeRange,
    manualSize,
    manualColor,
    overrideMap,
    targetAxisByFieldId,
    fieldById,
    measureValuesOverride,
    measureValuesSourceFields,
    fieldOverrides,
    globalChartType,
    overrides,
    labelCfg,
    tooltipFields,
  } = config;

  // Query data for this specific chart pair
  const queryResult = await chartQueryService.queryForChartPair(
    cacheKey,
    xField,
    yField,
    queryOptions
  );

  const data = queryResult.rows;

  // Compute shared domains for this chart's data
  const sharedMeasureDomains = computeSharedMeasureDomains(data, [xField], [yField], colorField);
  const sharedNumeric = computeSharedNumericDomains(data, [xField], [yField]);

  // Compute color scale for this chart
  let sharedColorScale = colorField 
    ? deriveColorScaleInfo(data, colorField, colorScheme, colorBias) 
    : null;

  sharedColorScale = applyMeasureNameColorOverrides(
    sharedColorScale,
    colorField || undefined,
    measureValuesSourceFields,
    fieldOverrides
  );

  // Check if either axis has MeasureValues
  const xIsMeasureValues = isMeasureValuesField(xField);
  const yIsMeasureValues = isMeasureValuesField(yField);

  // Resolve effective overrides for this cell
  const xTargetAxis = targetAxisByFieldId[xField.id];
  const yTargetAxis = targetAxisByFieldId[yField.id];

  const xOverride = xIsMeasureValues
    ? measureValuesOverride
    : xTargetAxis === 'x'
    ? overrideMap[xField.id]
    : undefined;
  const yOverride = yIsMeasureValues
    ? measureValuesOverride
    : yTargetAxis === 'y'
    ? overrideMap[yField.id]
    : undefined;

  const cellOverride: FieldOverrideState | undefined = xOverride || yOverride;

  // Start from global encodings
  let cellColorField: Field | undefined | null = colorField;
  let cellColorScheme: string | undefined = colorScheme;
  let cellColorBias: number | undefined = colorBias;
  let cellManualColor: string | undefined = manualColor;
  let cellSizeField: Field | undefined | null = sizeField;
  let cellSizeRange: [number, number] | undefined = sizeRange;
  let cellManualSize: number | undefined = manualSize;

  // Build per-cell chart type override
  let cellChartTypeOverrides: ChartTypeOverrides | undefined = overrides;
  if (cellOverride?.chartType) {
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

  // Apply cell overrides
  if (cellOverride) {
    if (cellOverride.colorField) {
      cellColorField = cellOverride.colorField;
    } else if (cellOverride.colorFieldId) {
      const cf = fieldById[cellOverride.colorFieldId];
      if (cf) cellColorField = cf;
    }
    if (cellOverride.colorScheme !== undefined) cellColorScheme = cellOverride.colorScheme;
    if (cellOverride.colorBias !== undefined) cellColorBias = cellOverride.colorBias;
    if (cellOverride.manualColor) cellManualColor = cellOverride.manualColor;

    if (cellOverride.sizeField) {
      cellSizeField = cellOverride.sizeField;
    } else if (cellOverride.sizeFieldId) {
      const sf = fieldById[cellOverride.sizeFieldId];
      if (sf) cellSizeField = sf;
    }
    if (cellOverride.sizeRange) cellSizeRange = cellOverride.sizeRange;
    if (cellOverride.manualSize !== undefined) cellManualSize = cellOverride.manualSize;
  }

  // Check if we need multi-mark rendering
  const needsMultiMark =
    (xIsMeasureValues || yIsMeasureValues) &&
    measureValuesSourceFields?.length &&
    hasAnyMeasureOverrides(measureValuesSourceFields, fieldOverrides);

  let options: Plot.PlotOptions;

  if (needsMultiMark) {
    options = generateMeasureValuesMultiMarkPlot({
      data,
      xField,
      yField,
      measureValuesSourceFields: measureValuesSourceFields!,
      fieldOverrides: fieldOverrides || {},
      colorField: cellColorField || undefined,
      sharedColorScale: sharedColorScale,
      manualSize: manualSize,
      manualColor: manualColor,
      sharedDomains: { ...sharedMeasureDomains, ...sharedNumeric },
      tooltipFields,
    });
  } else {
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
        if (!labelCfg) return undefined;
        if (cellOverride?.dataLabelMode === 'off') return undefined;

        let effectiveLabelCfg = { ...labelCfg };
        if (cellOverride?.labelFields && cellOverride.labelFields.length > 0) {
          effectiveLabelCfg = { ...effectiveLabelCfg, labelFields: cellOverride.labelFields };
        }
        if (cellOverride?.dataLabelMode === 'on') {
          effectiveLabelCfg.labelsEnabled = true;
        }
        return effectiveLabelCfg;
      })(),
      tooltipFields
    );
  }

  // Apply shared color domain
  if (sharedColorScale) {
    const colorLabel = colorField?.columnName;
    const sharedConfig =
      sharedColorScale.kind === 'continuous'
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

  // Add rounding metadata to plot for debugging
  const plotWithMetadata = {
    id: `cell-${row}-${col}`,
    title,
    options,
    position: { row, col },
    _metadata: {
      rowCount: queryResult.rowCount,
      roundingApplied: queryResult.roundingApplied,
      roundingPrecision: queryResult.roundingPrecision,
      queryTime: queryResult.queryTime,
    },
  } as CartesianPlot & { _metadata: any };

  return plotWithMetadata;
}

function buildCellTitle(xField: Field, yField: Field): string {
  const xLabel =
    xField.type === 'measure'
      ? `${xField.aggregation || 'sum'}(${xField.columnName})`
      : xField.columnName;
  const yLabel =
    yField.type === 'measure'
      ? `${yField.aggregation || 'sum'}(${yField.columnName})`
      : yField.columnName;
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

