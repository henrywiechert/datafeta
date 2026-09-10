// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { act, renderHook } from '@testing-library/react';
import { useConnectionForm } from './useConnectionForm';

jest.mock('../apiService', () => ({ apiService: {} }));

describe('useConnectionForm SQLite state', () => {
  it('requires a database file before connecting', () => {
    const { result } = renderHook(() => useConnectionForm());

    act(() => result.current.setConnectionType('sqlite'));

    expect(result.current.validateForm()).toEqual({
      isValid: false,
      errorMessage: 'Please select a SQLite database file (.sqlite, .sqlite3 or .db).',
    });
  });

  it('validates and builds details once a file is selected', () => {
    const { result } = renderHook(() => useConnectionForm());
    const file = new File([new Uint8Array([1])], 'shop.sqlite');

    act(() => result.current.setConnectionType('sqlite'));
    act(() => result.current.handleSqliteFileChange(file));

    expect(result.current.sqliteState.selectedFile).toBe(file);
    expect(result.current.sqliteState.fileName).toBe('shop.sqlite');
    expect(result.current.validateForm().isValid).toBe(true);
    // The schema lives in the file, so nothing else is sent at connect time.
    expect(result.current.buildConnectionDetails()).toEqual({ type: 'sqlite' });
  });

  it('clears the selected file when clearing the picker', () => {
    const { result } = renderHook(() => useConnectionForm());

    act(() => result.current.handleSqliteFileChange(new File([new Uint8Array([1])], 'shop.db')));
    act(() => result.current.handleSqliteFileChange(null));

    expect(result.current.sqliteState.selectedFile).toBeNull();
    expect(result.current.sqliteState.fileName).toBe('');
  });

  it('drops the previous file when syncing from an active connection', () => {
    const { result } = renderHook(() => useConnectionForm());

    act(() => result.current.handleSqliteFileChange(new File([new Uint8Array([1])], 'shop.db')));
    act(() => result.current.syncFromConnectionDetails({ type: 'sqlite' }));

    expect(result.current.connectionType).toBe('sqlite');
    expect(result.current.sqliteState.selectedFile).toBeNull();
  });
});
