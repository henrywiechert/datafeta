// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Covers the row-count effect's dependency on the column list.
 *
 * The count query itself does not use the columns — `getRowCount` is a
 * COUNT(*) over table + filters — but the effect's early-return guard does. The
 * table view is normally opened before its Columns zone is populated, so the
 * guard fires first; if the effect does not re-run when the columns arrive,
 * `totalRows` stays 0 while rows render, which pins `totalPages` to 1 and
 * leaves every pager button disabled.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { useTableRowsQuery } from './useTableRowsQuery';
import type { Field } from '../../../../types';

const mockGetRowCount = jest.fn();
const mockExecuteQueryArrow = jest.fn();

jest.mock('../../../../services/api/metadataApi', () => ({
  metadataApi: { getRowCount: (...args: any[]) => mockGetRowCount(...args) },
}));

jest.mock('../../../../services/api/queryApi', () => ({
  queryApi: { executeQueryArrow: (...args: any[]) => mockExecuteQueryArrow(...args) },
}));

const makeField = (columnName: string): Field => ({
  id: `${columnName}-id`,
  columnName,
  type: 'dimension',
  flavour: 'discrete',
  dataType: 'string',
});

/** Identity is stable across renders, as VisualizationState guarantees. */
const NO_FIELDS: Field[] = [];
const COLUMNS: Field[] = [makeField('country')];

const props = (tableColumnFields: Field[]) => ({
  enabled: true,
  selectedTable: 'orders',
  selectedDatabase: 'shop',
  tableColumnFields,
  filterConfigurations: {},
});

describe('useTableRowsQuery row count', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRowCount.mockResolvedValue(1234);
    mockExecuteQueryArrow.mockResolvedValue({ rows: [{ country: 'DE' }], columns: [] });
  });

  it('counts rows once the columns arrive, so the pager is not stuck on one page', async () => {
    const { result, rerender } = renderHook((p: ReturnType<typeof props>) => useTableRowsQuery(p), {
      initialProps: props(NO_FIELDS),
    });

    // Opened with no columns yet: the guard short-circuits, no count is fetched.
    expect(mockGetRowCount).not.toHaveBeenCalled();
    expect(result.current.totalRows).toBe(0);

    rerender(props(COLUMNS));

    await waitFor(() => expect(result.current.totalRows).toBe(1234));
    expect(mockGetRowCount).toHaveBeenCalledTimes(1);
  });

  it('does not re-count when the columns change but the filters do not', async () => {
    // The count is a COUNT(*) over table + filters, so adding or reordering
    // columns must not cost a second round trip. This is why the effect depends
    // on `hasColumns` rather than on the column array's identity.
    const { result, rerender } = renderHook((p: ReturnType<typeof props>) => useTableRowsQuery(p), {
      initialProps: props(COLUMNS),
    });

    await waitFor(() => expect(result.current.totalRows).toBe(1234));
    expect(mockGetRowCount).toHaveBeenCalledTimes(1);

    rerender(props([...COLUMNS, makeField('city')]));
    await waitFor(() => expect(mockExecuteQueryArrow).toHaveBeenCalledTimes(2));
    expect(mockGetRowCount).toHaveBeenCalledTimes(1);
  });
});
