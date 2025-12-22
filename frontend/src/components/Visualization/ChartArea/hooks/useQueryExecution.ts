import { useCallback, useRef, useEffect, useMemo } from 'react';
import { apiService } from '../../../../apiService';
import { useVisualizationContext } from '../../../../contexts/VisualizationContext';
import { buildQuery } from '../../../../queryBuilder/queryBuilder';
import { buildRawQuery } from '../../../../queryBuilder/queryBuilder';
import { QueryDescription, Field, OptimizationHints, VirtualTableDefinition } from '../../../../types';
import { useConnection } from '../../../../contexts/ConnectionContext';
import { logOperationTiming } from '../utils';
import { validateAndCleanData, remapCastExpressionColumns } from '../utils/dataValidation';
import { generateOptimizationHintsFromFields } from '../../../../services/optimizationHintGenerator';
import { requiresUnpivoting, buildUnpivotedQuery } from '../../../../queryBuilder/syntheticQueryBuilder';
import { useDataSource } from '../../../../contexts/DataSourceContext';
import { getMeasureFieldsForUnpivot, MEASURE_NAMES_FIELD } from '../../../../utils/syntheticFields';
import { duckdbService } from '../../../../services/duckdbService';
import { columnCacheManager } from '../../../../services/columnCacheManager';
import { queryDecisionEngine, QueryDecision } from '../../../../services/queryDecisionEngine';
import { filterTierManager } from '../../../../services/filterTierManager';
import { getResultColumnName } from '../../../../utils/fieldUtils';

interface UseQueryExecutionProps {
  selectedTable: string | null;
  selectedDatabase: string | null;
  xAxisFields: any[];
  yAxisFields: any[];
  colorField: Field | null;
  sizeField?: Field | null;
  filterConfigurations: Record<string, any>;
  labelFields?: Field[];
  tooltipFields?: Field[];
  virtualTable?: VirtualTableDefinition | null;
  virtualColumns?: import('../../../../types').VirtualColumnDefinition[];
  additionalColorFields?: Field[];
  additionalSizeFields?: Field[];
  additionalLabelFields?: Field[];
  startOperation: (operationType: 'query' | 'rendering' | 'metadata', canCancel?: boolean) => void;
  completeOperation: (operationType: 'query' | 'rendering' | 'metadata') => void;
  dispatch: (action: any) => void;
}

interface UseQueryExecutionReturn {
  queryDescription: QueryDescription | null;
  optimizationHints: OptimizationHints | null;
  /** Last query decision from the decision engine */
  lastQueryDecision: QueryDecision | null;
}

