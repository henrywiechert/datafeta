/**
 * useQueryExecution Hook
 * 
 * Thin coordinator that composes query building and execution hooks.
 * Responsibilities:
 * - Initialize DuckDB WASM on mount
 * - Coordinate version tracking and execution triggers
 * - Handle unpivot detection
 * - Check sheet render cache before executing queries
 * 
 * Query building is delegated to useQueryBuilder.
 * Query execution is delegated to useQueryExecutor.
 */

import { useRef, useEffect } from 'react';
import { useVisualizationContext } from '../../../../contexts/VisualizationContext';
import { useSheetContext } from '../../../../contexts/SheetContext';
import { QueryDescription, Field, OptimizationHints, VirtualTableDefinition, VirtualColumnDefinition, QueryOptimizationSettings } from '../../../../types';
import { useConnection } from '../../../../contexts/ConnectionContext';
import { requiresUnpivoting } from '../../../../queryBuilder/syntheticQueryBuilder';
import { useDataSource } from '../../../../contexts/DataSourceContext';
import { getMeasureFieldsForUnpivot } from '../../../../utils/syntheticFields';
import { duckdbService } from '../../../../services/duckdbService';
import { QueryDecision } from '../../../../services/queryDecisionEngine';
import { useQueryBuilder } from './useQueryBuilder';
import { useQueryExecutor } from './useQueryExecutor';
import { sheetRenderCacheStore } from '../../../../stores';
import { computeFullConfigHash } from '../../../../utils/sheetConfigHash';

export interface UseQueryExecutionProps {
  selectedTable: string | null;
  selectedDatabase: string | null;
  xAxisFields: Field[];
  yAxisFields: Field[];
  colorField: Field | null;
  sizeField?: Field | null;
  shapeField?: Field | null;
  facetBackgroundField?: Field | null;
  filterConfigurations: Record<string, any>;
  labelFields?: Field[];
  tooltipFields?: Field[];
  virtualTable?: VirtualTableDefinition | null;
  virtualColumns?: VirtualColumnDefinition[];
  additionalColorFields?: Field[];
  additionalSizeFields?: Field[];
  additionalLabelFields?: Field[];
  optimizationSettings?: QueryOptimizationSettings;
}

export interface UseQueryExecutionReturn {
  queryDescription: QueryDescription | null;
  optimizationHints: OptimizationHints | null;
  /** Last query decision from the decision engine */
  lastQueryDecision: QueryDecision | null;
}

/**
 * Initialize DuckDB WASM service.
 * Extracted as a simple effect to keep the main hook clean.
 */
function useDuckDBInit(): void {
  useEffect(() => {
    const initDuckDB = async () => {
      if (!duckdbService.isReady && !duckdbService.isInitializing) {
        try {
          console.log('🦆 Initializing DuckDB WASM for local data caching...');
          await duckdbService.initialize();
          console.log('✅ DuckDB WASM ready for local caching');
        } catch (error) {
          console.warn('⚠️ DuckDB WASM initialization failed, local caching disabled:', error);
        }
      }
    };
    initDuckDB();
  }, []);
}

/**
 * Main query execution hook - coordinates building and executing queries.
 */
