import { convertFilterConfigsToFilters } from './queryBuilder';
import { FilterConfig } from '../types';

describe('convertFilterConfigsToFilters', () => {
  test('converts discrete pattern mode to a like filter', () => {
    const filters = convertFilterConfigsToFilters({
      category: {
        fieldId: 'category',
        columnName: 'category',
        type: 'discrete',
        matchMode: 'pattern',
        pattern: '%abc%',
        patternOperator: 'like',
        selectedValues: [],
      } satisfies FilterConfig,
    });

    expect(filters).toEqual([
      {
        field: 'category',
        operator: 'like',
        value: '%abc%',
      },
    ]);
  });

  test('converts discrete pattern mode to an ilike filter', () => {
    const filters = convertFilterConfigsToFilters({
      category: {
        fieldId: 'category',
        columnName: 'category',
        type: 'discrete',
        matchMode: 'pattern',
        pattern: '%AbC%',
        patternOperator: 'ilike',
        selectedValues: [],
      } satisfies FilterConfig,
    });

    expect(filters).toEqual([
      {
        field: 'category',
        operator: 'ilike',
        value: '%AbC%',
      },
    ]);
  });

  test('converts inverse discrete pattern mode to a not like filter', () => {
    const filters = convertFilterConfigsToFilters({
      category: {
        fieldId: 'category',
        columnName: 'category',
        type: 'discrete',
        matchMode: 'pattern',
        pattern: '%abc%',
        patternOperator: 'like',
        isInversePattern: true,
        selectedValues: [],
      } satisfies FilterConfig,
    });

    expect(filters).toEqual([
      {
        field: 'category',
        operator: 'not like',
        value: '%abc%',
      },
    ]);
  });

  test('skips discrete pattern mode when the pattern is empty', () => {
    const filters = convertFilterConfigsToFilters({
      category: {
        fieldId: 'category',
        columnName: 'category',
        type: 'discrete',
        matchMode: 'pattern',
        pattern: '   ',
        patternOperator: 'like',
        selectedValues: [],
      } satisfies FilterConfig,
    });

    expect(filters).toEqual([]);
  });
});