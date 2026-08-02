// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { captionReducer } from './captionReducer';
import { initialState } from '../initialState';

describe('captionReducer', () => {
  it('sets chart caption text', () => {
    const next = captionReducer(initialState, {
      type: 'SET_CHART_CAPTION',
      payload: '## Hello',
    });
    expect(next).toEqual({ ...initialState, chartCaption: '## Hello' });
  });

  it('toggles chart caption visibility', () => {
    const shown = captionReducer(initialState, {
      type: 'SET_SHOW_CHART_CAPTION',
      payload: true,
    });
    expect(shown?.showChartCaption).toBe(true);

    const hidden = captionReducer(shown!, {
      type: 'SET_SHOW_CHART_CAPTION',
      payload: false,
    });
    expect(hidden?.showChartCaption).toBe(false);
  });

  it('returns null for unrelated actions', () => {
    expect(captionReducer(initialState, { type: 'RESET_STATE' } as any)).toBeNull();
  });
});
