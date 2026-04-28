/**
 * Sheet Config Hash Utility
 * 
 * Computes a deterministic hash of sheet-specific configuration to validate
 * whether a cached queryResult/chartSpec is still valid for the current config.
 * 
 * Only includes sheet-specific state (not shared state like selectedTable).
 * Shared state changes are tracked via dataSourceVersion.
 */

import { Field, FilterConfig, FieldOverrideState } from '../types';
import { ChartAffectingConfig, QueryAffectingConfig } from './queryAffectingConfig';

/**
 * Extract stable identity from a field for hashing.
 * Uses id and columnName as primary identifiers.
 */
function fieldToHashKey(field: Field | null | undefined): string {
  if (!field) return 'null';
  // Include properties that affect query/rendering
  return JSON.stringify({
    id: field.id,
    columnName: field.columnName,
    type: field.type,
    flavour: field.flavour,
    aggregation: field.aggregation,
    is_virtual: field.is_virtual,
  });
}

/**
 * Convert field array to stable hash key.
 */
function fieldsToHashKey(fields: Field[]): string {
  return JSON.stringify(fields.map(f => fieldToHashKey(f)));
}

/**
 * Convert filter configurations to stable hash key.
 */
function filtersToHashKey(filters: Record<string, FilterConfig>): string {
  // Sort by key for deterministic output
  const sortedKeys = Object.keys(filters).sort();
  const normalized = sortedKeys.map(key => {
    const config = filters[key];
    // Handle different filter types - use type narrowing
    const base = {
      key,
      fieldId: config.fieldId,
      columnName: config.columnName,
      type: config.type,
      dateTimePart: config.dateTimePart,
      dateTimeMode: config.dateTimeMode,
    };
    
    if (config.type === 'discrete') {
      return {
        ...base,
        selectedValues: config.selectedValues ? [...config.selectedValues].sort() : undefined,
      };
    } else if (config.type === 'continuous') {
      return {
        ...base,
        min: config.min,
        max: config.max,
      };
    } else if (config.type === 'datetime') {
      return {
        ...base,
        startDate: config.startDate,
        endDate: config.endDate,
      };
    }
    return base;
  });
  return JSON.stringify(normalized);
}

/**
 * Convert field overrides to stable hash key.
 */
function overridesToHashKey(overrides: Record<string, FieldOverrideState> | undefined): string {
  if (!overrides) return 'null';
  const sortedKeys = Object.keys(overrides).sort();
  const normalized = sortedKeys.map(key => ({
    key,
    ...overrides[key],
    colorField: fieldToHashKey(overrides[key].colorField),
    sizeField: fieldToHashKey(overrides[key].sizeField),
    labelFields: overrides[key].labelFields?.map(f => fieldToHashKey(f)),
  }));
  return JSON.stringify(normalized);
}

/**
 * Compute hash for query-affecting configuration.
 * If this changes, queryResult is invalid.
 */
export function computeQueryConfigHash(config: QueryAffectingConfig): string {
  const parts = [
    'q', // prefix to identify query hash
    fieldsToHashKey(config.xAxisFields),
    fieldsToHashKey(config.yAxisFields),
    filtersToHashKey(config.appliedFilterConfigurations),
    fieldToHashKey(config.colorField),
    fieldToHashKey(config.sizeField),
    fieldToHashKey(config.shapeField || null),
    fieldToHashKey(config.facetBackgroundField || null),
    fieldsToHashKey(config.labelFields || []),
    fieldsToHashKey(config.tooltipFields || []),
    fieldsToHashKey(config.measureGroupFields || []),
  ];
  
  // Simple hash: join and create a short fingerprint
  const fullString = parts.join('|');
  return simpleHash(fullString);
}

/**
 * Compute hash for chart-affecting configuration.
 * If this changes, chartSpec is invalid (but queryResult might still be valid).
 */
export function computeChartConfigHash(config: ChartAffectingConfig): string {
  // Start with query hash components
  const queryParts = [
    fieldsToHashKey(config.xAxisFields),
    fieldsToHashKey(config.yAxisFields),
    filtersToHashKey(config.appliedFilterConfigurations),
    fieldToHashKey(config.colorField),
    fieldToHashKey(config.sizeField),
    fieldToHashKey(config.shapeField || null),
    fieldToHashKey(config.facetBackgroundField || null),
    fieldsToHashKey(config.labelFields || []),
    fieldsToHashKey(config.tooltipFields || []),
    fieldsToHashKey(config.measureGroupFields || []),
  ];
  
  // Add chart-specific parts
  const chartParts = [
    'c', // prefix to identify chart hash
    ...queryParts,
    String(config.colorScheme || ''),
    String(config.colorBias ?? 0),
    String(config.manualColor || ''),
    String(config.manualShape || ''),
    JSON.stringify(config.sizeRange || []),
    String(config.manualSize ?? 0),
    String(config.bandThicknessScale ?? 1),
    overridesToHashKey(config.fieldOverrides),
    String(config.globalChartType || 'null'),
    String(config.distributionVariant || 'tick-strip'),
    String(config.tableCellMode || 'auto'),
    JSON.stringify(config.independentDomains || {}),
    String(config.labelsEnabled ?? false),
    String(config.labelSamplingStrategy || ''),
    String(config.labelSamplingThreshold ?? 0),
    String(config.labelSampleEvery ?? 0),
  ];
  
  const fullString = chartParts.join('|');
  return simpleHash(fullString);
}

/**
 * Compute a combined hash that validates both query and chart config.
 * This is what we store and compare for full cache validation.
 */
export function computeFullConfigHash(config: ChartAffectingConfig): string {
  return computeChartConfigHash(config);
}

/**
 * Simple string hash function.
 * Not cryptographically secure, but fast and good enough for cache keys.
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  // Convert to hex string for readability
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Check if two configs have the same query-affecting properties.
 * Used to determine if queryResult can be reused even if chart config changed.
 */
export function queriesMatch(config1: QueryAffectingConfig, config2: QueryAffectingConfig): boolean {
  return computeQueryConfigHash(config1) === computeQueryConfigHash(config2);
}
