/**
 * useQueryExecutor Hook
 * 
 * Responsible for executing queries, including:
 * - Point budget computation
 * - Filter tier splitting
 * - Raw slice query building
 * - Orchestrator invocation
 * - Result validation and dispatch
 * - Error handling
 * 
 * Extracted from useQueryExecution for separation of concerns.
 */

import { useCallback, useEffect, useRef } from 'react';
import { apiService } from '../../../../apiService';
import { buildRawQuery } from '../../../../queryBuilder/queryBuilder';
import { buildUnpivotedQuery } from '../../../../queryBuilder/syntheticQueryBuilder';
import { QueryDescription, Field, OptimizationHints, VirtualTableDefinition, VirtualColumnDefinition, QueryOptimizationSettings, DistributionVariant, UserChartType } from '../../../../types';
import { logOperationTiming } from '../utils';
import { duckdbService } from '../../../../services/duckdbService';
import { queryDecisionEngine, QueryDecision } from '../../../../services/queryDecisionEngine';
import { filterTierManager } from '../../../../services/filterTierManager';
import { queryExecutionOrchestrator } from '../../../../services/queryExecutionOrchestrator';
import {
  buildFieldsForResultRemapping,
  getQueryDimensions,
  getRequiredColumns,
  postProcessQueryResult,
  prepareBudgetedQuery,
  queryRequiresAggregation,
  SamplingBudget,
} from './queryExecutorPlan';
import { createQueryAffectingConfig, createRawQueryFieldsForCache } from '../../../../utils/queryAffectingConfig';

export interface UseQueryExecutorProps {
  selectedTable: string | null;
  selectedDatabase: string | null;
  xAxisFields: Field[];
  yAxisFields: Field[];
  colorField: Field | null;
  sizeField: Field | null;
  shapeField?: Field | null;
  facetBackgroundField?: Field | null;
  filterConfigurations: Record<string, any>;
  appliedFilterConfigurations: Record<string, any>;
  labelFields: Field[];
  tooltipFields: Field[];
  virtualTable: VirtualTableDefinition | null;
  virtualColumns: VirtualColumnDefinition[];
  availableFields: Field[];
  measureGroupMeasures?: string[];
  optimizationHints: OptimizationHints | null;
  optimizationSettings?: QueryOptimizationSettings;
  distributionVariant?: DistributionVariant;
  globalChartType?: UserChartType | null;
  dispatch: (action: any) => void;
  startOperation: (operationType: 'query' | 'rendering' | 'metadata', canCancel?: boolean) => void;
  completeOperation: (operationType: 'query' | 'rendering' | 'metadata') => void;
}

export interface UseQueryExecutorReturn {
  /** Execute a query with the given description */
  executeQuery: (queryDesc: QueryDescription, useUnpivot?: boolean) => Promise<void>;
  /** Last query decision from the decision engine */
  lastQueryDecision: QueryDecision | null;
  /** Whether a query is currently in progress */
  isExecuting: boolean;
  /** Reference to check if a query is in progress (for external coordination) */
  queryInProgressRef: React.MutableRefObject<boolean>;
}

/**
 * Hook to execute queries with full orchestration support.
 */
