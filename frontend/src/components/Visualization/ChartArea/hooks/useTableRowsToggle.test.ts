// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { renderHook, act } from '@testing-library/react';
import { useTableRowsToggle } from './useTableRowsToggle';
import type { Field } from '../../../../types';

const mockUseVisualizationContext = jest.fn();
const mockRecordUndoPoint = jest.fn();

jest.mock('../../../../contexts/VisualizationContext', () => ({
  useVisualizationContext: () => mockUseVisualizationContext(),
}));

// Stable identity across renders, as the real hook guarantees.
jest.mock('../../../../hooks/useRecordUndoPoint', () => ({
  useRecordUndoPoint: () => mockRecordUndoPoint,
}));

const makeField = (columnName: string, overrides?: Partial<Field>): Field => ({
  id: `${columnName}-id`,
  columnName,
  type: 'dimension',
  flavour: 'discrete',
  dataType: 'string',
  ...overrides,
});

describe('useTableRowsToggle', () => {
  const dispatch = jest.fn();

  const buildState = (overrides?: Record<string, any>) => ({
    tableColumnFields: [],
    xAxisFields: [makeField('category')],
    yAxisFields: [makeField('value', { type: 'measure', flavour: 'continuous' })],
    colorField: null,
    sizeField: null,
    labelFields: [],
    tooltipFields: [],
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('seeds table columns from current encodings when entering with an empty list', () => {
    mockUseVisualizationContext.mockReturnValue({ state: buildState(), dispatch });

    const { result } = renderHook(() => useTableRowsToggle());
    act(() => result.current(true));

    expect(mockRecordUndoPoint).toHaveBeenCalledTimes(1);

    const seedAction = dispatch.mock.calls.find(
      ([action]) => action.type === 'SET_TABLE_COLUMN_FIELDS',
    );
    expect(seedAction).toBeDefined();
    const seeded = seedAction[0].payload;
    expect(seeded).toHaveLength(2);
    expect(seeded.map((f: Field) => f.columnName)).toEqual(['category', 'value']);
    // Seeded fields get fresh ids so they are independent of the encoding chips.
    expect(seeded[0].id).not.toBe('category-id');

    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_SHOW_TABLE_ROWS', payload: true });
  });

  it('never re-seeds once the column list is user-owned', () => {
    mockUseVisualizationContext.mockReturnValue({
      state: buildState({ tableColumnFields: [makeField('existing')] }),
      dispatch,
    });

    const { result } = renderHook(() => useTableRowsToggle());
    act(() => result.current(true));

    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'SET_TABLE_COLUMN_FIELDS' }),
    );
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_SHOW_TABLE_ROWS', payload: true });
  });

  it('skips seeding entirely when hiding the table rows view', () => {
    mockUseVisualizationContext.mockReturnValue({ state: buildState(), dispatch });

    const { result } = renderHook(() => useTableRowsToggle());
    act(() => result.current(false));

    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'SET_TABLE_COLUMN_FIELDS' }),
    );
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_SHOW_TABLE_ROWS', payload: false });
  });
});
