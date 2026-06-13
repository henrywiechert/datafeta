import { act, renderHook } from '@testing-library/react';
import { useDataSource } from '../contexts/DataSourceContext';
import { useVisualizationContext } from '../contexts/VisualizationContext';
import { useUndoRedo } from './useUndoRedo';
import { useGlobalFilters } from './useGlobalFilters';
import { useFilterController } from './useFilterController';
import { Field, FilterConfig } from '../types';

jest.mock('../contexts/DataSourceContext', () => ({
  useDataSource: jest.fn(),
}));

jest.mock('../contexts/VisualizationContext', () => ({
  useVisualizationContext: jest.fn(),
}));

jest.mock('./useUndoRedo', () => ({
  useUndoRedo: jest.fn(),
}));

jest.mock('./useGlobalFilters', () => ({
  useGlobalFilters: jest.fn(),
}));

const mockUseDataSource = useDataSource as jest.MockedFunction<typeof useDataSource>;
const mockUseVisualizationContext = useVisualizationContext as jest.MockedFunction<typeof useVisualizationContext>;
const mockUseUndoRedo = useUndoRedo as jest.MockedFunction<typeof useUndoRedo>;
const mockUseGlobalFilters = useGlobalFilters as jest.MockedFunction<typeof useGlobalFilters>;

function field(id: string): Field {
  return {
    id,
    columnName: id,
    type: 'dimension',
    flavour: 'discrete',
    dataType: 'string',
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

describe('useFilterController', () => {
  const dispatch = jest.fn();
  const recordAction = jest.fn();
  const getUndoableSnapshot = jest.fn(() => ({ snapshot: true }));
  const setSessionFilterConfiguration = jest.fn();
  const applySessionFilters = jest.fn();
  const markFilterAsGlobal = jest.fn();
  const unmarkGlobalFilter = jest.fn();
  const removeGlobalFilter = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    getUndoableSnapshot.mockReturnValue({ snapshot: true });

    mockUseDataSource.mockReturnValue({
      dataSource: {
        sessionFilterFields: [field('session')],
        sessionFilterConfigurations: { session: config('session', 'session') },
        sessionFilterMetadata: {},
      },
      setSessionFilterConfiguration,
      applySessionFilters,
    } as any);

    mockUseVisualizationContext.mockReturnValue({
      state: {
        filterFields: [field('local')],
        filterConfigurations: { local: config('local', 'sheet') },
        filterMetadata: {},
        disabledFilterIds: ['local-disabled'],
      },
      dispatch,
      getUndoableSnapshot,
    } as any);

    mockUseUndoRedo.mockReturnValue({
      recordAction,
    } as any);

    mockUseGlobalFilters.mockReturnValue({
      markFilterAsGlobal,
      unmarkGlobalFilter,
      removeGlobalFilter,
    } as any);
  });

  test('returns effective filter state for UI consumers', () => {
    const { result } = renderHook(() => useFilterController());

    expect(result.current.effective.fields.map((item) => item.id)).toEqual(['session', 'local']);
    expect(result.current.effective.configurations.session.scope).toBe('session');
    expect(result.current.effective.configurations.local.scope).toBe('sheet');
    expect(result.current.effective.sessionFilterIds).toEqual(new Set(['session']));
    expect(result.current.effective.disabledFilterIds).toEqual(new Set(['local-disabled']));
  });

  test('removes sheet filters through visualization state with undo recording', () => {
    const { result } = renderHook(() => useFilterController());

    act(() => {
      result.current.removeFilter('local');
    });

    expect(recordAction).toHaveBeenCalledWith({ snapshot: true });
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_FILTER_FIELDS',
      payload: [],
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: 'REMOVE_FILTER_CONFIGURATION',
      payload: 'local',
    });
    expect(removeGlobalFilter).not.toHaveBeenCalled();
  });

  test('removes session filters through the global filter path', () => {
    const { result } = renderHook(() => useFilterController());

    act(() => {
      result.current.removeFilter('session');
    });

    expect(removeGlobalFilter).toHaveBeenCalledWith('session');
    expect(dispatch).not.toHaveBeenCalled();
    expect(recordAction).not.toHaveBeenCalled();
  });

  test('routes config updates by filter scope', () => {
    const { result } = renderHook(() => useFilterController());
    const nextLocal = { ...config('local', 'sheet'), selectedValues: ['updated'] };
    const nextSession = { ...config('session', 'session'), selectedValues: ['updated'] };

    act(() => {
      result.current.updateFilterConfig('local', nextLocal);
      result.current.updateFilterConfig('session', nextSession);
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_FILTER_CONFIGURATION',
      payload: { fieldId: 'local', config: nextLocal },
    });
    expect(setSessionFilterConfiguration).toHaveBeenCalledWith('session', nextSession);
  });

  test('applies both sheet and session filter configurations', () => {
    const { result } = renderHook(() => useFilterController());

    act(() => {
      result.current.applyFilters();
    });

    expect(recordAction).toHaveBeenCalledWith({ snapshot: true });
    expect(dispatch).toHaveBeenCalledWith({ type: 'APPLY_FILTERS' });
    expect(applySessionFilters).toHaveBeenCalled();
  });

  test('delegates scope transitions and disabled toggles', () => {
    const { result } = renderHook(() => useFilterController());

    act(() => {
      result.current.markAsSession('local');
      result.current.markAsSheet('session');
      result.current.toggleFilterDisabled('local');
    });

    expect(markFilterAsGlobal).toHaveBeenCalledWith('local');
    expect(unmarkGlobalFilter).toHaveBeenCalledWith('session');
    expect(dispatch).toHaveBeenCalledWith({ type: 'TOGGLE_FILTER_DISABLED', payload: 'local' });
  });
});
