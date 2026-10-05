// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { initialState } from './initialState';
import { SHEET_SNAPSHOT_KEYS } from './persistedKeys';
import { buildSheetSnapshot } from './sheetSnapshot';
import { VisualizationState } from './types';
import { Field, FilterConfig } from '../../types';

const makeField = (id: string): Field => ({
  id,
  columnName: id,
  type: 'dimension',
  flavour: 'discrete',
  dataType: 'string',
});

const filterConfig = (columnName: string) => ({ columnName, type: 'dimension' } as unknown as FilterConfig);

describe('buildSheetSnapshot', () => {
  it.each(SHEET_SNAPSHOT_KEYS)('writes %s into the sheet snapshot', (key) => {
    const snapshot = buildSheetSnapshot(initialState, new Set());

    expect(snapshot).toHaveProperty(key);
    expect(snapshot[key as keyof typeof snapshot]).toEqual(initialState[key]);
  });

  // Regression: these were missing from the hand-written snapshot and were
  // lost on sheet switch, duplication and file save.
  it('persists facet background, overlays, table view and category tick styles', () => {
    const state: VisualizationState = {
      ...initialState,
      facetBackgroundField: makeField('segment'),
      facetBackgroundScheme: 'pastel1',
      facetBackgroundOpacity: 0.3,
      showTableRows: true,
      tableColumnFields: [makeField('country')],
      overlays: initialState.overlays.map((overlay, index) => (index === 0 ? { ...overlay, enabled: true } : overlay)),
    };

    const snapshot = buildSheetSnapshot(state, new Set());

    expect(snapshot.facetBackgroundField).toBe(state.facetBackgroundField);
    expect(snapshot.facetBackgroundScheme).toBe('pastel1');
    expect(snapshot.facetBackgroundOpacity).toBe(0.3);
    expect(snapshot.showTableRows).toBe(true);
    expect(snapshot.tableColumnFields).toBe(state.tableColumnFields);
    expect(snapshot.overlays).toBe(state.overlays);
    expect(snapshot.categoryTickStyles).toBe(state.categoryTickStyles);
  });

  it('strips session-scoped filters from fields and configurations', () => {
    const sheetFilter = makeField('sheet-filter');
    const sessionFilter = makeField('session-filter');
    const state: VisualizationState = {
      ...initialState,
      filterFields: [sheetFilter, sessionFilter],
      filterConfigurations: {
        [sheetFilter.id]: filterConfig('sheet-filter'),
        [sessionFilter.id]: filterConfig('session-filter'),
      },
      appliedFilterConfigurations: {
        [sheetFilter.id]: filterConfig('sheet-filter'),
        [sessionFilter.id]: filterConfig('session-filter'),
      },
    };

    const snapshot = buildSheetSnapshot(state, new Set([sessionFilter.id]));

    expect(snapshot.filterFields).toEqual([sheetFilter]);
    expect(Object.keys(snapshot.filterConfigurations!)).toEqual([sheetFilter.id]);
    expect(Object.keys(snapshot.appliedFilterConfigurations!)).toEqual([sheetFilter.id]);
  });

  it('derives selectedChartType from globalChartType', () => {
    expect(buildSheetSnapshot({ ...initialState, globalChartType: null }, new Set()).selectedChartType).toBe('auto');
    expect(buildSheetSnapshot({ ...initialState, globalChartType: 'line' }, new Set()).selectedChartType).toBe('line');
  });
});