export const useQueryExecution = ({
  selectedTable,
  selectedDatabase,
  xAxisFields,
  yAxisFields,
  colorField,
  sizeField,
  filterConfigurations,
  labelFields = [],
  tooltipFields = [],
  virtualTable = null,
  virtualColumns = [],
  additionalColorFields = [],
  additionalSizeFields = [],
  additionalLabelFields = [],
  startOperation,
  completeOperation,
  dispatch,
}: UseQueryExecutionProps): UseQueryExecutionReturn => {
  const { connectionDetails } = useConnection();
  const { dataSource } = useDataSource();
  const queryAbortControllerRef = useRef<AbortController | null>(null);
  const queryInProgressRef = useRef<boolean>(false);
  // Track last executed version to avoid duplicate runs within same render cycle
  const lastExecutedVersionRef = useRef<number | null>(null);
  // Track last query decision for debugging and UI display
  const lastQueryDecisionRef = useRef<QueryDecision | null>(null);
  // Access visualization context for queryVersion
  // (Avoid adding heavy dependencies; only pull version)
  // Import lazily to prevent circular issues.
  const { state: vizState } = useVisualizationContext();
  const queryVersion: number = vizState.queryVersion;
  const queryVersionRef = useRef<number>(queryVersion);
  // Log version changes for diagnostics
  useEffect(() => {
    if (queryVersionRef.current !== queryVersion) {
      queryVersionRef.current = queryVersion;
    }
  }, [queryVersion]);

  // Initialize DuckDB WASM on mount
  useEffect(() => {
    const initDuckDB = async () => {
      if (!duckdbService.isReady && !duckdbService.isInitializing) {
        try {
          console.log('🦆 Initializing DuckDB WASM for local data caching...');
          await duckdbService.initialize();
          console.log('✅ DuckDB WASM ready for local caching');
        } catch (error) {
          console.warn('⚠️ DuckDB WASM initialization failed, local caching disabled:', error);
          // Continue without local caching - queries will still work via backend
        }
      }
    };
    initDuckDB();
  }, []);

  // NOTE: Fingerprint removed in favor of monotonic queryVersion which increments only for semantic changes.

  const executeQuery = useCallback(async (queryDesc: QueryDescription, useUnpivot: boolean = false) => {
    const startTime = Date.now();
    
    try {
      // Check and set query in progress atomically
      if (queryInProgressRef.current) {
        return;
      }
      // Mark query as in progress immediately
      queryInProgressRef.current = true;

      // Create new abort controller (don't cancel existing, let it complete)
      queryAbortControllerRef.current = new AbortController();

      // Start query operation
      startOperation('query', true);

      dispatch({ type: 'SET_QUERY_ERROR', payload: null });
      
      let result;
      
      if (useUnpivot) {
        // Execute unpivot query (multiple queries merged)
        result = await buildUnpivotedQuery({
          xFields: xAxisFields,
          yFields: yAxisFields,
          availableFields: dataSource.availableFields,
          selectedTable: selectedTable!,
          selectedDatabase: selectedDatabase || undefined,
          filterConfigurations,
          appliedFilterConfigurations: vizState.appliedFilterConfigurations,
          labelFields,
          tooltipFields,
          colorField,
          sizeField,
          virtualTable,
          virtualColumns,
          optimizationHints,
          signal: queryAbortControllerRef.current.signal,
        });
      } else {
        // Execute normal query - use Query Decision Engine when DuckDB is ready
        console.log('🚀 Executing query with Arrow transport, virtualTable:', queryDesc.virtual_table);
        
        // Determine if this is a scatter-style raw query (continuous on both axes)
        const isScatter = !!queryDesc.dimensions &&
          queryDesc.dimensions.some(d => d.axis === 'x' && d.flavour === 'continuous') &&
          queryDesc.dimensions.some(d => d.axis === 'y' && d.flavour === 'continuous');
        const hasDiscreteColor = !!colorField && colorField.flavour === 'discrete';
        // Conservative budget to prevent Observable Plot failures
        const scatterMaxPoints = hasDiscreteColor ? 50_000 : 100_000;
        const scatterMinPerStratum = hasDiscreteColor ? 200 : 0;

        // If this is scatter, attach a best-effort budget hint for backend/local reduction.
        const queryDescExec: QueryDescription = isScatter ? ({
          ...queryDesc,
          result_budget: {
            max_rows: scatterMaxPoints,
            strategy: hasDiscreteColor ? 'stratified' : 'random',
            stratify_field: hasDiscreteColor && colorField ? getResultColumnName(colorField) : undefined,
            min_per_stratum: scatterMinPerStratum,
          },
        } as any) : queryDesc;

        // Extract required columns from query description
        const requiredColumns: string[] = [
          ...(queryDescExec.dimensions?.map(d => d.field) || []),
          ...(queryDescExec.measures?.map(m => m.field) || []),
        ];
        
        // Determine if we have aggregations
        const requiresAggregation = (queryDescExec.measures?.length ?? 0) > 0 &&
          queryDescExec.measures!.some(m => m.aggregation);
        
        // Get dimensions for potential pre-aggregation
        const dimensions = queryDescExec.dimensions?.map(d => d.field) || [];
        
        try {
          // Use Query Decision Engine if DuckDB is ready
          if (duckdbService.isReady && selectedTable) {
            // Split filters: base define cache slice; refinement applied locally
            const baseFilterConfigs = filterTierManager.getBaseFiltersOnly(filterConfigurations);
            const refinementFilterConfigs = filterTierManager.getRefinementFilters(filterConfigurations);

            // Get query decision
            const decision = await queryDecisionEngine.decide({
              sourceTable: selectedTable,
              sourceDatabase: selectedDatabase || undefined,
              requiredColumns,
              filterConfigurations,
              requiresAggregation,
              dimensions,
              virtualTable: queryDescExec.virtual_table,
              virtualColumns: queryDescExec.virtual_columns,
            });
            
            lastQueryDecisionRef.current = decision;
            // Attach budget info to decision for debugging (if present)
            if ((queryDescExec as any).result_budget) {
              (decision as any).resultBudget = (queryDescExec as any).result_budget;
            }
            console.log('🧠 Query decision:', decision.strategy, '-', decision.reason);
            
            if (decision.strategy === 'cache_hit' && !decision.requiresBackendQuery) {
              // All data is in cache - execute locally
              console.log('📦 Cache hit! Executing query locally...');
              
              const cacheTableName = columnCacheManager.getCacheTableName(
                selectedTable,
                selectedDatabase || undefined,
                decision.baseFilterHash
              );
              
              if (cacheTableName) {
                // Build local query with refinement filters
                const refinementWhere = filterTierManager.buildRefinementWhereClause(refinementFilterConfigs);
                
                // DuckDB can end up with VARCHAR columns when upstream types are ambiguous.
                // For local aggregations, be defensive: strip embedded quote characters and TRY_CAST to DOUBLE.
                const buildNumericExpr = (colName: string) =>
                  `TRY_CAST(REPLACE(CAST("${colName}" AS VARCHAR), '\"', '') AS DOUBLE)`;

                const buildMeasureExpr = (m: any) => {
                  const fn = (m.aggregation || 'sum').toLowerCase();
                  if (fn === 'count') return `COUNT(*) AS "${m.alias}"`;
                  if (fn === 'count_distinct') return `COUNT(DISTINCT "${m.field}") AS "${m.alias}"`;
                  if (fn === 'min') return `MIN(${buildNumericExpr(m.field)}) AS "${m.alias}"`;
                  if (fn === 'max') return `MAX(${buildNumericExpr(m.field)}) AS "${m.alias}"`;
                  if (fn === 'avg') return `AVG(${buildNumericExpr(m.field)}) AS "${m.alias}"`;
                  // default sum
                  return `SUM(${buildNumericExpr(m.field)}) AS "${m.alias}"`;
                };

                // Local query: either raw select (scatter) or local aggregation (grouping changes)
                let localSql = '';
                if (!queryDesc.measures || queryDesc.measures.length === 0) {
                  localSql = `SELECT ${requiredColumns.map(c => `"${c}"`).join(', ')} FROM "${cacheTableName}"`;
                  if (refinementWhere) {
                    localSql += ` WHERE ${refinementWhere}`;
                  }
                } else {
                  const dimCols = (queryDesc.dimensions || []).map(d => d.field);
                  const selectDims = dimCols.map(c => `"${c}"`).join(', ');
                  const selectMeasures = queryDesc.measures.map(buildMeasureExpr).join(', ');
                  localSql = `SELECT ${[selectDims, selectMeasures].filter(Boolean).join(', ')} FROM "${cacheTableName}"`;
                  if (refinementWhere) {
                    localSql += ` WHERE ${refinementWhere}`;
                  }
                  if (dimCols.length > 0) {
                    localSql += ` GROUP BY ${dimCols.map(c => `"${c}"`).join(', ')}`;
                  }
                }
                // Scatter reduction (best-effort) on cache path
                if (isScatter && localSql) {
                  if (hasDiscreteColor && colorField?.columnName) {
                    const strat = colorField.columnName;
                    localSql = `
WITH base AS (
  ${localSql}
),
ranked AS (
  SELECT
    base.*,
    row_number() OVER (PARTITION BY "${strat}" ORDER BY random()) AS rn,
    count(*) OVER (PARTITION BY "${strat}") AS cat_cnt,
    count(*) OVER () AS total_cnt
  FROM base
)
SELECT * FROM ranked
WHERE rn <= greatest(${scatterMinPerStratum}, cast(${scatterMaxPoints} * cat_cnt / total_cnt as integer))
                    `.trim();
                  } else {
                    localSql = `SELECT * FROM (${localSql}) AS base ORDER BY random() LIMIT ${scatterMaxPoints}`;
                  }
                }
                
                const localResult = await duckdbService.query(localSql);
                
                result = {
                  columns: localResult.columns.map(c => ({ name: c, type: 'unknown' })),
                  rows: localResult.rows,
                  row_count: localResult.rows.length,
                  query_sql: localSql,
                  local_query: true, // Mark as local query for debugging
                };
                
                console.log(`✅ Local query returned ${result.row_count} rows`);
              } else {
                // Cache table not found - fall through to backend query
                console.warn('⚠️ Cache table not found, falling back to backend');
                decision.requiresBackendQuery = true;
              }
            }
            
            if (decision.requiresBackendQuery) {
              // Backend query required.
              // If local is allowed (below threshold), fetch a raw slice (base filters only) for caching,
              // then compute aggregation locally when needed.

              let backendQueryDesc: QueryDescription = queryDescExec;
              if (decision.strategy === 'raw_columns') {
                // Build a raw slice query that preserves duplicates and disables backend optimizations.
                const rawFields = [
                  ...(xAxisFields || []),
                  ...(yAxisFields || []),
                  ...(colorField ? [colorField] : []),
                  ...(sizeField ? [sizeField] : []),
                  ...(labelFields || []),
                  ...(tooltipFields || []),
                ].map((f: any) => ({ ...f, aggregation: undefined }));

                const rawSlice = buildRawQuery({
                  fields: rawFields as any,
                  selectedTable: selectedTable!,
                  selectedDatabase: selectedDatabase || undefined,
                  filterConfigurations: baseFilterConfigs as any,
                  labelFields,
                  tooltipFields,
                  virtualTable: virtualTable,
                  virtualColumns: virtualColumns,
                }) as any;

                if (rawSlice) {
                  rawSlice.force_raw_rows = true;
                  backendQueryDesc = rawSlice;
                }
              }

              const arrowResult = await apiService.executeQueryArrowRaw(backendQueryDesc, queryAbortControllerRef.current.signal);
              
              // Cache only when we are building/refreshing a local raw slice (below threshold).
              // For remote-preferred strategies we avoid caching to prevent huge local tables.
              if (decision.strategy === 'raw_columns' && arrowResult.arrowTable && arrowResult.arrowTable.numRows > 0) {
                try {
                  await columnCacheManager.cacheColumns(
                    selectedTable,
                    selectedDatabase || undefined,
                    decision.baseFilterHash,
                    arrowResult.arrowTable
                  );
                  
                  // Update base filters after successful cache
                  filterTierManager.updateBaseFilters(filterConfigurations, selectedTable, selectedDatabase || undefined);
                  
                  console.log(`📦 Cached ${arrowResult.arrowTable.numRows} rows (strategy: ${decision.strategy})`);
                } catch (cacheError) {
                  console.warn('⚠️ Failed to cache in DuckDB:', cacheError);
                }
              }
              
              // If the current view needs aggregation and we fetched a raw slice, compute locally.
              if (decision.strategy === 'raw_columns' && requiresAggregation) {
                const cacheTableName = columnCacheManager.getCacheTableName(
                  selectedTable,
                  selectedDatabase || undefined,
                  decision.baseFilterHash
                );
                if (cacheTableName) {
                  const refinementWhere = filterTierManager.buildRefinementWhereClause(refinementFilterConfigs);
                  const dimCols = (queryDesc.dimensions || []).map(d => d.field);
                  const selectDims = dimCols.map(c => `"${c}"`).join(', ');
                  // Same defensive numeric casting as cache-hit path
                  const buildNumericExpr = (colName: string) =>
                    `TRY_CAST(REPLACE(CAST("${colName}" AS VARCHAR), '\"', '') AS DOUBLE)`;
                  const selectMeasures = (queryDesc.measures || []).map(m => {
                    const fn = (m.aggregation || 'sum').toLowerCase();
                    if (fn === 'count') return `COUNT(*) AS "${m.alias}"`;
                    if (fn === 'count_distinct') return `COUNT(DISTINCT "${m.field}") AS "${m.alias}"`;
                    if (fn === 'min') return `MIN(${buildNumericExpr(m.field)}) AS "${m.alias}"`;
                    if (fn === 'max') return `MAX(${buildNumericExpr(m.field)}) AS "${m.alias}"`;
                    if (fn === 'avg') return `AVG(${buildNumericExpr(m.field)}) AS "${m.alias}"`;
                    return `SUM(${buildNumericExpr(m.field)}) AS "${m.alias}"`;
                  }).join(', ');
                  let localAggSql = `SELECT ${[selectDims, selectMeasures].filter(Boolean).join(', ')} FROM "${cacheTableName}"`;
                  if (refinementWhere) localAggSql += ` WHERE ${refinementWhere}`;
                  if (dimCols.length > 0) localAggSql += ` GROUP BY ${dimCols.map(c => `"${c}"`).join(', ')}`;
                  const localAgg = await duckdbService.query(localAggSql);
                  result = {
                    columns: localAgg.columns.map(c => ({ name: c, type: 'unknown' })),
                    rows: localAgg.rows,
                    row_count: localAgg.rows.length,
                    query_sql: localAggSql,
                    local_query: true,
                  };
                }
              }

              // Otherwise convert Arrow table to standard result format
              const convertValue = (value: any): any => {
                if (typeof value === 'bigint') {
                  return Number.isSafeInteger(Number(value)) ? Number(value) : value.toString();
                }
                return value;
              };
              
              if (!result) {
                const columns = arrowResult.columns;
                const rows: Record<string, any>[] = [];
                for (let i = 0; i < arrowResult.arrowTable.numRows; i++) {
                  const row: Record<string, any> = {};
                  for (const col of arrowResult.arrowTable.schema.fields) {
                    row[col.name] = convertValue(arrowResult.arrowTable.getChild(col.name)?.get(i));
                  }
                  rows.push(row);
                }
                
                result = {
                  columns,
                  rows,
                  row_count: arrowResult.rowCount,
                  query_sql: arrowResult.querySql,
                };
              }
            }
          } else {
            // DuckDB not ready - use standard Arrow endpoint
            result = await apiService.executeQueryArrow(queryDescExec, queryAbortControllerRef.current.signal);
          }
        } catch (arrowError: any) {
          // Fallback to JSON if Arrow endpoint fails (e.g., older backend)
          console.warn('⚠️ Arrow transport failed, falling back to JSON:', arrowError.message);
          result = await apiService.executeQuery(queryDescExec, queryAbortControllerRef.current.signal);
        }
      }
      
      // Ensure result is defined before proceeding
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
            castReplacement: f.castReplacement
          }))
        });
        
        // First, remap any CAST expression columns back to their expected aliases
        let remappedResult = remapCastExpressionColumns(result, allFieldsForRemapping);
        // Then clean and validate the data
        const cleanedResult = validateAndCleanData(remappedResult);
        dispatch({ type: 'SET_QUERY_RESULT', payload: cleanedResult });
        
        // Warn if data was too large
        if (result.row_count > 50000) {
          console.warn(`⚠️ Large dataset detected (${result.row_count} rows). Consider using aggregation or filtering.`);
        }
      }
      
      // Mark query as complete
      queryInProgressRef.current = false;
      completeOperation('query');
    } catch (error: any) {
      if (error.message === 'Request was cancelled') {
        // Operation was cancelled, don't set error
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
  }, [startOperation, completeOperation, dispatch, colorField, sizeField, xAxisFields, yAxisFields, dataSource.availableFields, filterConfigurations, vizState.appliedFilterConfigurations, labelFields, tooltipFields, virtualTable, virtualColumns, selectedTable, selectedDatabase]);

  // Memoize optimization hints generation
  const optimizationHints = useMemo((): OptimizationHints | null => {
    // Generate hints if we have fields
    if (xAxisFields.length === 0 && yAxisFields.length === 0) {
      console.log('⚠️ No fields present, skipping optimization hints generation');
      return null;
    }

    try {
      console.log('🔧 Generating optimization hints for fields:', {
        xFields: xAxisFields.map(f => ({ name: f.columnName, type: f.type, flavour: f.flavour })),
        yFields: yAxisFields.map(f => ({ name: f.columnName, type: f.type, flavour: f.flavour })),
        color: colorField?.columnName,
        size: sizeField?.columnName
      });
      
      const hints = generateOptimizationHintsFromFields({
        xAxisFields,
        yAxisFields,
        colorField,
        sizeField,
        userPreference: 'auto', // Could be made configurable via user settings
      });
      
      console.log('✅ Generated hints:', {
        field_hints: hints.field_hints?.length || 0,
        enable_global_distinct: hints.enable_global_distinct,
        level: hints.optimization_level
      });
      
      return hints;
    } catch (error) {
      console.error('❌ Failed to generate optimization hints:', error);
      return null;
    }
  }, [xAxisFields, yAxisFields, colorField, sizeField]);

  // Memoize current query description to avoid unnecessary recalculations
  const currentQueryDescription = useMemo((): QueryDescription | null => {
    console.log('🔧 currentQueryDescription recalculating with virtualTable:', virtualTable);
    
    // Tag fields with their axis for query optimization
    const taggedXFields = xAxisFields.map(f => ({ ...f, axis: 'x' as const }));
    const taggedYFields = yAxisFields.map(f => ({ ...f, axis: 'y' as const }));
  const allFields = [...taggedXFields, ...taggedYFields];
    
    // Include colorField whether dimension or measure so its column is selected.
    // If it's a measure without aggregation but other aggregated measures exist, assign a default aggregation.
    if (colorField) {
      const colorEntry = (colorField.type === 'measure' && !colorField.aggregation && [...xAxisFields, ...yAxisFields].some(f => f.type === 'measure' && f.aggregation))
        ? { ...colorField, aggregation: 'sum' }
        : colorField;
      allFields.push(colorEntry);
    }
    // Include sizeField when present and it's a dimension or measure so its column appears in the result
    if (sizeField) {
      const sizeEntry = (sizeField.type === 'measure' && !sizeField.aggregation && [...xAxisFields, ...yAxisFields].some(f => f.type === 'measure' && f.aggregation))
        ? { ...sizeField, aggregation: 'sum' }
        : sizeField;
      allFields.push(sizeEntry);
    }
    
    // Include additional color/size fields from per-field overrides
    for (const addlColorField of additionalColorFields) {
      if (!allFields.some(f => f.id === addlColorField.id)) {
        const colorEntry = (addlColorField.type === 'measure' && !addlColorField.aggregation && [...xAxisFields, ...yAxisFields].some(f => f.type === 'measure' && f.aggregation))
          ? { ...addlColorField, aggregation: 'sum' }
          : addlColorField;
        allFields.push(colorEntry);
      }
    }
    for (const addlSizeField of additionalSizeFields) {
      if (!allFields.some(f => f.id === addlSizeField.id)) {
        const sizeEntry = (addlSizeField.type === 'measure' && !addlSizeField.aggregation && [...xAxisFields, ...yAxisFields].some(f => f.type === 'measure' && f.aggregation))
          ? { ...addlSizeField, aggregation: 'sum' }
          : addlSizeField;
        allFields.push(sizeEntry);
      }
    }
    for (const addlLabelField of additionalLabelFields) {
      if (!allFields.some(f => f.id === addlLabelField.id)) {
        const labelEntry = (addlLabelField.type === 'measure' && !addlLabelField.aggregation && [...xAxisFields, ...yAxisFields].some(f => f.type === 'measure' && f.aggregation))
          ? { ...addlLabelField, aggregation: 'sum' }
          : addlLabelField;
        allFields.push(labelEntry);
      }
    }
    
    // Merge label fields (without axis tagging) so query builder can include them via label_fields
  const mergedFields = [...allFields];
    for (const lf of labelFields) {
      if (!mergedFields.some(f => f.columnName === lf.columnName && f.dateTimePart === lf.dateTimePart && f.dateTimeMode === lf.dateTimeMode)) {
        mergedFields.push(lf);
      }
    }

    if (mergedFields.length === 0 || !selectedTable) {
      return null;
    }
    
    // For ClickHouse, database is required; for CSV, it's not
    if (connectionDetails?.type === 'clickhouse' && !selectedDatabase) {
      return null;
    }
    
    const queryDesc = buildQuery({
      fields: mergedFields,
      selectedTable,
      selectedDatabase: selectedDatabase || undefined,
      filterConfigurations,
      labelFields,
      tooltipFields,
      virtualTable,
      virtualColumns,
    });

    if (queryDesc) {
      // Minimal build log (safe to remove later)
      console.log('🧪 Query build (memo):', {
        dimensions: queryDesc.dimensions?.map(d => d.field),
        measures: queryDesc.measures?.map(m => m.alias || m.field),
        label_fields: (queryDesc as any).label_fields,
        colorField: colorField?.columnName,
        sizeField: sizeField?.columnName,
        virtualTable: virtualTable ? {
          mode: virtualTable.mode,
          unionTables: virtualTable.union_tables?.length || 0,
          joinedTables: virtualTable.joined_tables?.length || 0
        } : null
      });
    }

    // Include optimization hints in the query description
    if (queryDesc && optimizationHints) {
      queryDesc.optimization_hints = optimizationHints;
      console.log('✅ Attached optimization hints to query:', {
        field_hints_count: optimizationHints.field_hints?.length || 0,
        enable_global_distinct: optimizationHints.enable_global_distinct,
        optimization_level: optimizationHints.optimization_level
      });
    } else if (queryDesc && !optimizationHints) {
      console.log('⚠️ No optimization hints generated for this query');
    }

    return queryDesc;
  }, [selectedTable, selectedDatabase, xAxisFields, yAxisFields, colorField, sizeField, filterConfigurations, labelFields, tooltipFields, optimizationHints, virtualTable, virtualColumns, additionalColorFields, additionalSizeFields, additionalLabelFields, connectionDetails?.type]);

  // Effect to handle query execution when fields change
  useEffect(() => {
    if (queryInProgressRef.current) return;
    
    // Check if unpivoting is required
    const needsUnpivot = requiresUnpivoting([...xAxisFields, ...yAxisFields]);
    
    // For unpivot queries, we don't need currentQueryDescription
    if (!needsUnpivot && !currentQueryDescription) {
      dispatch({ type: 'SET_QUERY_RESULT', payload: null });
      dispatch({ type: 'SET_QUERY_ERROR', payload: null });
      return;
    }
    
    // Only execute when queryVersion advances
    // Capture and update ref synchronously to prevent race condition in Strict Mode
    const previousVersion = lastExecutedVersionRef.current;
    if (previousVersion === queryVersion) {
      return; // version unchanged -> skip
    }
    // Update ref BEFORE async call to prevent double execution in Strict Mode
    lastExecutedVersionRef.current = queryVersion;
    
    if (needsUnpivot) {
      // Compute source measures (respecting MeasureNames filter if present)
      const measureNamesFilterEntry = Object.entries(vizState.appliedFilterConfigurations).find(
        ([, config]) => config.columnName === MEASURE_NAMES_FIELD
      );
      const measureNamesFilterValues = measureNamesFilterEntry && measureNamesFilterEntry[1].type === 'discrete'
        ? (measureNamesFilterEntry[1] as any).selectedValues as string[]
        : undefined;
      
      const sourceMeasures = getMeasureFieldsForUnpivot(
        dataSource.availableFields,
        measureNamesFilterValues
      );
      dispatch({ type: 'SET_MEASURE_VALUES_SOURCE_FIELDS', payload: sourceMeasures });
      
      // Execute unpivot query
      executeQuery(null as any, true);
    } else {
      // Clear source measures when not using unpivot
      dispatch({ type: 'SET_MEASURE_VALUES_SOURCE_FIELDS', payload: [] });
      
      if (currentQueryDescription) {
        // Execute normal query
        executeQuery(currentQueryDescription, false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryVersion, connectionDetails, currentQueryDescription, xAxisFields, yAxisFields]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Don't abort queries - let them complete to avoid concurrent query issues with ClickHouse
      // ClickHouse doesn't handle aborted queries well in a single session
      // Just reset the in-progress flag
      queryInProgressRef.current = false;
    };
  }, []);

  return {
    queryDescription: currentQueryDescription,
    optimizationHints,
    lastQueryDecision: lastQueryDecisionRef.current,
  };
}; 