export const useQueryExecution = ({
  selectedTable,
  selectedDatabase,
  xAxisFields,
  yAxisFields,
  colorField,
  sizeField = null,
  shapeField = null,
  facetBackgroundField = null,
  filterConfigurations,
  labelFields = [],
  tooltipFields = [],
  virtualTable = null,
  virtualColumns = [],
  additionalColorFields = [],
  additionalSizeFields = [],
  additionalLabelFields = [],
  optimizationSettings,
}: UseQueryExecutionProps): UseQueryExecutionReturn => {
  const { connectionDetails } = useConnection();
  const { dataSource } = useDataSource();
  const { state: vizState, dispatch, startOperation, completeOperation } = useVisualizationContext();
  const { activeSheet } = useSheetContext();

  // Track query version for deduplication.
  // Initialize to the CURRENT queryVersion (not null) so that snapshot-restored sheets
  // (which start with queryVersion = N > 0) don't fire immediately on mount before the
  // UNION virtual table is set up.  Explicit increments (FORCE_QUERY_REFRESH,
  // TABLE_JOINS_UNIONS_MODIFIED) will still trigger execution.
  const queryVersion: number = vizState.queryVersion;
  const lastExecutedVersionRef = useRef<number>(queryVersion);
  
  // Track if we restored from cache on mount
  const cacheRestoredRef = useRef(false);
  const mountCheckedRef = useRef(false);

  // Initialize DuckDB WASM
  useDuckDBInit();

  // Check for cached data on mount (before first query)
  useEffect(() => {
    if (mountCheckedRef.current) return;
    mountCheckedRef.current = true;
    
    const sheetId = activeSheet?.id;
    if (!sheetId) return;
    
    // Compute config hash for current state
    const configHash = computeFullConfigHash({
      xAxisFields,
      yAxisFields,
      appliedFilterConfigurations: vizState.appliedFilterConfigurations,
      colorField,
      sizeField,
      shapeField,
      labelFields,
      tooltipFields,
      // Note: We only check query-affecting config for cache validation
    });
    
    const cached = sheetRenderCacheStore.getCache(sheetId, configHash);
    
    if (cached) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[useQueryExecution] 🎯 Cache hit on mount! Restoring queryResult', {
          sheetId,
          rowCount: cached.queryResult.rows?.length ?? 0,
        });
      }
      
      // Mark that we restored from cache
      cacheRestoredRef.current = true;
      
      // Restore the cached query result
      dispatch({ type: 'RESTORE_CACHED_QUERY_RESULT', payload: cached.queryResult });
      
      // Set last executed version to current to prevent immediate re-query
      lastExecutedVersionRef.current = queryVersion;
    } else {
      if (process.env.NODE_ENV === 'development') {
        console.log('[useQueryExecution] Cache miss on mount - will execute query');
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Build query description and optimization hints
  const { queryDescription, optimizationHints } = useQueryBuilder({
    selectedTable,
    selectedDatabase,
    xAxisFields,
    yAxisFields,
    colorField,
    sizeField,
    shapeField,
    facetBackgroundField,
    filterConfigurations,
    labelFields,
    tooltipFields,
    virtualTable,
    virtualColumns,
    additionalColorFields,
    additionalSizeFields,
    additionalLabelFields,
    connectionType: connectionDetails?.type,
    optimizationSettings,
    globalChartType: vizState.globalChartType ?? undefined,
  });

  // Get query executor
  const { executeQuery, lastQueryDecision, queryInProgressRef } = useQueryExecutor({
    selectedTable,
    selectedDatabase,
    xAxisFields,
    yAxisFields,
    colorField,
    sizeField,
    shapeField,
    filterConfigurations,
    appliedFilterConfigurations: vizState.appliedFilterConfigurations,
    labelFields,
    tooltipFields,
    virtualTable,
    virtualColumns,
    availableFields: dataSource.availableFields,
    measureGroupMeasures: vizState.measureGroupFields.map(field => field.columnName),
    optimizationHints,
    optimizationSettings,
    dispatch,
    startOperation,
    completeOperation,
  });

  // Effect to handle query execution when version changes
  useEffect(() => {
    if (queryInProgressRef.current) return;

    // Check if unpivoting is required
    const needsUnpivot = requiresUnpivoting([...xAxisFields, ...yAxisFields]);

    // For unpivot queries, we don't need queryDescription
    if (!needsUnpivot && !queryDescription) {
      dispatch({ type: 'SET_QUERY_RESULT', payload: null });
      dispatch({ type: 'SET_QUERY_ERROR', payload: null });
      return;
    }

    // Only execute when queryVersion advances
    const previousVersion = lastExecutedVersionRef.current;
    if (previousVersion === queryVersion) {
      return;
    }
    // Update ref BEFORE async call to prevent double execution in Strict Mode
    lastExecutedVersionRef.current = queryVersion;

    if (needsUnpivot) {
      const sourceMeasures = getMeasureFieldsForUnpivot(
        dataSource.availableFields,
        vizState.measureGroupFields.map(field => field.columnName)
      );
      dispatch({ type: 'SET_MEASURE_VALUES_SOURCE_FIELDS', payload: sourceMeasures });

      // Execute unpivot query
      executeQuery(null as any, true);
    } else {
      // Clear source measures when not using unpivot
      dispatch({ type: 'SET_MEASURE_VALUES_SOURCE_FIELDS', payload: [] });

      if (queryDescription) {
        executeQuery(queryDescription, false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryVersion, connectionDetails, queryDescription, xAxisFields, yAxisFields]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Don't abort queries - let them complete to avoid concurrent query issues
      queryInProgressRef.current = false;
    };
  }, [queryInProgressRef]);

  return {
    queryDescription,
    optimizationHints,
    lastQueryDecision,
  };
};