export const useQueryExecutor = ({
  selectedTable,
  selectedDatabase,
  xAxisFields,
  yAxisFields,
  colorField,
  sizeField,
  shapeField = null,
  facetBackgroundField = null,
  filterConfigurations,
  appliedFilterConfigurations,
  labelFields,
  tooltipFields,
  virtualTable,
  virtualColumns,
  availableFields,
  measureGroupMeasures,
  optimizationHints,
  optimizationSettings,
  distributionVariant = 'tick-strip',
  globalChartType,
  dispatch,
  startOperation,
  completeOperation,
}: UseQueryExecutorProps): UseQueryExecutorReturn => {
  const queryAbortControllerRef = useRef<AbortController | null>(null);
  const queryInProgressRef = useRef<boolean>(false);
  const lastQueryDecisionRef = useRef<QueryDecision | null>(null);

  useEffect(() => {
    if (optimizationSettings?.sizeThreshold !== undefined) {
      queryDecisionEngine.setSizeThreshold(optimizationSettings.sizeThreshold);
    }
  }, [optimizationSettings?.sizeThreshold]);

  const executeQuery = useCallback(
    async (queryDesc: QueryDescription, useUnpivot: boolean = false) => {
      const startTime = Date.now();

      try {
        // Check and set query in progress atomically
        if (queryInProgressRef.current) {
          return;
        }
        queryInProgressRef.current = true;

        // Create new abort controller
        queryAbortControllerRef.current = new AbortController();

        // Start query operation
        startOperation('query', true);
        dispatch({ type: 'SET_QUERY_ERROR', payload: null });

        let result;
        let samplingBudget: SamplingBudget | null = null;

        if (useUnpivot) {
          // Execute unpivot query (multiple queries merged)
          result = await buildUnpivotedQuery({
            xFields: xAxisFields,
            yFields: yAxisFields,
            availableFields,
            selectedTable: selectedTable!,
            selectedDatabase: selectedDatabase || undefined,
            filterConfigurations,
            appliedFilterConfigurations,
            labelFields,
            tooltipFields,
            colorField,
            sizeField,
            shapeField,
            virtualTable,
            virtualColumns,
            optimizationHints,
            measureGroupMeasureNames: measureGroupMeasures,
            signal: queryAbortControllerRef.current.signal,
          });
        } else {
          // Execute normal query - use Query Decision Engine when DuckDB is ready
          console.log('🚀 Executing query with Arrow transport, virtualTable:', queryDesc.virtual_table);

          const preparedQuery = prepareBudgetedQuery({
            queryDesc,
            colorField,
            distributionVariant,
            globalChartType,
            optimizationSettings,
          });
          const { classification, pointBudget, queryDescExec, shouldAttachBudget } = preparedQuery;
          samplingBudget = preparedQuery.samplingBudget;

          const isSpecializedQueryMode = Boolean(
            queryDescExec.query_mode && queryDescExec.query_mode !== 'standard'
          );

          // Columns required for local caching/execution
          const requiredColumns = getRequiredColumns(queryDescExec);

          // Determine if we have aggregations
          const requiresAggregation = queryRequiresAggregation(queryDescExec);

          // Get dimensions for potential pre-aggregation
          const dimensions = getQueryDimensions(queryDescExec);

          try {
            if (optimizationSettings?.forceRemote || isSpecializedQueryMode) {
              result = await apiService.executeQueryArrow(queryDescExec, queryAbortControllerRef.current.signal);
              lastQueryDecisionRef.current = {
                strategy: 'pre_aggregated',
                requiresBackendQuery: true,
                reason: optimizationSettings?.forceRemote
                  ? 'Forced remote query (DuckDB cache disabled)'
                  : `Specialized query mode (${queryDescExec.query_mode})`,
              };
              console.log(
                '🧠 Query decision: pre_aggregated -',
                optimizationSettings?.forceRemote
                  ? 'Forced remote query (DuckDB cache disabled)'
                  : `Specialized query mode (${queryDescExec.query_mode})`
              );
            } else {
            // Split filters: base define cache slice; refinement applied locally
            const baseFilterConfigs = filterTierManager.getBaseFiltersOnly(filterConfigurations);
            const refinementFilterConfigs = filterTierManager.getRefinementFilters(filterConfigurations);

            // Build a backend query desc (raw slice) only when needed
            let backendQueryDesc: QueryDescription = queryDescExec;

            if (duckdbService.isReady && selectedTable) {
              const decisionPreview = await queryDecisionEngine.decide({
                sourceTable: selectedTable,
                sourceDatabase: selectedDatabase || undefined,
                requiredColumns,
                filterConfigurations,
                requiresAggregation,
                dimensions,
                virtualTable: queryDescExec.virtual_table,
                virtualColumns: queryDescExec.virtual_columns,
                sizeThreshold: optimizationSettings?.sizeThreshold,
              });

              if (decisionPreview.strategy === 'raw_columns') {
                // Build raw fields for caching - strip aggregations and datetime parts
                const rawFields = createRawQueryFieldsForCache(
                  createQueryAffectingConfig({
                    xAxisFields,
                    yAxisFields,
                    appliedFilterConfigurations,
                    colorField,
                    sizeField,
                    shapeField,
                    facetBackgroundField,
                    labelFields,
                    tooltipFields,
                  })
                );

                const rawSlice = buildRawQuery({
                  fields: rawFields as any,
                  selectedTable: selectedTable!,
                  selectedDatabase: selectedDatabase || undefined,
                  filterConfigurations: baseFilterConfigs as any,
                  labelFields,
                  tooltipFields,
                  virtualTable,
                  virtualColumns,
                }) as any;

                if (rawSlice) {
                  rawSlice.force_raw_rows = true;
                  // Only copy point-chart budget to the raw slice (limits rows fetched+cached).
                  // Line-chart budget must NOT be applied here: we need the full raw data so
                  // the local aggregation is correct; the line budget is applied after aggregation.
                  if ((queryDescExec as any).result_budget && shouldAttachBudget) {
                    (rawSlice as any).result_budget = (queryDescExec as any).result_budget;
                  }
                  backendQueryDesc = rawSlice;
                }
              }
            }

            // Execute via orchestrator
            const { result: orchestratedResult, decision } = await queryExecutionOrchestrator.execute({
              viewQueryDesc: queryDescExec,
              fetchQueryDesc: backendQueryDesc,
              selectedTable: selectedTable!,
              selectedDatabase: selectedDatabase || undefined,
              filterConfigurations,
              requiredColumns,
              requiresAggregation,
              dimensions,
              baseFilterConfigs,
              refinementFilterConfigs,
              pointBudget: {
                isPointChart: classification.isPointChart,
                isScatter: classification.isScatter,
                stratifyField: pointBudget.stratifyField,
                maxPoints: pointBudget.maxPoints,
                minPerStratum: pointBudget.minPerStratum,
                strategy: pointBudget.strategy,
                preserveFields: pointBudget.preserveFields,
                lineBudgetMaxRows: pointBudget.lineBudgetMaxRows,
                continuousFields: pointBudget.continuousFields,
              },
              signal: queryAbortControllerRef.current.signal,
            });

            result = orchestratedResult;

            if (decision) {
              lastQueryDecisionRef.current = decision;
              if ((queryDescExec as any).result_budget) {
                (decision as any).resultBudget = (queryDescExec as any).result_budget;
              }
              console.log('🧠 Query decision:', decision.strategy, '-', decision.reason);
            }
            }
          } catch (orchestratorError: any) {
            // Fallback to backend Arrow endpoint if orchestrator/local execution fails
            console.warn('⚠️ Local execution failed, falling back to backend:', orchestratorError.message);
            result = await apiService.executeQueryArrow(queryDescExec, queryAbortControllerRef.current.signal);
          }
        }

        // Ensure result is defined
        if (!result) {
          throw new Error('Query did not return a result');
        }

        logOperationTiming('Query', startTime, { rows: result.row_count });

        if (result.error) {
          dispatch({ type: 'SET_QUERY_ERROR', payload: result.error });
        } else {
          const fieldsForRemapping = buildFieldsForResultRemapping({
            xAxisFields,
            yAxisFields,
            colorField,
            sizeField,
          });

          console.log('📊 Query result:', {
            columns: result.columns?.map((c: any) => c.name || c),
            firstRow: result.rows?.[0],
            allFields: fieldsForRemapping.map((f: any) => ({
              columnName: f.columnName,
              type: f.type,
              aggregation: f.aggregation,
              castType: f.castType,
              castReplacement: f.castReplacement,
            })),
          });

          const cleanedResult = postProcessQueryResult({
            result,
            fieldsForRemapping,
            samplingBudget,
          });

          dispatch({ type: 'SET_QUERY_RESULT', payload: cleanedResult });

          // Warn if data was too large
          if (result.row_count > 50000) {
            console.warn(
              `⚠️ Large dataset detected (${result.row_count} rows). Consider using aggregation or filtering.`
            );
          }
        }

        // Mark query as complete
        queryInProgressRef.current = false;
        completeOperation('query');
      } catch (error: any) {
        if (error.message === 'Request was cancelled') {
          dispatch({ type: 'SET_QUERY_ERROR', payload: null });
        } else {
          dispatch({
            type: 'SET_QUERY_ERROR',
            payload: error.message || 'An unexpected error occurred.',
          });
        }

        // Mark query as complete even on error
        queryInProgressRef.current = false;
        completeOperation('query');
      }
    },
    [
      startOperation,
      completeOperation,
      dispatch,
      colorField,
      sizeField,
      xAxisFields,
      yAxisFields,
      availableFields,
      measureGroupMeasures,
      filterConfigurations,
      appliedFilterConfigurations,
      labelFields,
      tooltipFields,
      virtualTable,
      virtualColumns,
      selectedTable,
      selectedDatabase,
      optimizationHints,
      optimizationSettings,
      distributionVariant,
      globalChartType,
    ]
  );

  return {
    executeQuery,
    lastQueryDecision: lastQueryDecisionRef.current,
    isExecuting: queryInProgressRef.current,
    queryInProgressRef,
  };
};

