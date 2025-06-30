import React, { useEffect, useMemo } from 'react';
import styles from './ChartArea.module.css';
import { useVisualizationContext } from '../../contexts/VisualizationContext';
import ChartGrid from './ChartGrid';
import { apiService } from '../../apiService';
import { buildQueryFromSpec } from '../../queryBuilder/queryBuilder';
import { generateGridSpec } from '../../spec-generator/specGenerator';

const ChartArea: React.FC = () => {
  const { state, dispatch } = useVisualizationContext();
  const { xAxisFields, yAxisFields, selectedTable, selectedDatabase } = state;

  const gridSpec = useMemo(
    () => generateGridSpec({ xFields: xAxisFields, yFields: yAxisFields }),
    [xAxisFields, yAxisFields]
  );

  useEffect(() => {
    const fetchData = async () => {
      const queryDesc = buildQueryFromSpec({
        gridSpec,
        selectedTable,
        selectedDatabase,
      });

      if (queryDesc) {
        try {
          dispatch({ type: 'SET_QUERY_ERROR', payload: null });
          const result = await apiService.executeQuery(queryDesc);
          if (result.error) {
            dispatch({ type: 'SET_QUERY_ERROR', payload: result.error });
          } else {
            dispatch({ type: 'SET_QUERY_RESULT', payload: result });
          }
        } catch (error: any) {
          console.error('Failed to execute query:', error);
          dispatch({
            type: 'SET_QUERY_ERROR',
            payload: error.message || 'An unexpected error occurred.',
          });
        }
      } else {
        // If there's no query to run, clear previous results
        dispatch({ type: 'SET_QUERY_RESULT', payload: null });
        dispatch({ type: 'SET_QUERY_ERROR', payload: null });
      }
    };

    fetchData();
  }, [gridSpec, selectedTable, selectedDatabase, dispatch]);

  return (
    <div className={styles.container}>
      <ChartGrid gridSpec={gridSpec} queryResult={state.queryResult} />
    </div>
  );
};

export default ChartArea; 