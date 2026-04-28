/**
 * useTablePageSize Hook
 *
 * Global user setting for the page size used by the 'table-refactor' chart type
 * pager. Persisted to localStorage so the choice survives sheet switches and
 * reloads. The page size is shared across all sheets; the per-sheet page index
 * lives in VisualizationState (`tablePage`).
 */

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'dataslicer.tablePageSize';

/** Allowed page-size values exposed in the pager UI. */
export const TABLE_PAGE_SIZES: readonly number[] = [25, 50, 100, 250];

/** Default page size when no preference is stored. */
export const DEFAULT_TABLE_PAGE_SIZE = 25;

function readInitial(): number {
  if (typeof window === 'undefined') return DEFAULT_TABLE_PAGE_SIZE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw == null) return DEFAULT_TABLE_PAGE_SIZE;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TABLE_PAGE_SIZE;
    return parsed;
  } catch {
    return DEFAULT_TABLE_PAGE_SIZE;
  }
}

export function useTablePageSize(): {
  pageSize: number;
  setPageSize: (size: number) => void;
} {
  const [pageSize, setPageSizeState] = useState<number>(readInitial);

  const setPageSize = useCallback((size: number) => {
    if (!Number.isFinite(size) || size <= 0) return;
    setPageSizeState(Math.floor(size));
  }, []);

  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY, String(pageSize));
      }
    } catch {
      // ignore storage failures (private browsing, quota, etc.)
    }
  }, [pageSize]);

  return { pageSize, setPageSize };
}
