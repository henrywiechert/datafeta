import { useCallback, useRef, useEffect, useMemo } from 'react';
import { apiService } from '../../../../apiService';
import { buildQuery } from '../../../../queryBuilder/queryBuilder';
import { QueryDescription, Field } from '../../../../types';
import { useConnection } from '../../../../contexts/ConnectionContext';
import { logOperationTiming } from '../utils';
import { validateAndCleanData } from '../utils/dataValidation';

interface UseQueryExecutionProps {
  selectedTable: string | null;
  selectedDatabase: string | null;
  xAxisFields: any[];
  yAxisFields: any[];
  colorField: Field | null;
  sizeField?: Field | null;
  filterConfigurations: Record<string, any>;
  startOperation: (operationType: 'query' | 'rendering' | 'metadata', canCancel?: boolean) => void;
  completeOperation: (operationType: 'query' | 'rendering' | 'metadata') => void;
  dispatch: (action: any) => void;
}

interface UseQueryExecutionReturn {
  queryDescription: QueryDescription | null;
}

export const useQueryExecution = ({
  selectedTable,
  selectedDatabase,
  xAxisFields,
  yAxisFields,
  colorField,
  sizeField,
  filterConfigurations,
  startOperation,
  completeOperation,
  dispatch,
}: UseQueryExecutionProps): UseQueryExecutionReturn => {
  const { connectionDetails } = useConnection();
  const queryAbortControllerRef = useRef<AbortController | null>(null);
  const queryInProgressRef = useRef<boolean>(false);

  const executeQuery = useCallback(async (queryDesc: QueryDescription) => {
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
      
      const result = await apiService.executeQuery(queryDesc, queryAbortControllerRef.current.signal);
      
      logOperationTiming('Query', startTime, { rows: result.row_count });
      
      if (result.error) {
        dispatch({ type: 'SET_QUERY_ERROR', payload: result.error });
      } else {
        const cleanedResult = validateAndCleanData(result);
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
  }, [startOperation, completeOperation, dispatch]);

  // Memoize current query description to avoid unnecessary recalculations
  const currentQueryDescription = useMemo((): QueryDescription | null => {
    // Tag fields with their axis for query optimization
    const taggedXFields = xAxisFields.map(f => ({ ...f, axis: 'x' as const }));
    const taggedYFields = yAxisFields.map(f => ({ ...f, axis: 'y' as const }));
  const allFields = [...taggedXFields, ...taggedYFields];
    
    // Add colorField if it exists and is a dimension (no axis tagging for color)
    if (colorField && colorField.type === 'dimension') {
      allFields.push(colorField);
    }
    // Include sizeField when present and it's a dimension or measure so its column appears in the result
    if (sizeField) {
      // If it's a measure but lacks aggregation while other measures exist, assign a default aggregation (sum)
      if (sizeField.type === 'measure' && !sizeField.aggregation) {
        const hasOtherAggMeasures = [...xAxisFields, ...yAxisFields].some(f => f.type === 'measure' && f.aggregation);
        if (hasOtherAggMeasures) {
          allFields.push({ ...sizeField, aggregation: 'sum' });
        } else {
          allFields.push(sizeField);
        }
      } else {
        allFields.push(sizeField);
      }
    }
    
    if (allFields.length === 0 || !selectedTable || !selectedDatabase) {
      return null;
    }
    
    const queryDesc = buildQuery({
      fields: allFields,
      selectedTable,
      selectedDatabase,
      filterConfigurations,
    });

    return queryDesc;
  }, [selectedTable, selectedDatabase, xAxisFields, yAxisFields, colorField, sizeField, filterConfigurations]);

  // Effect to handle query execution when fields change
  useEffect(() => {
    // Check if query is already in progress at the start of the effect
    if (queryInProgressRef.current) {
      return;
    }
    
    const fetchData = async () => {
      // Tag fields with their axis for query optimization
      const taggedXFields = xAxisFields.map(f => ({ ...f, axis: 'x' as const }));
      const taggedYFields = yAxisFields.map(f => ({ ...f, axis: 'y' as const }));
      const allFields = [...taggedXFields, ...taggedYFields];
      
      // Add colorField if it exists and is a dimension (no axis tagging for color)
      if (colorField && colorField.type === 'dimension') {
        allFields.push(colorField);
      }

      // Include sizeField when present; mirror color logic but allow measures too
      if (sizeField) {
        if (sizeField.type === 'measure' && !sizeField.aggregation) {
          const hasOtherAggMeasures = [...xAxisFields, ...yAxisFields].some(f => f.type === 'measure' && f.aggregation);
            if (hasOtherAggMeasures) {
              allFields.push({ ...sizeField, aggregation: 'sum' });
            } else {
              allFields.push(sizeField);
            }
        } else {
          allFields.push(sizeField);
        }
      }
      
      // For CSV connections using DuckDB, use 'main' as the default database if none is set
      let effectiveDatabase = selectedDatabase;
      if (connectionDetails?.type === 'csv' && !selectedDatabase) {
        effectiveDatabase = 'main'; // DuckDB's default database name
      }
      
      if (allFields.length === 0 || !selectedTable || !effectiveDatabase) {
        // If there's no query to run, clear previous results
        dispatch({ type: 'SET_QUERY_RESULT', payload: null });
        dispatch({ type: 'SET_QUERY_ERROR', payload: null });
        return;
      }
      
      const queryDesc = buildQuery({
        fields: allFields,
        selectedTable,
        selectedDatabase: effectiveDatabase,
        filterConfigurations,
      });

      if (queryDesc) {
        await executeQuery(queryDesc);
      }
    };

    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTable, selectedDatabase, connectionDetails, xAxisFields, yAxisFields, colorField, sizeField, filterConfigurations]);

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
  };
}; 