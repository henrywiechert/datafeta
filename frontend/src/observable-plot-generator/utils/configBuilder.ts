/**
 * Utility functions for building configuration objects from ChartGenerationContext.
 * Centralizes the extraction of context properties into structured configs.
 */

import { Field } from '../../types';
import { ChartGenerationContext, CartesianPlotsConfig, LabelConfig, SharedDomains } from '../types';
import { getResultColumnName } from '../../utils/fieldUtils';
import { computeSharedDomainsForFaceting } from '../faceting/facetDomains';

/**
 * Compute SharedDomains from ChartGenerationContext.
 * This is the single source of truth for domain computation, used by both
 * faceted and non-faceted chart generation paths.
 * 
 * If context already has sharedDomains set, returns those (respecting precomputed domains).
 * Otherwise, computes domains from the context's data and fields.
 * 
 * @param context - The chart generation context
 * @param options - Optional overrides for specific domain computation needs
 * @returns SharedDomains object with measure, numeric, categorical, and color domains
 */
export function computeSharedDomainsFromContext(
  context: ChartGenerationContext,
  options?: {
    /** Override xFields for domain computation (e.g., filtered candidates) */
    xFields?: Field[];
    /** Override yFields for domain computation */
    yFields?: Field[];
    /** Category field for bar charts */
    categoryField?: Field;
    /** Additional facet fields to exclude from domain computation */
    facetFields?: Field[];
  }
): SharedDomains {
  // If context already has fully computed sharedDomains, use them
  if (context.sharedDomains) {
    return context.sharedDomains;
  }

  // If context has partial domain overrides, use them as base
  const hasOverrides = context.sharedDomainsOverride?.measure || context.sharedDomainsOverride?.numeric;
  
  const xFields = options?.xFields ?? context.xFields;
  const yFields = options?.yFields ?? context.yFields;
  const categoryField = options?.categoryField;
  const facetFields = options?.facetFields ?? [];

  // Use the comprehensive domain computation function
  const computed = computeSharedDomainsForFaceting(
    context.queryResult.rows,
    xFields,
    yFields,
    context.colorField,
    categoryField,
    facetFields,
    context.colorScheme,
    context.colorBias,
    context.measureValuesSourceFields,
    context.fieldOverrides
  );

  // Merge with any overrides from context
  if (hasOverrides) {
    return {
      measure: context.sharedDomainsOverride?.measure ?? computed.measure,
      numeric: context.sharedDomainsOverride?.numeric ?? computed.numeric,
      categorical: computed.categorical,
      colorScale: computed.colorScale,
    };
  }

  return computed;
}

/**
 * Build LabelConfig from ChartGenerationContext.
 * Consolidates label configuration extraction that was duplicated across multiple files.
 */
export function buildLabelConfig(context: ChartGenerationContext): LabelConfig | undefined {
  const {
    labelFields = [],
    labelsEnabled = false,
    labelSamplingStrategy = 'auto',
    labelSamplingThreshold = 300,
    labelSampleEvery = 1,
    queryResult,
  } = context as any;

  if (!labelsEnabled && (labelFields?.length || 0) === 0) {
    return undefined;
  }

  // Adapt measure label field columnNames to aggregated aliases present in result rows.
  const adaptedLabelFields = labelFields.map((f: Field) => {
    if (f.type === 'measure') {
      // If explicit aggregation present, use its result alias.
      if (f.aggregation) {
        return { ...f, columnName: getResultColumnName(f), originalColumnName: f.columnName } as any;
      }
      // If no aggregation, check if result rows carry a SUM alias for this column.
      const implicitAlias = `SUM(${f.columnName})`;
      if (queryResult?.rows?.length && Object.prototype.hasOwnProperty.call(queryResult.rows[0], implicitAlias)) {
        return { ...f, columnName: implicitAlias, originalColumnName: f.columnName } as any;
      }
      return { ...f };
    }
    return f;
  });

  return {
    labelFields: adaptedLabelFields,
    labelsEnabled,
    samplingStrategy: labelSamplingStrategy,
    samplingThreshold: labelSamplingThreshold,
    sampleEvery: labelSampleEvery,
  };
}

/**
 * Options for building CartesianPlotsConfig from context.
 * Allows cell-specific overrides for faceted charts.
 */
export interface CartesianConfigOptions {
  /** Data for this specific cell (may be filtered for faceting) */
  data: any[];
  /** Shared domains computed at the coordinator level */
  sharedDomains: SharedDomains;
  /** X-axis field candidates (may be filtered from context.xFields) */
  xCandidates?: Field[];
  /** Y-axis field candidates (may be filtered from context.yFields) */
  yCandidates?: Field[];
  /** Facet fields for this cell (for tooltip display) */
  facetFields?: Field[];
  /** Override manual color (e.g., from effectiveManualColor computation) */
  manualColorOverride?: string;
  /** Override manual size */
  manualSizeOverride?: number;
}

/**
 * Build CartesianPlotsConfig from ChartGenerationContext with cell-specific overrides.
 * This factory function centralizes config building, reducing duplication in cell generators.
 */
export function buildCartesianPlotsConfig(
  context: ChartGenerationContext,
  options: CartesianConfigOptions
): CartesianPlotsConfig {
  const {
    data,
    sharedDomains,
    xCandidates = context.xFields,
    yCandidates = context.yFields,
    facetFields = [],
    manualColorOverride,
    manualSizeOverride,
  } = options;

  const labelCfg = buildLabelConfig(context);

  // Collect all fields for field lookup maps
  const allFields = [
    ...xCandidates,
    ...yCandidates,
    ...(context.colorField ? [context.colorField] : []),
    ...(context.sizeField ? [context.sizeField] : []),
  ];

  return {
    data,
    xCandidates,
    yCandidates,
    sharedDomains,
    encoding: {
      color: {
        field: context.colorField,
        scheme: context.colorScheme,
        bias: context.colorBias,
        manual: manualColorOverride ?? context.manualColor,
      },
      size: {
        field: context.sizeField,
        range: context.sizeRange,
        manual: manualSizeOverride ?? context.manualSize,
      },
    },
    labels: labelCfg,
    tooltipFields: context.tooltipFields,
    facetFields,
    fieldOverrides: context.fieldOverrides,
    fieldOverrideTargets: context.fieldOverrideTargets,
    allFields,
    globalChartType: context.globalChartType,
    measureValuesSourceFields: context.measureValuesSourceFields,
    bandThicknessScale: context.bandThicknessScale,
  };
}
