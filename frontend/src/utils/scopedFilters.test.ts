import {
  buildEffectiveFilterState,
  buildFallbackSheetFilterConfig,
  getFilterScope,
  getSessionFilterIds,
  isSessionFilter,
  withFilterScope,
} from './scopedFilters';
import { Field, FilterConfig, FilterMetadata } from '../types';

function field(id: string, columnName = id, flavour: Field['flavour'] = 'discrete'): Field {
  return {
    id,
    columnName,
    type: flavour === 'continuous' ? 'measure' : 'dimension',
    flavour,
    dataType: flavour === 'continuous' ? 'float' : 'string',
  } as Field;
}

function config(id: string, scope: 'sheet' | 'session' = 'sheet'): FilterConfig {
  return {
    fieldId: id,
    columnName: id,
    type: 'discrete',
    selectedValues: [scope],
    scope,
  };
}

function metadata(id: string, value: string): FilterMetadata {
  return {
    fieldId: id,
    columnName: id,
    type: 'discrete',
    loading: false,
    availableValues: [value],
  };
}

describe('scoped filter helpers', () => {
  test('identifies session filter scope from session fields', () => {
    const sessionFields = [field('region')];

    expect(getSessionFilterIds(sessionFields)).toEqual(new Set(['region']));
    expect(getFilterScope('region', sessionFields)).toBe('session');
    expect(getFilterScope('category', sessionFields)).toBe('sheet');
    expect(isSessionFilter('region', sessionFields)).toBe(true);
    expect(isSessionFilter('category', sessionFields)).toBe(false);
  });

  test('builds effective state with session filters first and session config precedence', () => {
    const result = buildEffectiveFilterState({
      sheetFields: [field('region'), field('category')],
      sessionFields: [field('region')],
      sheetConfigurations: {
        region: config('region', 'sheet'),
        category: config('category', 'sheet'),
      },
      sessionConfigurations: {
        region: config('region', 'session'),
      },
      sheetMetadata: {
        region: metadata('region', 'local'),
        category: metadata('category', 'category'),
      },
      sessionMetadata: {
        region: metadata('region', 'session'),
      },
      disabledFilterIds: ['category'],
    });

    expect(result.fields.map((item) => item.id)).toEqual(['region', 'category']);
    expect(result.configurations.region.scope).toBe('session');
    expect((result.configurations.region as any).selectedValues).toEqual(['session']);
    expect(result.configurations.category.scope).toBe('sheet');
    expect((result.metadata.region as any).availableValues).toEqual(['session']);
    expect(result.sessionFilterIds).toEqual(new Set(['region']));
    expect(result.disabledFilterIds).toEqual(new Set(['category']));
  });

  test('can stamp scope onto a filter config without mutating the original', () => {
    const original = config('region', 'sheet');
    const next = withFilterScope(original, 'session');

    expect(next).toEqual({ ...original, scope: 'session' });
    expect(original.scope).toBe('sheet');
  });

  test('builds fallback sheet configs for discrete and continuous fields', () => {
    expect(buildFallbackSheetFilterConfig(field('region'))).toMatchObject({
      fieldId: 'region',
      columnName: 'region',
      type: 'discrete',
      selectedValues: [],
      scope: 'sheet',
    });

    expect(buildFallbackSheetFilterConfig(field('sales', 'sales', 'continuous'))).toMatchObject({
      fieldId: 'sales',
      columnName: 'sales',
      type: 'continuous',
      min: null,
      max: null,
      scope: 'sheet',
    });
  });
});
