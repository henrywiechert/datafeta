// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Removing table columns has to happen in one call per gesture. The hook reads
 * the current column list from a ref that an effect only resyncs after the
 * dispatch commits, so a caller that looped over the selected ids would have
 * every call after the first read the pre-removal list — the last dispatch
 * would win and a multi-select delete would drop exactly one column.
 */
import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { useDragDrop } from './useDragDrop';
import { DataSourceProvider } from '../contexts/DataSourceContext';
import { VisualizationProvider, useVisualizationContext } from '../contexts/VisualizationContext';
import { UndoRedoProvider } from '../contexts/UndoRedoContext';
import { Field } from '../types';

const makeField = (columnName: string): Field => ({
  id: `available-${columnName}`,
  columnName,
  type: 'dimension',
  flavour: 'discrete',
  dataType: 'string',
});

const availableFields = ['a', 'b', 'c'].map(makeField);

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <DataSourceProvider>
    <VisualizationProvider>
      <UndoRedoProvider sheetId="sheet-1">{children}</UndoRedoProvider>
    </VisualizationProvider>
  </DataSourceProvider>
);

const renderTableColumns = () =>
  renderHook(
    () => ({
      handlers: useDragDrop(availableFields),
      columns: useVisualizationContext().state.tableColumnFields,
    }),
    { wrapper },
  );

describe('useDragDrop table columns', () => {
  it('removes every selected column in one pass', () => {
    const { result } = renderTableColumns();

    act(() => {
      result.current.handlers.handleTableColumnsDrop(availableFields, 'AVAILABLE_FIELDS');
    });
    expect(result.current.columns.map(f => f.columnName)).toEqual(['a', 'b', 'c']);

    const [colA, , colC] = result.current.columns;
    act(() => {
      result.current.handlers.handleRemoveFromTableColumns([colA.id, colC.id]);
    });

    expect(result.current.columns.map(f => f.columnName)).toEqual(['b']);
  });

  it('leaves the column list alone when none of the ids are columns', () => {
    const { result } = renderTableColumns();

    act(() => {
      result.current.handlers.handleTableColumnsDrop([availableFields[0]], 'AVAILABLE_FIELDS');
    });
    const before = result.current.columns;

    act(() => {
      result.current.handlers.handleRemoveFromTableColumns(['not-a-column']);
    });

    expect(result.current.columns).toBe(before);
  });
});
