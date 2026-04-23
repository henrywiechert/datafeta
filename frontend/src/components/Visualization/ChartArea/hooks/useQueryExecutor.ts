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
import { QueryDescription, Field, OptimizationHints, VirtualTableDefinition, VirtualColumnDefinition, QueryOptimizationSettings, DistributionVariant } from '../../../../types';
import { logOperationTiming } from '../utils';
import { validateAndCleanData, remapCastExpressionColumns } from '../utils/dataValidation';
import { duckdbService } from '../../../../services/duckdbService';
import { queryDecisionEngine, QueryDecision } from '../../../../services/queryDecisionEngine';
import { filterTierManager } from '../../../../services/filterTierManager';
import { queryExecutionOrchestrator } from '../../../../services/queryExecutionOrchestrator';
import {
  classifyChartType,
  computePointBudget,
} from '../../../../services/chartTypeClassifier';
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
        let samplingBudget: { maxPoints: number; shouldAttachBudget: boolean; lineBudgetMaxRows?: number } | null = null;

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

          // Classify chart type and compute point budget
          const classification = classifyChartType(queryDesc, colorField, distributionVariant);
          const pointBudget = computePointBudget(classification, queryDesc, colorField, optimizationSettings);

          // Apply point budget to query if needed
          // Only attach result_budget when maxPoints is finite (Infinity means no backend sampling needed)
          const shouldAttachBudget = classification.isPointChart && 
            pointBudget.maxPoints !== Infinity && 
            Number.isFinite(pointBudget.maxPoints);

          // For line charts, also send a result_budget so the backend limits pre-aggregated results.
          // This covers the forceRemote path and the pre_aggregated strategy (large tables).
          const shouldAttachLineBudget = classification.isLineChart &&
            !classification.isScatter &&
            pointBudget.lineBudgetMaxRows != null &&
            Number.isFinite(pointBudget.lineBudgetMaxRows);
          
          const queryDescExec: QueryDescription = shouldAttachBudget
            ? ({
                ...queryDesc,
                result_budget: {
                  max_rows: pointBudget.maxPoints,
                  strategy: pointBudget.strategy,
                  stratify_field: pointBudget.stratifyField,
                  min_per_stratum: pointBudget.minPerStratum,
                  preserve_fields: pointBudget.preserveFields,
                },
              } as QueryDescription)
            : shouldAttachLineBudget
              ? ({
                  ...queryDesc,
                  result_budget: {
                    max_rows: pointBudget.lineBudgetMaxRows!,
                    // Preserve extremes for continuous dims (stable axis scales), else plain random
                    strategy: (pointBudget.continuousFields?.length ?? 0) > 0 ? 'preserve_extremes' : 'random',
                    preserve_fields: pointBudget.continuousFields?.length ? pointBudget.continuousFields : undefined,
                  },
                } as QueryDescription)
              : queryDesc;

          samplingBudget = {
            maxPoints: pointBudget.maxPoints,
            shouldAttachBudget,
            lineBudgetMaxRows: pointBudget.lineBudgetMaxRows,
          };

          const isSpecializedQueryMode = Boolean(
            queryDescExec.query_mode && queryDescExec.query_mode !== 'standard'
          );

          // Columns required for local caching/execution
          const requiredColumns: string[] = [
            ...(queryDescExec.dimensions?.map(d => d.field) || []),
            ...(queryDescExec.measures?.map(m => m.field) || []),
          ];

          // Determine if we have aggregations
          const requiresAggregation =
            (queryDescExec.measures?.length ?? 0) > 0 &&
            queryDescExec.measures!.some(m => m.aggregation);

          // Get dimensions for potential pre-aggregation
          const dimensions = queryDescExec.dimensions?.map(d => d.field) || [];

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
          // Build fields list for remapping
          const allFieldsForRemapping = [...xAxisFields, ...yAxisFields];
          if (colorField) allFieldsForRemapping.push(colorField);
          if (sizeField) allFieldsForRemapping.push(sizeField);

          console.log('📊 Query result:', {
            columns: result.columns?.map((c: any) => c.name || c),
            firstRow: result.rows?.[0],
            allFields: allFieldsForRemapping.map((f: any) => ({
              columnName: f.columnName,
              type: f.type,
              aggregation: f.aggregation,
              castType: f.castType,
              castReplacement: f.castReplacement,
            })),
          });

          // Remap and clean the result
          const remappedResult = remapCastExpressionColumns(result, allFieldsForRemapping);
          const cleanedResult = validateAndCleanData(remappedResult);

          if (samplingBudget) {
            const { maxPoints, shouldAttachBudget: budgetAttached, lineBudgetMaxRows } = samplingBudget;
            // Treat an attached result budget as "sampled/budgeted" for the UI badge.
            // For stratified/preserve-extremes queries the returned row count can be
            // below the nominal cap even when sampling was definitely applied, so a
            // simple row_count >= limit check misses real capped-result cases.
            if (budgetAttached && Number.isFinite(maxPoints)) {
              cleanedResult.sampled = { limit: maxPoints, type: 'point' };
            } else if (lineBudgetMaxRows && Number.isFinite(lineBudgetMaxRows)) {
              cleanedResult.sampled = { limit: lineBudgetMaxRows, type: 'line' };
            }
          }

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
    ]
  );

  return {
    executeQuery,
    lastQueryDecision: lastQueryDecisionRef.current,
    isExecuting: queryInProgressRef.current,
    queryInProgressRef,
  };
};

