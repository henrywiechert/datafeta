import { useCallback, useRef, useEffect, useMemo } from 'react';
import { apiService } from '../../../../apiService';
import { buildQuery } from '../../../../queryBuilder/queryBuilder';
import { QueryDescription } from '../../../../types';
import { logOperationTiming, logOperationStart } from '../utils';
import { validateAndCleanData } from '../utils/dataValidation';

interface UseQueryExecutionProps {
  selectedTable: string | null;
  selectedDatabase: string | null;
  xAxisFields: any[];
  yAxisFields: any[];
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
  startOperation,
  completeOperation,
  dispatch,
}: UseQueryExecutionProps): UseQueryExecutionReturn => {
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
      const duration = Date.now() - startTime;
      // console.error(`❌ Query failed after ${duration}ms:`, error); // Removed debugging log
      
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

  const cancelQuery = useCallback(() => {
    if (queryAbortControllerRef.current) {
      queryAbortControllerRef.current.abort();
    }
  }, []);

  // Memoize current query description to avoid unnecessary recalculations
  const currentQueryDescription = useMemo((): QueryDescription | null => {
    const allFields = [...xAxisFields, ...yAxisFields];
    
    if (allFields.length === 0 || !selectedTable || !selectedDatabase) {
      return null;
    }
    
    const queryDesc = buildQuery({
      fields: allFields,
      selectedTable,
      selectedDatabase,
    });

    return queryDesc;
  }, [selectedTable, selectedDatabase, xAxisFields, yAxisFields]);

  // Effect to handle query execution when fields change
  useEffect(() => {
    const fetchData = async () => {
      const allFields = [...xAxisFields, ...yAxisFields];
      
      if (allFields.length === 0 || !selectedTable || !selectedDatabase) {
        // If there's no query to run, clear previous results
        dispatch({ type: 'SET_QUERY_RESULT', payload: null });
        dispatch({ type: 'SET_QUERY_ERROR', payload: null });
        return;
      }
      
      // console.log(`🔍 Building query for ${allFields.length} fields`); // Removed debugging log
      
      const queryDesc = buildQuery({
        fields: allFields,
        selectedTable,
        selectedDatabase,
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
  }, [selectedTable, selectedDatabase, xAxisFields, yAxisFields]);

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