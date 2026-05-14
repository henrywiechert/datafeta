// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { act, renderHook } from '@testing-library/react';
import { useTablePageSize, DEFAULT_TABLE_PAGE_SIZE, TABLE_PAGE_SIZES } from './useTablePageSize';

const STORAGE_KEY = 'dataslicer.tablePageSize';

beforeEach(() => {
  window.localStorage.clear();
});

describe('useTablePageSize', () => {
  it('returns the default page size when no preference is stored', () => {
    const { result } = renderHook(() => useTablePageSize());
    expect(result.current.pageSize).toBe(DEFAULT_TABLE_PAGE_SIZE);
  });

  it('reads a previously stored page size from localStorage', () => {
    window.localStorage.setItem(STORAGE_KEY, '100');
    const { result } = renderHook(() => useTablePageSize());
    expect(result.current.pageSize).toBe(100);
  });

  it('falls back to the default when localStorage holds a non-numeric value', () => {
    window.localStorage.setItem(STORAGE_KEY, 'oops');
    const { result } = renderHook(() => useTablePageSize());
    expect(result.current.pageSize).toBe(DEFAULT_TABLE_PAGE_SIZE);
  });

  it('persists a new page size to localStorage', () => {
    const { result } = renderHook(() => useTablePageSize());
    act(() => {
      result.current.setPageSize(50);
    });
    expect(result.current.pageSize).toBe(50);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('50');
  });

  it('ignores non-positive / non-finite page-size updates', () => {
    const { result } = renderHook(() => useTablePageSize());
    act(() => {
      result.current.setPageSize(0);
      result.current.setPageSize(-25);
      result.current.setPageSize(Number.NaN);
    });
    expect(result.current.pageSize).toBe(DEFAULT_TABLE_PAGE_SIZE);
  });

  it('exposes the canonical PAGE_SIZES list', () => {
    expect(TABLE_PAGE_SIZES).toContain(DEFAULT_TABLE_PAGE_SIZE);
    expect(TABLE_PAGE_SIZES.every((s) => s > 0)).toBe(true);
  });
});
