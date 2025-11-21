import { useCallback, useRef, useEffect, useMemo } from 'react';
import { apiService } from '../../../../apiService';
import { useVisualizationContext } from '../../../../contexts/VisualizationContext';
import { buildQuery } from '../../../../queryBuilder/queryBuilder';
import { QueryDescription, Field, OptimizationHints, VirtualTableDefinition } from '../../../../types';
import { useConnection } from '../../../../contexts/ConnectionContext';
import { logOperationTiming } from '../utils';
import { validateAndCleanData, remapCastExpressionColumns } from '../utils/dataValidation';
import { generateOptimizationHintsFromFields } from '../../../../services/optimizationHintGenerator';
import { requiresUnpivoting, buildUnpivotedQuery } from '../../../../queryBuilder/syntheticQueryBuilder';
import { useDataSource } from '../../../../contexts/DataSourceContext';

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
          virtualTable,
          virtualColumns,
          signal: queryAbortControllerRef.current.signal,
        });
      } else {
        // Execute normal query
        result = await apiService.executeQuery(queryDesc, queryAbortControllerRef.current.signal);
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
      return null;
    }

    try {
      const hints = generateOptimizationHintsFromFields({
        xAxisFields,
        yAxisFields,
        colorField,
        sizeField,
        userPreference: 'auto', // Could be made configurable via user settings
      });
      
      return hints;
    } catch (error) {
      console.warn('Failed to generate optimization hints:', error);
      return null;
    }
  }, [xAxisFields, yAxisFields, colorField, sizeField]);

  // Memoize current query description to avoid unnecessary recalculations
  const currentQueryDescription = useMemo((): QueryDescription | null => {
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
        sizeField: sizeField?.columnName
      });
    }

    // Include optimization hints in the query description
    if (queryDesc && optimizationHints) {
      queryDesc.optimization_hints = optimizationHints;
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
      // Execute unpivot query
      executeQuery(null as any, true);
    } else if (currentQueryDescription) {
      // Execute normal query
      executeQuery(currentQueryDescription, false);
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
  };
}; 