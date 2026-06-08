// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { initialState } from '../initialState';
import { PERSISTED_STATE_KEYS, UndoableSnapshot } from '../persistedKeys';
import { undoRedoReducer } from './undoRedoReducer';
import { VisualizationState } from '../types';

/**
 * Build a snapshot from a state using the same pattern as
 * `VisualizationProvider.getUndoableSnapshot`. Tests pin the keys list and the
 * reducer; if `getUndoableSnapshot` ever diverges from this pattern, that drift
 * shows up in the provider, not here.
 */
function snapshotOf(state: VisualizationState): UndoableSnapshot {
  return Object.fromEntries(
    PERSISTED_STATE_KEYS.map((key) => [key, state[key]]),
  ) as unknown as UndoableSnapshot;
}

describe('undoRedoReducer RESTORE_UNDOABLE_STATE', () => {
  it('every key in PERSISTED_STATE_KEYS is a real VisualizationState property', () => {
    for (const key of PERSISTED_STATE_KEYS) {
      expect(initialState).toHaveProperty(key);
    }
  });

  it('round-trips a snapshot of modified persisted keys faithfully', () => {
    const modified: VisualizationState = {
      ...initialState,
      colorScheme: 'plasma',
      colorBias: 0.5,
      manualColor: '#abcdef',
      globalChartType: 'cdf',
      labelsEnabled: true,
      labelSamplingThreshold: 999,
      bandThicknessScale: 1.7,
      independentDomains: { x: true, y: false },
      chartTypeParams: {
        ...initialState.chartTypeParams,
        line: { variant: 'area', areaFillOpacity: 0.42, colorMode: 'alongPath' },
        distribution: { variant: 'box-plot' },
        table: { cellMode: 'text', page: 3 },
      },
      queryVersion: 7,
    };

    const snapshot = snapshotOf(modified);

    // Restore on top of a different base; the persisted keys should overwrite.
    const otherBase: VisualizationState = {
      ...initialState,
      queryVersion: 100,
    };

    const restored = undoRedoReducer(otherBase, {
      type: 'RESTORE_UNDOABLE_STATE',
      payload: snapshot,
    });

    expect(restored).not.toBeNull();
    for (const key of PERSISTED_STATE_KEYS) {
      expect(restored![key]).toEqual(modified[key]);
    }
    // queryVersion is intentionally bumped on restore so the query re-runs.
    expect(restored!.queryVersion).toBe(otherBase.queryVersion + 1);
  });

  it('preserves base state for keys that are absent (undefined) in the snapshot', () => {
    const base: VisualizationState = {
      ...initialState,
      globalChartType: 'pie',
      manualColor: '#111111',
    };

    const restored = undoRedoReducer(base, {
      type: 'RESTORE_UNDOABLE_STATE',
      payload: {} as UndoableSnapshot,
    });

    expect(restored).not.toBeNull();
    expect(restored!.globalChartType).toBe('pie');
    expect(restored!.manualColor).toBe('#111111');
    expect(restored!.queryVersion).toBe(base.queryVersion + 1);
  });

  it('restores explicit null values (distinct from "absent")', () => {
    const base: VisualizationState = {
      ...initialState,
      colorField: { id: 'c', columnName: 'c', type: 'dimension', flavour: 'discrete', dataType: 'string' },
      globalChartType: 'cdf',
    };

    const restored = undoRedoReducer(base, {
      type: 'RESTORE_UNDOABLE_STATE',
      payload: { colorField: null, globalChartType: null } as UndoableSnapshot,
    });

    expect(restored).not.toBeNull();
    expect(restored!.colorField).toBeNull();
    expect(restored!.globalChartType).toBeNull();
  });

  it('does not touch ephemeral (non-persisted) state', () => {
    const ephemeralBefore = {
      isLoadingQuery: true,
      queryError: 'boom',
      operationStartTimes: { query: 1234, rendering: null, metadata: null },
      activeOperations: ['query'] as const,
    };
    const base: VisualizationState = {
      ...initialState,
      ...ephemeralBefore,
      activeOperations: [...ephemeralBefore.activeOperations],
    };

    const restored = undoRedoReducer(base, {
      type: 'RESTORE_UNDOABLE_STATE',
      payload: snapshotOf(initialState),
    });

    expect(restored).not.toBeNull();
    expect(restored!.isLoadingQuery).toBe(true);
    expect(restored!.queryError).toBe('boom');
    expect(restored!.operationStartTimes.query).toBe(1234);
    expect(restored!.activeOperations).toEqual(['query']);
  });

  it('does not restore transient map view state from undo snapshots', () => {
    const mapView: VisualizationState['mapViewByPlotId'] = {
      'facet-0-0': [-6, 50, 2, 58],
    };
    const base: VisualizationState = {
      ...initialState,
      mapViewByPlotId: mapView,
    };

    const restored = undoRedoReducer(base, {
      type: 'RESTORE_UNDOABLE_STATE',
      payload: snapshotOf(initialState),
    });

    expect(restored).not.toBeNull();
    expect(restored!.mapViewByPlotId).toEqual(mapView);
  });

  it('returns null for unrelated actions (so the reducer pipeline can chain)', () => {
    const result = undoRedoReducer(initialState, { type: 'RESET_STATE' });
    expect(result).toBeNull();
  });
});
