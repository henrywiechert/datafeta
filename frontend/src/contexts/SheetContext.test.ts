// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { createEmptyVisualizationState } from './SheetContext';
import { initialState } from './VisualizationContext/initialState';
import { SHEET_SNAPSHOT_KEYS } from './VisualizationContext/persistedKeys';

describe('createEmptyVisualizationState', () => {
  // Regression: the sheet defaults were a hand-kept copy that drifted from
  // initialState (e.g. the caption heading level).
  it.each(SHEET_SNAPSHOT_KEYS.filter((key) => key !== 'measureGroup'))(
    'starts %s from the visualization defaults',
    (key) => {
      expect(createEmptyVisualizationState()[key]).toEqual(initialState[key]);
    },
  );

  it('gives every sheet its own empty measure group', () => {
    const first = createEmptyVisualizationState().measureGroup!;
    const second = createEmptyVisualizationState().measureGroup!;

    expect(first.members).toEqual([]);
    expect(first.id).not.toBe(second.id);
  });
});
