// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import {
  buildCascadingFiltersForField,
  hashCascadingFilters,
  resolveValueListMode,
} from './cascadingFilters';
import { ContinuousFilterConfig, DiscreteFilterConfig, FilterConfig } from '../types';

const discrete = (
  fieldId: string,
  columnName: string,
  selectedValues: any[],
  totalAvailableCount?: number,
  valueListMode?: 'all' | 'relevant',
): DiscreteFilterConfig => ({
  fieldId,
  columnName,
  type: 'discrete',
  selectedValues,
  totalAvailableCount,
  valueListMode,
});

const continuous = (
  fieldId: string,
  columnName: string,
  min: number,
  max: number,
): ContinuousFilterConfig => ({
  fieldId,
  columnName,
  type: 'continuous',
  min,
  max,
});

describe('resolveValueListMode', () => {
  it('defaults missing / non-discrete to all', () => {
    expect(resolveValueListMode(undefined)).toBe('all');
    expect(resolveValueListMode(continuous('price', 'price', 0, 10))).toBe('all');
    expect(resolveValueListMode(discrete('city', 'city', ['NYC']))).toBe('all');
    expect(resolveValueListMode(discrete('city', 'city', ['NYC'], undefined, 'all'))).toBe('all');
  });

  it('returns relevant when set', () => {
    expect(
      resolveValueListMode(discrete('city', 'city', ['NYC'], undefined, 'relevant')),
    ).toBe('relevant');
  });
});

describe('buildCascadingFiltersForField', () => {
  it('omits the target field and keeps discrete siblings only', () => {
    const applied: Record<string, FilterConfig> = {
      country: discrete('country', 'country', ['US']),
      city: discrete('city', 'city', ['NYC', 'LA']),
      status: discrete('status', 'status', ['open']),
      price: continuous('price', 'price', 0, 100),
    };

    const forCity = buildCascadingFiltersForField('city', applied);
    expect(Object.keys(forCity).sort()).toEqual(['country', 'status']);
    expect(forCity.country).toBe(applied.country);
    expect(forCity.city).toBeUndefined();
    expect(forCity.price).toBeUndefined();
  });

  it('returns empty map when only self is present', () => {
    const applied: Record<string, FilterConfig> = {
      city: discrete('city', 'city', ['NYC']),
    };
    expect(buildCascadingFiltersForField('city', applied)).toEqual({});
  });
});

describe('hashCascadingFilters', () => {
  it('is order-independent for config maps', () => {
    const a: Record<string, FilterConfig> = {
      country: discrete('country', 'country', ['US']),
      status: discrete('status', 'status', ['open']),
    };
    const b: Record<string, FilterConfig> = {
      status: discrete('status', 'status', ['open']),
      country: discrete('country', 'country', ['US']),
    };
    expect(hashCascadingFilters(a)).toBe(hashCascadingFilters(b));
  });

  it('changes when a sibling selection changes', () => {
    const before: Record<string, FilterConfig> = {
      country: discrete('country', 'country', ['US', 'DE']),
    };
    const after: Record<string, FilterConfig> = {
      country: discrete('country', 'country', ['US']),
    };
    expect(hashCascadingFilters(before)).not.toBe(hashCascadingFilters(after));
  });

  it('ignores selection order', () => {
    const ascending: Record<string, FilterConfig> = {
      country: discrete('country', 'country', ['DE', 'US']),
    };
    const descending: Record<string, FilterConfig> = {
      country: discrete('country', 'country', ['US', 'DE']),
    };
    expect(hashCascadingFilters(ascending)).toBe(hashCascadingFilters(descending));
  });

  it('ignores valueListMode so toggling a sibling picker does not refetch', () => {
    const asAll: Record<string, FilterConfig> = {
      country: discrete('country', 'country', ['US'], undefined, 'all'),
    };
    const asRelevant: Record<string, FilterConfig> = {
      country: discrete('country', 'country', ['US'], undefined, 'relevant'),
    };
    expect(hashCascadingFilters(asAll)).toBe(hashCascadingFilters(asRelevant));
  });

  it('is empty when no sibling imposes a restriction', () => {
    expect(hashCascadingFilters({})).toBe('');
    // Empty selection and select-all both mean "no restriction"
    expect(hashCascadingFilters({ country: discrete('country', 'country', []) })).toBe('');
    expect(
      hashCascadingFilters({ country: discrete('country', 'country', ['US', 'DE'], 2) }),
    ).toBe('');
  });
});
