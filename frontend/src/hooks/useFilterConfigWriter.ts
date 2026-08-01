// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Writes a filter config into the draft layer, routing to the session store or the
 * sheet reducer depending on the filter's scope. The chart is unaffected until Apply.
 */
import { useCallback, useRef } from 'react';
import { useDataSource } from '../contexts/DataSourceContext';
import { useVisualizationContext } from '../contexts/VisualizationContext';
import { FilterConfig } from '../types';
import { isSessionFilter } from '../utils/scopedFilters';

export type FilterConfigWriter = (fieldId: string, config: FilterConfig) => void;

export function useFilterConfigWriter(): FilterConfigWriter {
  const dataSourceContext = useDataSource();
  const { dispatch } = useVisualizationContext();

  // Refs keep the writer stable for memoized consumers while always reading the
  // latest session field list.
  const dataSourceContextRef = useRef(dataSourceContext);
  dataSourceContextRef.current = dataSourceContext;

  return useCallback((fieldId: string, config: FilterConfig) => {
    const context = dataSourceContextRef.current;
    if (isSessionFilter(fieldId, context.dataSource.sessionFilterFields)) {
      context.setSessionFilterConfiguration(fieldId, config);
      return;
    }

    dispatch({
      type: 'SET_FILTER_CONFIGURATION',
      payload: { fieldId, config },
    });
  }, [dispatch]);
}
