import { useCallback, useRef, useEffect } from 'react';
import { apiService } from '../../../../apiService';
import { buildQuery } from '../../../../queryBuilder/queryBuilder';
import { QueryDescription } from '../../../../types';
import { logOperationTiming, logOperationStart } from '../utils';

interface UseQueryExecutionProps {
  selectedTable: string | null;
  selectedDatabase: string | null;
  xAxisFields: any[];
  yAxisFields: any[];
  startOperation: (operation: string, canCancel: boolean) => void;
  completeOperation: () => void;
  dispatch: (action: any) => void;
}

interface UseQueryExecutionReturn {
  executeQuery: (queryDesc: QueryDescription) => Promise<void>;
  cancelQuery: () => void;
  queryDescription: QueryDescription | null;
}

export const useQueryExecution = ({
  selectedTable,
  selectedDatabase,
  xAxisFields,
  yAxisFields,
  startOperation,
  completeOperation,
  dispatch,
}: UseQueryExecutionProps): UseQueryExecutionReturn => {
  const queryAbortControllerRef = useRef<AbortController | null>(null);

  const executeQuery = useCallback(async (queryDesc: QueryDescription) => {
    const startTime = Date.now();
    logOperationStart('executeQuery', { 
      table: queryDesc.target_table, 
      dims: queryDesc.dimensions?.length, 
      measures: queryDesc.measures?.length 
    });
    
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
        dispatch({ type: 'SET_QUERY_RESULT', payload: result });
        
        // Warn if data was too large
        if (result.row_count > 50000) {
          console.warn(`⚠️ Large dataset detected (${result.row_count} rows). Consider using aggregation or filtering.`);
        }
      }
      
      completeOperation();
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error(`❌ Query failed after ${duration}ms:`, error);
      
      if (error.message === 'Request was cancelled') {
        // Operation was cancelled, don't set error
        dispatch({ type: 'SET_QUERY_ERROR', payload: null });
      } else {
        dispatch({
          type: 'SET_QUERY_ERROR',
          payload: error.message || 'An unexpected error occurred.',
        });
      }
      
      completeOperation();
    }
  }, [startOperation, completeOperation, dispatch]);

  const cancelQuery = useCallback(() => {
    if (queryAbortControllerRef.current) {
      queryAbortControllerRef.current.abort();
    }
  }, []);

  // Build query from current fields
  const buildCurrentQuery = useCallback((): QueryDescription | null => {
    const allFields = [...xAxisFields, ...yAxisFields];
    
    if (allFields.length === 0 || !selectedTable || !selectedDatabase) {
      return null;
    }
    
    console.log(`🔍 Building query for ${allFields.length} fields`);
    
    const queryDesc = buildQuery({
      fields: allFields,
      selectedTable,
      selectedDatabase,
    });

    console.log(`📋 Generated query:`, { 
      type: queryDesc ? (queryDesc.measures?.length ? 'aggregated' : 'raw') : 'none',
      dimensions: queryDesc?.dimensions?.length || 0,
      measures: queryDesc?.measures?.length || 0
    });

    return queryDesc;
  }, [selectedTable, selectedDatabase, xAxisFields, yAxisFields]);

  // Effect to handle query execution when fields change
  useEffect(() => {
    const fetchData = async () => {
      const queryDesc = buildCurrentQuery();

      if (queryDesc) {
        await executeQuery(queryDesc);
      } else {
        // If there's no query to run, clear previous results
        dispatch({ type: 'SET_QUERY_RESULT', payload: null });
        dispatch({ type: 'SET_QUERY_ERROR', payload: null });
      }
    };

    fetchData();
  }, [selectedTable, selectedDatabase, xAxisFields, yAxisFields, executeQuery, dispatch, buildCurrentQuery]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (queryAbortControllerRef.current) {
        queryAbortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    executeQuery,
    cancelQuery,
    queryDescription: buildCurrentQuery(),
  };
}; 