// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { renderHook, act } from '@testing-library/react';
import { useFilterActions } from './useFilterActions';
import type { Field } from '../../../../types';

const mockUseVisualizationContext = jest.fn();
const mockAddFieldAsDiscreteFilter = jest.fn();
const mockUpdateExistingDiscreteFilter = jest.fn();
const mockRecordUndoPoint = jest.fn();

jest.mock('../../../../contexts/VisualizationContext', () => ({
  useVisualizationContext: () => mockUseVisualizationContext(),
}));

// Stable identity across renders, as the real hook guarantees.
jest.mock('../../../../hooks/useRecordUndoPoint', () => ({
  useRecordUndoPoint: () => mockRecordUndoPoint,
}));

jest.mock('../../../../utils/filterActions', () => ({
  findDiscreteFilterFor: jest.requireActual('../../../../utils/filterActions').findDiscreteFilterFor,
  addFieldAsDiscreteFilter: (...args: any[]) => mockAddFieldAsDiscreteFilter(...args),
  updateExistingDiscreteFilter: (...args: any[]) => mockUpdateExistingDiscreteFilter(...args),
}));

const makeField = (columnName: string, overrides?: Partial<Field>): Field => ({
  id: `${columnName}-id`,
  columnName,
  type: 'dimension',
  flavour: 'discrete',
  dataType: 'string',
  ...overrides,
});

describe('useFilterActions discrete legend bridge', () => {
  const dispatch = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('updates an existing discrete color filter for keep actions', () => {
    const colorField = makeField('species');
    const existingFilterField = makeField('species', {
      id: 'filter-species',
      dateTimePart: 'month',
      dateTimeMode: 'distinct',
    });

    mockUseVisualizationContext.mockReturnValue({
      dispatch,
      state: {
        colorField,
        shapeField: null,
        filterFields: [existingFilterField],
        filterConfigurations: {
          [existingFilterField.id]: {
            fieldId: existingFilterField.id,
            columnName: existingFilterField.columnName,
            type: 'discrete',
            selectedValues: ['Adelie'],
          },
        },
        queryResult: null,
      },
    });

    const { result } = renderHook(() => useFilterActions({ grid: null }));

    act(() => {
      result.current.handleLegendFilterAction('keep', ['Gentoo'], ['Adelie', 'Gentoo']);
    });

    expect(mockRecordUndoPoint).toHaveBeenCalled();
    expect(mockUpdateExistingDiscreteFilter).toHaveBeenCalledWith(
      'filter-species',
      'species',
      ['Gentoo'],
      dispatch,
      'month',
      'distinct',
    );
    expect(mockAddFieldAsDiscreteFilter).not.toHaveBeenCalled();
  });

  it('creates a new discrete shape filter for exclude actions using the complement set', () => {
    const shapeField = makeField('category');
    const filterFields = [makeField('other_filter')];

    mockUseVisualizationContext.mockReturnValue({
      dispatch,
      state: {
        colorField: null,
        shapeField,
        filterFields,
        filterConfigurations: {},
        queryResult: null,
      },
    });

    const { result } = renderHook(() => useFilterActions({ grid: null }));

    act(() => {
      result.current.handleShapeLegendFilterAction('exclude', ['B'], ['A', 'B', 'C']);
    });

    expect(mockRecordUndoPoint).toHaveBeenCalled();
    expect(mockAddFieldAsDiscreteFilter).toHaveBeenCalledWith(
      shapeField,
      ['A', 'C'],
      filterFields,
      dispatch,
    );
    expect(mockUpdateExistingDiscreteFilter).not.toHaveBeenCalled();
  });

  it('does nothing when the relevant legend field is not configured', () => {
    mockUseVisualizationContext.mockReturnValue({
      dispatch,
      state: {
        colorField: null,
        shapeField: null,
        filterFields: [],
        filterConfigurations: {},
        queryResult: null,
      },
    });

    const { result } = renderHook(() => useFilterActions({ grid: null }));

    act(() => {
      result.current.handleLegendFilterAction('keep', ['A'], ['A', 'B']);
      result.current.handleShapeLegendFilterAction('exclude', ['B'], ['A', 'B']);
    });

    expect(mockRecordUndoPoint).not.toHaveBeenCalled();
    expect(mockAddFieldAsDiscreteFilter).not.toHaveBeenCalled();
    expect(mockUpdateExistingDiscreteFilter).not.toHaveBeenCalled();
  });
});

