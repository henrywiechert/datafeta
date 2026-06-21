// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { encodingReducer } from './encodingReducer';
import { initialState } from '../initialState';

describe('encodingReducer facet depth sizing', () => {
  test('stores one top facet depth height override without changing scalar fallback', () => {
    const next = encodingReducer(initialState, {
      type: 'SET_FACET_TOP_VALUES_DEPTH_HEIGHT',
      payload: { depthIndex: 2, heightPx: 44 },
    } as any);

    expect(next).not.toBeNull();
    expect(next!.facetLabelStyles.topValues.heightPx).toBeNull();
    expect(next!.facetLabelStyles.topValues.heightPxByDepth).toEqual([undefined, undefined, 44]);
  });

  test('stores one left facet depth width override without changing scalar fallback', () => {
    const next = encodingReducer(initialState, {
      type: 'SET_FACET_LEFT_VALUES_DEPTH_WIDTH',
      payload: { depthIndex: 1, widthPx: 96 },
    } as any);

    expect(next).not.toBeNull();
    expect(next!.facetLabelStyles.leftValues.widthPx).toBeNull();
    expect(next!.facetLabelStyles.leftValues.widthPxByDepth).toEqual([undefined, 96]);
  });

  test('returns the same reference when a depth override is unchanged', () => {
    const state = {
      ...initialState,
      facetLabelStyles: {
        ...initialState.facetLabelStyles,
        topValues: {
          ...initialState.facetLabelStyles.topValues,
          heightPxByDepth: [18, 24],
        },
      },
    };

    const next = encodingReducer(state, {
      type: 'SET_FACET_TOP_VALUES_DEPTH_HEIGHT',
      payload: { depthIndex: 1, heightPx: 24 },
    } as any);

    expect(next).toBe(state);
  });

  test('stores top facet value per-depth style arrays through the generic style action', () => {
    const next = encodingReducer(initialState, {
      type: 'SET_FACET_TOP_VALUES_STYLE',
      payload: {
        orientationByDepth: ['horizontal', 'angled'],
        horizontalAlignByDepth: ['start'],
        wrapModeByDepth: ['nowrap'],
      },
    } as any);

    expect(next).not.toBeNull();
    expect(next!.facetLabelStyles.topValues.orientationByDepth).toEqual(['horizontal', 'angled']);
    expect(next!.facetLabelStyles.topValues.horizontalAlignByDepth).toEqual(['start']);
    expect(next!.facetLabelStyles.topValues.wrapModeByDepth).toEqual(['nowrap']);
  });

  test('ignores invalid negative facet depth indexes', () => {
    const next = encodingReducer(initialState, {
      type: 'SET_FACET_LEFT_VALUES_DEPTH_WIDTH',
      payload: { depthIndex: -1, widthPx: 50 },
    } as any);

    expect(next).toBe(initialState);
  });

  test('stores a Y-measure band column width override by band index', () => {
    const next = encodingReducer(initialState, {
      type: 'SET_MEASURE_BAND_COL_WIDTH',
      payload: { bandIndex: 1, widthPx: 120 },
    } as any);

    expect(next).not.toBeNull();
    expect(next!.facetLabelStyles.measureBands?.colWidthsPx).toEqual([undefined, 120]);
    expect(next!.facetLabelStyles.measureBands?.rowHeightsPx).toBeUndefined();
  });

  test('stores an X-measure band row height override without disturbing column widths', () => {
    const withCol = encodingReducer(initialState, {
      type: 'SET_MEASURE_BAND_COL_WIDTH',
      payload: { bandIndex: 0, widthPx: 100 },
    } as any);
    const next = encodingReducer(withCol!, {
      type: 'SET_MEASURE_BAND_ROW_HEIGHT',
      payload: { bandIndex: 0, heightPx: 40 },
    } as any);

    expect(next).not.toBeNull();
    expect(next!.facetLabelStyles.measureBands?.colWidthsPx).toEqual([100]);
    expect(next!.facetLabelStyles.measureBands?.rowHeightsPx).toEqual([40]);
  });

  test('ignores invalid negative measure band indexes', () => {
    const next = encodingReducer(initialState, {
      type: 'SET_MEASURE_BAND_COL_WIDTH',
      payload: { bandIndex: -1, widthPx: 80 },
    } as any);

    expect(next).toBe(initialState);
  });
});