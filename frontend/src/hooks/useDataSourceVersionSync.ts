// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useRef } from 'react';
import { useSheetRenderCacheStore } from '../stores';

/**
 * Hook to listen for data source changes and increment version.
 * Should be used at the app level (e.g., in DataSourceProvider or App).
 * Note: measureGroupFields is now per-sheet, so it doesn't trigger global invalidation.
 */
export function useDataSourceVersionSync(deps: {
  selectedDatabase: string;
  selectedTable: string;
  virtualColumnsLength: number;
  joinedTablesLength: number;
  unionTablesLength: number;
}) {
  const prevDepsRef = useRef(deps);
  const incrementDataSourceVersion = useSheetRenderCacheStore(
    state => state.incrementDataSourceVersion
  );

  useEffect(() => {
    const prev = prevDepsRef.current;
    const changed = 
      prev.selectedDatabase !== deps.selectedDatabase ||
      prev.selectedTable !== deps.selectedTable ||
      prev.virtualColumnsLength !== deps.virtualColumnsLength ||
      prev.joinedTablesLength !== deps.joinedTablesLength ||
      prev.unionTablesLength !== deps.unionTablesLength;

    if (changed) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[useDataSourceVersionSync] Data source changed, incrementing version', {
          prev,
          current: deps,
        });
      }
      incrementDataSourceVersion();
      prevDepsRef.current = deps;
    }
  }, [deps, incrementDataSourceVersion]);
}
