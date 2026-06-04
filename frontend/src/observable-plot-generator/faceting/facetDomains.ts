// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { Field, FieldOverrideState } from '../../types';
import { SharedDomains } from '../types';
import { computeSharedMeasureDomains } from '../domains/measureDomains';
import { computeSharedNumericDomains, computeSharedCategoricalDomains } from '../domains/numericDomains';
import { deriveColorScaleInfo, applyMeasureNameColorOverrides } from '../utils/colorSchemeUtils';

// Re-export SharedDomains for backward compatibility
export type { SharedDomains };

/**
 * Compute all shared domains needed for faceting.
 * This centralizes domain computation logic that was duplicated across facetGenerator and coreGridGenerator.
 * 
 * @param measureValuesSourceFields - Optional source measures for MeasureValues (for per-measure color overrides)
 * @param fieldOverrides - Optional per-field overrides (for per-measure color overrides)
 */
export function computeSharedDomainsForFaceting(
  data: any[],
  xFields: Field[],
  yFields: Field[],
  colorField?: Field,
  categoryField?: Field,
  facetFields?: Field[],
  colorSchemeId?: string,
  colorBias?: number,
  colorReversed?: boolean,
  measureValuesSourceFields?: Field[],
  fieldOverrides?: Record<string, FieldOverrideState>
): SharedDomains {
  // Compute shared measure domains
  const allMeasures = [...xFields, ...yFields].filter((f: any) => f.type === 'measure' && f.flavour === 'continuous');
  const measureDomains = computeSharedMeasureDomains(
    data, 
    allMeasures as any[], 
    allMeasures as any[],
    colorField,
    categoryField,
    facetFields
  );

  // Compute shared numeric domains (for continuous dimensions and measures)
  const numericDomains = computeSharedNumericDomains(data, xFields as any[], yFields as any[]);

  // Compute categorical domains for ALL discrete dimensions (xFields, yFields, and categoryField)
  // This ensures shared X/Y domain across facets for discrete dimensions
  const discreteFields = [
    ...xFields.filter((f: any) => f.type === 'dimension' && f.flavour === 'discrete'),
    ...yFields.filter((f: any) => f.type === 'dimension' && f.flavour === 'discrete'),
    ...(categoryField ? [categoryField] : [])
  ];
  const categoricalDomains = discreteFields.length > 0
    ? computeSharedCategoricalDomains(data, discreteFields)
    : {};

  // Compute shared color domain
  let colorScale = colorField ? deriveColorScaleInfo(data, colorField, colorSchemeId, colorBias, colorReversed) : null;
  
  // Apply per-measure color overrides if color field is MeasureNames and we have source fields
  colorScale = applyMeasureNameColorOverrides(
    colorScale,
    colorField,
    measureValuesSourceFields,
    fieldOverrides
  );

  return {
    measure: measureDomains as Record<string, [number, number]>,
    numeric: numericDomains,
    categorical: categoricalDomains,
    colorScale,
  };
}

