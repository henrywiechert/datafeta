import {
  addFieldAsContinuousFilter,
  updateExistingContinuousFilter,
  addFieldAsDiscreteZoomFilter,
} from './filterActions';
import { Field } from '../types';

const makeField = (columnName: string, overrides?: Partial<Field>): Field => ({
  id: 'src-1',
  columnName,
  type: 'dimension',
  flavour: 'continuous',
  dataType: 'float',
  ...overrides,
});

describe('addFieldAsContinuousFilter', () => {
  it('dispatches SET_FILTER_FIELDS, SET_FILTER_CONFIGURATION, and APPLY_FILTERS', () => {
    const dispatch = jest.fn();
    const field = makeField('revenue', { type: 'measure' });
    const result = addFieldAsContinuousFilter(field, 10, 50, [], dispatch);

    expect(dispatch).toHaveBeenCalledTimes(3);

    // 1. SET_FILTER_FIELDS with new filter field
    expect(dispatch.mock.calls[0][0].type).toBe('SET_FILTER_FIELDS');
    expect(dispatch.mock.calls[0][0].payload).toHaveLength(1);
    expect(dispatch.mock.calls[0][0].payload[0].columnName).toBe('revenue');
    expect(dispatch.mock.calls[0][0].payload[0].flavour).toBe('continuous');
    expect(dispatch.mock.calls[0][0].payload[0].id).not.toBe('src-1');

    // 2. SET_FILTER_CONFIGURATION with continuous config
    const configAction = dispatch.mock.calls[1][0];
    expect(configAction.type).toBe('SET_FILTER_CONFIGURATION');
    expect(configAction.payload.config.type).toBe('continuous');
    expect(configAction.payload.config.min).toBe(10);
    expect(configAction.payload.config.max).toBe(50);
    expect(configAction.payload.config.isZoomFilter).toBe(true);

    // 3. APPLY_FILTERS
    expect(dispatch.mock.calls[2][0].type).toBe('APPLY_FILTERS');

    // Returns a new field with a different id
    expect(result.id).not.toBe('src-1');
    expect(result.columnName).toBe('revenue');
  });

  it('appends to existing filter fields', () => {
    const dispatch = jest.fn();
    const existing = makeField('other');
    const field = makeField('revenue');
    addFieldAsContinuousFilter(field, 0, 100, [existing], dispatch);

    const payload = dispatch.mock.calls[0][0].payload;
    expect(payload).toHaveLength(2);
    expect(payload[0].columnName).toBe('other');
    expect(payload[1].columnName).toBe('revenue');
  });
});

describe('updateExistingContinuousFilter', () => {
  it('dispatches SET_FILTER_CONFIGURATION and APPLY_FILTERS', () => {
    const dispatch = jest.fn();
    updateExistingContinuousFilter('filter-1', 'revenue', 20, 80, dispatch);

    expect(dispatch).toHaveBeenCalledTimes(2);

    const configAction = dispatch.mock.calls[0][0];
    expect(configAction.type).toBe('SET_FILTER_CONFIGURATION');
    expect(configAction.payload.fieldId).toBe('filter-1');
    expect(configAction.payload.config.type).toBe('continuous');
    expect(configAction.payload.config.min).toBe(20);
    expect(configAction.payload.config.max).toBe(80);
    expect(configAction.payload.config.isZoomFilter).toBe(true);

    expect(dispatch.mock.calls[1][0].type).toBe('APPLY_FILTERS');
  });
});

describe('addFieldAsDiscreteZoomFilter', () => {
  it('dispatches correct actions with isZoomFilter tag', () => {
    const dispatch = jest.fn();
    const field = makeField('category', { flavour: 'discrete' });
    const result = addFieldAsDiscreteZoomFilter(field, ['A', 'B'], [], dispatch);

    expect(dispatch).toHaveBeenCalledTimes(3);

    // SET_FILTER_FIELDS
    expect(dispatch.mock.calls[0][0].type).toBe('SET_FILTER_FIELDS');
    expect(dispatch.mock.calls[0][0].payload[0].flavour).toBe('discrete');

    // SET_FILTER_CONFIGURATION
    const configAction = dispatch.mock.calls[1][0];
    expect(configAction.payload.config.type).toBe('discrete');
    expect(configAction.payload.config.selectedValues).toEqual(['A', 'B']);
    expect(configAction.payload.config.isZoomFilter).toBe(true);

    // APPLY_FILTERS
    expect(dispatch.mock.calls[2][0].type).toBe('APPLY_FILTERS');

    expect(result.columnName).toBe('category');
  });
});
