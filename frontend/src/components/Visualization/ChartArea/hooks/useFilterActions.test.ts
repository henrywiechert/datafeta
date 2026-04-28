import { renderHook, act } from '@testing-library/react';
import { useFilterActions } from './useFilterActions';
import type { Field } from '../../../../types';

const mockUseVisualizationContext = jest.fn();
const mockAddFieldAsDiscreteFilter = jest.fn();
const mockUpdateExistingDiscreteFilter = jest.fn();

jest.mock('../../../../contexts/VisualizationContext', () => ({
  useVisualizationContext: () => mockUseVisualizationContext(),
}));

jest.mock('../../../../utils/filterActions', () => ({
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
  const recordAction = jest.fn();
  const getUndoableSnapshot = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    getUndoableSnapshot.mockReturnValue({ snapshot: true });
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

    const { result } = renderHook(() => useFilterActions({
      recordAction,
      getUndoableSnapshot,
      grid: null,
    }));

    act(() => {
      result.current.handleLegendFilterAction('keep', ['Gentoo'], ['Adelie', 'Gentoo']);
    });

    expect(recordAction).toHaveBeenCalledWith({ snapshot: true });
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

    const { result } = renderHook(() => useFilterActions({
      recordAction,
      getUndoableSnapshot,
      grid: null,
    }));

    act(() => {
      result.current.handleShapeLegendFilterAction('exclude', ['B'], ['A', 'B', 'C']);
    });

    expect(recordAction).toHaveBeenCalledWith({ snapshot: true });
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

    const { result } = renderHook(() => useFilterActions({
      recordAction,
      getUndoableSnapshot,
      grid: null,
    }));

    act(() => {
      result.current.handleLegendFilterAction('keep', ['A'], ['A', 'B']);
      result.current.handleShapeLegendFilterAction('exclude', ['B'], ['A', 'B']);
    });

    expect(recordAction).not.toHaveBeenCalled();
    expect(mockAddFieldAsDiscreteFilter).not.toHaveBeenCalled();
    expect(mockUpdateExistingDiscreteFilter).not.toHaveBeenCalled();
  });
});