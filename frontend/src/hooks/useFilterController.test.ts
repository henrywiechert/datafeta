import { act, renderHook } from '@testing-library/react';
import { useDataSource } from '../contexts/DataSourceContext';
import { useVisualizationContext } from '../contexts/VisualizationContext';
import { useUndoRedo } from './useUndoRedo';
import { useGlobalFilters } from './useGlobalFilters';
import { useFilterController } from './useFilterController';
import { DiscreteFilterConfig, Field, FilterConfig } from '../types';

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

function config(id: string, scope: 'sheet' | 'session' = 'sheet'): DiscreteFilterConfig {
  return {
    fieldId: id,
    columnName: id,
    type: 'discrete',
    selectedValues: [scope],
    scope,
  };
}

function withValues(base: DiscreteFilterConfig, selectedValues: string[]): FilterConfig {
  return { ...base, selectedValues };
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
        sessionAppliedFilterConfigurations: { session: config('session', 'session') },
        sessionFilterMetadata: {},
      },
      setSessionFilterConfiguration,
      applySessionFilters,
    } as any);

    mockUseVisualizationContext.mockReturnValue({
      state: {
        filterFields: [field('local')],
        filterConfigurations: { local: config('local', 'sheet') },
        appliedFilterConfigurations: { local: config('local', 'sheet') },
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
    expect(result.current.hasPendingApply).toBe(false);
  });

  test('keeps a filter in place when it moves to session scope', () => {
    const sheetState = (fields: Field[]) => ({
      state: {
        filterFields: fields,
        filterConfigurations: Object.fromEntries(fields.map((f) => [f.id, config(f.id)])),
        appliedFilterConfigurations: Object.fromEntries(fields.map((f) => [f.id, config(f.id)])),
        filterMetadata: {},
        disabledFilterIds: [],
      },
      dispatch,
      getUndoableSnapshot,
    });

    mockUseDataSource.mockReturnValue({
      dataSource: {
        sessionFilterFields: [],
        sessionFilterConfigurations: {},
        sessionAppliedFilterConfigurations: {},
        sessionFilterMetadata: {},
      },
      setSessionFilterConfiguration,
      applySessionFilters,
    } as any);
    mockUseVisualizationContext.mockReturnValue(sheetState([field('a'), field('b')]) as any);

    const { result, rerender } = renderHook(() => useFilterController());
    expect(result.current.effective.fields.map((item) => item.id)).toEqual(['a', 'b']);

    // 'b' is promoted to session scope: it leaves the sheet store and enters the
    // session store, which the raw merge would list first.
    mockUseDataSource.mockReturnValue({
      dataSource: {
        sessionFilterFields: [field('b')],
        sessionFilterConfigurations: { b: config('b', 'session') },
        sessionAppliedFilterConfigurations: { b: config('b', 'session') },
        sessionFilterMetadata: {},
      },
      setSessionFilterConfiguration,
      applySessionFilters,
    } as any);
    mockUseVisualizationContext.mockReturnValue(sheetState([field('a')]) as any);
    rerender();

    expect(result.current.effective.fields.map((item) => item.id)).toEqual(['a', 'b']);
  });

  test('reports pending Apply when draft differs from applied', () => {
    mockUseVisualizationContext.mockReturnValue({
      state: {
        filterFields: [field('local')],
        filterConfigurations: { local: withValues(config('local'), ['draft']) },
        appliedFilterConfigurations: { local: withValues(config('local'), ['applied']) },
        filterMetadata: {},
        disabledFilterIds: [],
      },
      dispatch,
      getUndoableSnapshot,
    } as any);

    const { result } = renderHook(() => useFilterController());
    expect(result.current.hasPendingApply).toBe(true);
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

  test('removes session filters through the global filter path and clears the sheet copy', () => {
    const { result } = renderHook(() => useFilterController());

    act(() => {
      result.current.removeFilter('session');
    });

    // Session removal also runs the sheet cleanup so no orphaned local applied
    // config can survive if the field was duplicated across scopes.
    expect(recordAction).toHaveBeenCalledWith({ snapshot: true });
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_FILTER_FIELDS',
      payload: [field('local')],
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: 'REMOVE_FILTER_CONFIGURATION',
      payload: 'session',
    });
    expect(removeGlobalFilter).toHaveBeenCalledWith('session');
  });

  test('removing a filter present in both scopes clears both stores (regression)', () => {
    // A field can transiently live in the sheet store AND the session store at
    // once (stale sheet snapshot resurrected during promotion to global).
    // Removal must purge both so the query never retains an orphaned config.
    mockUseVisualizationContext.mockReturnValue({
      state: {
        filterFields: [field('local'), field('dup')],
        filterConfigurations: {
          local: config('local', 'sheet'),
          dup: config('dup', 'sheet'),
        },
        appliedFilterConfigurations: {
          local: config('local', 'sheet'),
          dup: config('dup', 'sheet'),
        },
        filterMetadata: {},
        disabledFilterIds: [],
      },
      dispatch,
      getUndoableSnapshot,
    } as any);
    mockUseDataSource.mockReturnValue({
      dataSource: {
        sessionFilterFields: [field('dup')],
        sessionFilterConfigurations: { dup: config('dup', 'session') },
        sessionAppliedFilterConfigurations: { dup: config('dup', 'session') },
        sessionFilterMetadata: {},
      },
      setSessionFilterConfiguration,
      applySessionFilters,
    } as any);

    const { result } = renderHook(() => useFilterController());

    act(() => {
      result.current.removeFilter('dup');
    });

    // Sheet store cleared for 'dup'...
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_FILTER_FIELDS',
      payload: [field('local')],
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: 'REMOVE_FILTER_CONFIGURATION',
      payload: 'dup',
    });
    // ...and session store cleared too.
    expect(removeGlobalFilter).toHaveBeenCalledWith('dup');
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

  test('records one undo snapshot for a batch of draft edits, before the first one', () => {
    const { result } = renderHook(() => useFilterController());

    act(() => {
      result.current.updateFilterConfig('local', withValues(config('local'), ['a']));
      result.current.updateFilterConfig('local', withValues(config('local'), ['a', 'b']));
      result.current.updateFilterConfig('session', withValues(config('session', 'session'), ['c']));
    });

    // Snapshot is taken before the draft is touched, so undo restores the pre-edit
    // draft together with the pre-edit applied configurations.
    expect(recordAction).toHaveBeenCalledTimes(1);
    expect(recordAction).toHaveBeenCalledWith({ snapshot: true });
  });

  test('starts a new undo batch once the applied configurations change', () => {
    const { result, rerender } = renderHook(() => useFilterController());

    act(() => {
      result.current.updateFilterConfig('local', withValues(config('local'), ['a']));
      result.current.applyFilters();
    });
    expect(recordAction).toHaveBeenCalledTimes(1);

    mockUseVisualizationContext.mockReturnValue({
      state: {
        filterFields: [field('local')],
        filterConfigurations: { local: config('local', 'sheet') },
        appliedFilterConfigurations: { local: config('local', 'sheet') },
        filterMetadata: {},
        disabledFilterIds: ['local-disabled'],
      },
      dispatch,
      getUndoableSnapshot,
    } as any);
    rerender();

    act(() => {
      result.current.updateFilterConfig('local', withValues(config('local'), ['b']));
    });
    expect(recordAction).toHaveBeenCalledTimes(2);
  });

  test('applies both sheet and session filter configurations', () => {
    const { result } = renderHook(() => useFilterController());

    act(() => {
      result.current.applyFilters();
    });

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
