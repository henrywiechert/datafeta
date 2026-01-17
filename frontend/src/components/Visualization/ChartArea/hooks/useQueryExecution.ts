/**
 * useQueryExecution Hook
 * 
 * Thin coordinator that composes query building and execution hooks.
 * Responsibilities:
 * - Initialize DuckDB WASM on mount
 * - Coordinate version tracking and execution triggers
 * - Handle unpivot detection
 * 
 * Query building is delegated to useQueryBuilder.
 * Query execution is delegated to useQueryExecutor.
 */

import { useRef, useEffect } from 'react';
import { useVisualizationContext } from '../../../../contexts/VisualizationContext';
import { QueryDescription, Field, OptimizationHints, VirtualTableDefinition, VirtualColumnDefinition, QueryOptimizationSettings } from '../../../../types';
import { useConnection } from '../../../../contexts/ConnectionContext';
import { requiresUnpivoting } from '../../../../queryBuilder/syntheticQueryBuilder';
import { useDataSource } from '../../../../contexts/DataSourceContext';
import { getMeasureFieldsForUnpivot } from '../../../../utils/syntheticFields';
import { duckdbService } from '../../../../services/duckdbService';
import { QueryDecision } from '../../../../services/queryDecisionEngine';
import { useQueryBuilder } from './useQueryBuilder';
import { useQueryExecutor } from './useQueryExecutor';

export interface UseQueryExecutionProps {
  selectedTable: string | null;
  selectedDatabase: string | null;
  xAxisFields: Field[];
  yAxisFields: Field[];
  colorField: Field | null;
  sizeField?: Field | null;
  filterConfigurations: Record<string, any>;
  labelFields?: Field[];
  tooltipFields?: Field[];
  virtualTable?: VirtualTableDefinition | null;
  virtualColumns?: VirtualColumnDefinition[];
  additionalColorFields?: Field[];
  additionalSizeFields?: Field[];
  additionalLabelFields?: Field[];
  optimizationSettings?: QueryOptimizationSettings;
  startOperation: (operationType: 'query' | 'rendering' | 'metadata', canCancel?: boolean) => void;
  completeOperation: (operationType: 'query' | 'rendering' | 'metadata') => void;
  dispatch: (action: any) => void;
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
  filterConfigurations,
  labelFields = [],
  tooltipFields = [],
  virtualTable = null,
  virtualColumns = [],
  additionalColorFields = [],
  additionalSizeFields = [],
  additionalLabelFields = [],
  optimizationSettings,
  startOperation,
  completeOperation,
  dispatch,
}: UseQueryExecutionProps): UseQueryExecutionReturn => {
  const { connectionDetails } = useConnection();
  const { dataSource } = useDataSource();
  const { state: vizState } = useVisualizationContext();

  // Track query version for deduplication
  const queryVersion: number = vizState.queryVersion;
  const lastExecutedVersionRef = useRef<number | null>(null);

  // Initialize DuckDB WASM
  useDuckDBInit();

  // Build query description and optimization hints
  const { queryDescription, optimizationHints } = useQueryBuilder({
    selectedTable,
    selectedDatabase,
    xAxisFields,
    yAxisFields,
    colorField,
    sizeField,
    filterConfigurations,
    labelFields,
    tooltipFields,
    virtualTable,
    virtualColumns,
    additionalColorFields,
    additionalSizeFields,
    additionalLabelFields,
    connectionType: connectionDetails?.type,
  });

  // Get query executor
  const { executeQuery, lastQueryDecision, queryInProgressRef } = useQueryExecutor({
    selectedTable,
    selectedDatabase,
    xAxisFields,
    yAxisFields,
    colorField,
    sizeField,
    filterConfigurations,
    appliedFilterConfigurations: vizState.appliedFilterConfigurations,
    labelFields,
    tooltipFields,
    virtualTable,
    virtualColumns,
    availableFields: dataSource.availableFields,
    measureGroupMeasures: dataSource.measureGroupFields.map(field => field.columnName),
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
        dataSource.measureGroupFields.map(field => field.columnName)
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
