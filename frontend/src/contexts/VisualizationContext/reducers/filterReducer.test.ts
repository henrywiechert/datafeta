import { filterReducer } from './filterReducer';
import { initialState } from '../initialState';

describe('filterReducer queryVersion semantics', () => {
  const baseFilterConfig = {
    fieldId: 'region',
    columnName: 'region',
    type: 'discrete' as const,
    selectedValues: ['West'],
    scope: 'sheet' as const,
  };

  test('REMOVE_FILTER_CONFIGURATION bumps queryVersion for real filter removal', () => {
    const state = {
      ...initialState,
      queryVersion: 4,
      disabledFilterIds: ['region'],
      filterConfigurations: { region: baseFilterConfig },
      appliedFilterConfigurations: { region: baseFilterConfig },
      filterMetadata: {
        region: {
          fieldId: 'region',
          columnName: 'region',
          type: 'discrete' as const,
          loading: false,
          availableValues: ['West', 'East'],
        },
      },
    };

    const next = filterReducer(state, {
      type: 'REMOVE_FILTER_CONFIGURATION',
      payload: 'region',
    } as any);

    expect(next).not.toBeNull();
    expect(next!.queryVersion).toBe(5);
    expect(next!.filterConfigurations).toEqual({});
    expect(next!.appliedFilterConfigurations).toEqual({});
    expect(next!.filterMetadata).toEqual({});
    expect(next!.disabledFilterIds).toEqual([]);
  });

  test('REMOVE_FILTER_CONFIGURATION_SILENT preserves queryVersion for scope-only moves', () => {
    const state = {
      ...initialState,
      queryVersion: 4,
      disabledFilterIds: ['region'],
      filterConfigurations: { region: baseFilterConfig },
      appliedFilterConfigurations: { region: baseFilterConfig },
      filterMetadata: {
        region: {
          fieldId: 'region',
          columnName: 'region',
          type: 'discrete' as const,
          loading: false,
          availableValues: ['West', 'East'],
        },
      },
    };

    const next = filterReducer(state, {
      type: 'REMOVE_FILTER_CONFIGURATION_SILENT',
      payload: 'region',
    } as any);

    expect(next).not.toBeNull();
    expect(next!.queryVersion).toBe(4);
    expect(next!.filterConfigurations).toEqual({});
    expect(next!.appliedFilterConfigurations).toEqual({});
    expect(next!.filterMetadata).toEqual(state.filterMetadata);
    expect(next!.disabledFilterIds).toEqual([]);
  });

  test('SET_AND_APPLY_FILTER_CONFIGURATION_SILENT preserves queryVersion while syncing applied state', () => {
    const state = {
      ...initialState,
      queryVersion: 9,
    };

    const next = filterReducer(state, {
      type: 'SET_AND_APPLY_FILTER_CONFIGURATION_SILENT',
      payload: {
        fieldId: 'region',
        config: { ...baseFilterConfig, scope: 'sheet' as const },
      },
    } as any);

    expect(next).not.toBeNull();
    expect(next!.queryVersion).toBe(9);
    expect(next!.filterConfigurations).toEqual({ region: { ...baseFilterConfig, scope: 'sheet' } });
    expect(next!.appliedFilterConfigurations).toEqual({ region: { ...baseFilterConfig, scope: 'sheet' } });
  });
});