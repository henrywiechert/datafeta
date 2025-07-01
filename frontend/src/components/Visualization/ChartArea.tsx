import React, { useEffect, useMemo } from 'react';
import styles from './ChartArea.module.css';
import { useVisualizationContext } from '../../contexts/VisualizationContext';
import ChartGrid from './ChartGrid';
import { apiService } from '../../apiService';
import { buildAggregatedQuery, buildRawQuery } from '../../queryBuilder/queryBuilder';
import { generateVegaLiteSpec } from '../../spec-generator/specGenerator';
import { QueryDescription } from '../../types';

const ChartArea: React.FC = () => {
  const { state, dispatch } = useVisualizationContext();
  const { xAxisFields, yAxisFields, selectedTable, selectedDatabase, queryResult } = state;

  const spec = useMemo(
    () => generateVegaLiteSpec({ xFields: xAxisFields, yFields: yAxisFields }),
    [xAxisFields, yAxisFields]
  );

  useEffect(() => {
    const fetchData = async () => {
      const allFields = [...xAxisFields, ...yAxisFields];
      let queryDesc: QueryDescription | null = null;
      
      // Choose the right query builder based on the chart type.
      // Scatter plots need raw data, bar charts need aggregated data.
      if (spec.mark === 'point') {
        queryDesc = buildRawQuery({
          fields: allFields,
          selectedTable,
          selectedDatabase,
        });
      } else if (spec.mark === 'bar') {
        queryDesc = buildAggregatedQuery({
          fields: allFields,
          selectedTable,
          selectedDatabase,
        });
      }

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
  }, [spec, selectedTable, selectedDatabase, dispatch]);


  return (
    <div className={styles.container}>
      <ChartGrid spec={spec} data={queryResult} />
    </div>
  );
};

export default ChartArea; 