// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Dispatch for per-field filter writes that routes by filter scope.
 *
 * The panel reads merged state, and in that merge the session (global) store wins
 * over the sheet reducer (`mergeFilterMetadata` / `mergeFilterConfigurations`). So
 * a write into the sheet reducer for a session filter is not just redundant — it is
 * invisible, and the stale session copy stays on screen for good. `useFilterMetadata`
 * is fed the merged field list and cannot know which store a field lives in, so it
 * dispatches through here instead of straight into the visualization reducer.
 *
 * Only the three per-field writes have a session equivalent; everything else falls
 * through to the visualization reducer unchanged.
 */
import { useCallback, useRef } from 'react';
import { useDataSource } from '../contexts/DataSourceContext';
import { useVisualizationContext } from '../contexts/VisualizationContext';
import { isSessionFilter } from '../utils/scopedFilters';

export function useFilterStoreDispatch(): React.Dispatch<any> {
  const dataSourceContext = useDataSource();
  const { dispatch } = useVisualizationContext();

  // A ref keeps the dispatch stable for the hooks that list it as a dependency
  // while still reading the current session field list on every call.
  const dataSourceContextRef = useRef(dataSourceContext);
  dataSourceContextRef.current = dataSourceContext;

  return useCallback((action: any) => {
    const context = dataSourceContextRef.current;
    const fieldId = action?.payload?.fieldId;

    if (fieldId && isSessionFilter(fieldId, context.dataSource.sessionFilterFields)) {
      switch (action.type) {
        case 'SET_FILTER_METADATA':
          context.setSessionFilterMetadata(fieldId, action.payload.metadata);
          return;
        case 'SET_FILTER_CONFIGURATION':
          context.setSessionFilterConfiguration(fieldId, action.payload.config);
          return;
        case 'SET_AND_APPLY_FILTER_CONFIGURATION_SILENT':
          context.setAndApplySessionFilterConfiguration(fieldId, action.payload.config);
          return;
        default:
          break;
      }
    }

    dispatch(action);
  }, [dispatch]);
}
