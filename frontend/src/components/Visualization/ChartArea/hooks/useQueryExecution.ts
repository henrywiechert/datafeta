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
  filterConfigurations,
  startOperation,
  completeOperation,
  dispatch,
}: UseQueryExecutionProps): UseQueryExecutionReturn => {
  const { connectionDetails } = useConnection();
  const queryAbortControllerRef = useRef<AbortController | null>(null);

  const executeQuery = useCallback(async (queryDesc: QueryDescription) => {
    const startTime = Date.now();
    // logOperationStart('executeQuery', { 
    //   table: queryDesc.target_table, 
    //   dims: queryDesc.dimensions?.length, 
    //   measures: queryDesc.measures?.length 
    // }); // Removed debugging log
    
    try {
      // Cancel any existing query operation
      if (queryAbortControllerRef.current) {
        queryAbortControllerRef.current.abort();
      }

      // Create new abort controller
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
      
      completeOperation('query');
    } catch (error: any) {
      // console.error(`❌ Query failed after ${Date.now() - startTime}ms:`, error); // Removed debugging log
      
      if (error.message === 'Request was cancelled') {
        // Operation was cancelled, don't set error
        dispatch({ type: 'SET_QUERY_ERROR', payload: null });
      } else {
        dispatch({
          type: 'SET_QUERY_ERROR',
          payload: error.message || 'An unexpected error occurred.',
        });
      }
      
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
  }, [selectedTable, selectedDatabase, xAxisFields, yAxisFields, colorField, filterConfigurations]);

  // Effect to handle query execution when fields change
  useEffect(() => {
    const fetchData = async () => {
      // Tag fields with their axis for query optimization
      const taggedXFields = xAxisFields.map(f => ({ ...f, axis: 'x' as const }));
      const taggedYFields = yAxisFields.map(f => ({ ...f, axis: 'y' as const }));
      const allFields = [...taggedXFields, ...taggedYFields];
      
      // Add colorField if it exists and is a dimension (no axis tagging for color)
      if (colorField && colorField.type === 'dimension') {
        allFields.push(colorField);
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
      
      // console.log(`🔍 Building query for ${allFields.length} fields`); // Removed debugging log
      
      const queryDesc = buildQuery({
        fields: allFields,
        selectedTable,
        selectedDatabase: effectiveDatabase,
        filterConfigurations,
      });

      // console.log(`📋 Generated query:`, { 
      //   type: queryDesc ? (queryDesc.measures?.length ? 'aggregated' : 'raw') : 'none',
      //   dimensions: queryDesc?.dimensions?.length || 0,
      //   measures: queryDesc?.measures?.length || 0
      // }); // Removed debugging log

      if (queryDesc) {
        await executeQuery(queryDesc);
      }
    };

    fetchData();
  }, [selectedTable, selectedDatabase, connectionDetails, xAxisFields, yAxisFields, colorField, filterConfigurations, dispatch, executeQuery]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (queryAbortControllerRef.current) {
        queryAbortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    queryDescription: currentQueryDescription,
  };
}; 