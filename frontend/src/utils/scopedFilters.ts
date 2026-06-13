import { Field, FilterConfig, FilterMetadata, FilterScope } from '../types';
import {
  mergeFilterConfigurations,
  mergeFilterFields,
  mergeFilterMetadata,
} from './effectiveFilters';

export interface EffectiveFilterState {
  fields: Field[];
  configurations: Record<string, FilterConfig>;
  metadata: Record<string, FilterMetadata>;
  sessionFilterIds: Set<string>;
  disabledFilterIds: Set<string>;
}

export interface BuildEffectiveFilterStateInput {
  sheetFields: Field[];
  sessionFields: Field[];
  sheetConfigurations: Record<string, FilterConfig>;
  sessionConfigurations: Record<string, FilterConfig>;
  sheetMetadata: Record<string, FilterMetadata>;
  sessionMetadata: Record<string, FilterMetadata>;
  disabledFilterIds?: string[];
}

export function getSessionFilterIds(sessionFields: Field[]): Set<string> {
  return new Set(sessionFields.map((field) => field.id));
}

export function getFilterScope(fieldId: string, sessionFields: Field[]): FilterScope {
  return getSessionFilterIds(sessionFields).has(fieldId) ? 'session' : 'sheet';
}

export function isSessionFilter(fieldId: string, sessionFields: Field[]): boolean {
  return getFilterScope(fieldId, sessionFields) === 'session';
}

export function withFilterScope(config: FilterConfig, scope: FilterScope): FilterConfig {
  return { ...config, scope };
}

export function buildFallbackSheetFilterConfig(field: Field): FilterConfig {
  const type = field.flavour === 'continuous' ? 'continuous' : 'discrete';
  if (type === 'continuous') {
    return {
      fieldId: field.id,
      columnName: field.columnName,
      type: 'continuous',
      min: null,
      max: null,
      scope: 'sheet',
    };
  }

  return {
    fieldId: field.id,
    columnName: field.columnName,
    type: 'discrete',
    selectedValues: [],
    scope: 'sheet',
  };
}

export function buildEffectiveFilterState({
  sheetFields,
  sessionFields,
  sheetConfigurations,
  sessionConfigurations,
  sheetMetadata,
  sessionMetadata,
  disabledFilterIds = [],
}: BuildEffectiveFilterStateInput): EffectiveFilterState {
  return {
    fields: mergeFilterFields(sessionFields, sheetFields),
    configurations: mergeFilterConfigurations(sheetConfigurations, sessionConfigurations),
    metadata: mergeFilterMetadata(sheetMetadata, sessionMetadata),
    sessionFilterIds: getSessionFilterIds(sessionFields),
    disabledFilterIds: new Set(disabledFilterIds),
  };
}