describe('useFilterActions tooltip grid injection', () => {
  const dispatch = jest.fn();

  const grid = {
    layout: { rows: 1, columns: 1 },
    cells: [
      {
        id: 'cell-0',
        content: { kind: 'plot', options: { __customTooltip: { enabled: true } } },
      },
    ],
  } as any;

  const stateWith = (selectedValues: string[]) => ({
    dispatch,
    state: {
      colorField: null,
      shapeField: null,
      filterFields: [],
      filterConfigurations: {
        'filter-a': { fieldId: 'filter-a', columnName: 'a', type: 'discrete', selectedValues },
      },
      queryResult: null,
    },
  });

  beforeEach(() => jest.clearAllMocks());

  it('keeps the grid identity when draft filter configurations change', () => {
    mockUseVisualizationContext.mockReturnValue(stateWith(['a']));

    const { result, rerender } = renderHook(() => useFilterActions({ grid }));
    const injectedGrid = result.current.gridWithTooltipAction;
    expect(injectedGrid).not.toBe(grid);

    mockUseVisualizationContext.mockReturnValue(stateWith(['a', 'b']));
    rerender();

    // A fresh grid reference here would rebuild every cell's plot options and make
    // Observable Plot redraw the SVG on each filter checkbox click.
    expect(result.current.gridWithTooltipAction).toBe(injectedGrid);
  });
});
describe('useFilterActions tooltip bridge with several datetime parts of one column', () => {
  const dispatch = jest.fn();

  const datetimePart = (id: string, part: 'month' | 'weekday') =>
    makeField('reviewed_at', { id, dataType: 'datetime', dateTimePart: part, dateTimeMode: 'distinct' });

  const discreteConfig = (field: Field, selectedValues: number[]) => ({
    fieldId: field.id,
    columnName: field.columnName,
    type: 'discrete',
    selectedValues,
    dateTimePart: field.dateTimePart,
    dateTimeMode: field.dateTimeMode,
  });

  beforeEach(() => jest.clearAllMocks());

  it('adds a weekday filter instead of overwriting the month filter of the same column', () => {
    const monthFilter = datetimePart('filter-month', 'month');
    const weekdayAxis = datetimePart('axis-weekday', 'weekday');
    const grid = {
      layout: { rows: 1, columns: 1 },
      cells: [{ id: 'c', content: { kind: 'plot', options: { __customTooltip: { enabled: true } } } }],
    } as any;

    mockUseVisualizationContext.mockReturnValue({
      dispatch,
      state: {
        colorField: null,
        shapeField: null,
        filterFields: [monthFilter],
        filterConfigurations: { [monthFilter.id]: discreteConfig(monthFilter, [10]) },
        queryResult: null,
      },
    });
    const { result } = renderHook(() => useFilterActions({ grid }));
    const { onFilterAction } = (result.current.gridWithTooltipAction as any).cells[0].content.options.__customTooltip;

    act(() => {
      onFilterAction('keep', { label: 'weekday', value: 3, rawValue: 3, sourceField: weekdayAxis });
    });

    expect(mockUpdateExistingDiscreteFilter).not.toHaveBeenCalled();
    expect(mockAddFieldAsDiscreteFilter).toHaveBeenCalledWith(
      weekdayAxis,
      [3],
      [monthFilter],
      dispatch,
    );
  });

  it('updates the filter whose datetime part matches the tooltip field', () => {
    const monthFilter = datetimePart('filter-month', 'month');
    const weekdayFilter = datetimePart('filter-weekday', 'weekday');
    const grid = {
      layout: { rows: 1, columns: 1 },
      cells: [{ id: 'c', content: { kind: 'plot', options: { __customTooltip: { enabled: true } } } }],
    } as any;

    mockUseVisualizationContext.mockReturnValue({
      dispatch,
      state: {
        colorField: null,
        shapeField: null,
        filterFields: [monthFilter, weekdayFilter],
        filterConfigurations: {
          [monthFilter.id]: discreteConfig(monthFilter, [10]),
          [weekdayFilter.id]: discreteConfig(weekdayFilter, [1, 2]),
        },
        queryResult: null,
      },
    });
    const { result } = renderHook(() => useFilterActions({ grid }));
    const { onFilterAction } = (result.current.gridWithTooltipAction as any).cells[0].content.options.__customTooltip;

    act(() => {
      onFilterAction('keep', {
        label: 'weekday',
        value: 3,
        rawValue: 3,
        sourceField: datetimePart('axis-weekday', 'weekday'),
      });
    });

    expect(mockAddFieldAsDiscreteFilter).not.toHaveBeenCalled();
    expect(mockUpdateExistingDiscreteFilter).toHaveBeenCalledWith(
      'filter-weekday',
      'reviewed_at',
      [3],
      dispatch,
      'weekday',
      'distinct',
    );
  });
});
