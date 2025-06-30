import React, { useEffect, useMemo } from 'react';
import styles from './ChartArea.module.css';
import { useVisualizationContext } from '../../contexts/VisualizationContext';
import { isDimension, isMeasure } from '../../utils/fieldUtils';
import ChartGrid from './ChartGrid';
import { apiService } from '../../apiService';
import { buildQuery } from '../../queryBuilder/queryBuilder';
import { generateGridSpec } from '../../spec-generator/specGenerator';

const ChartArea: React.FC = () => {
  const { state, dispatch } = useVisualizationContext();
  const { xAxisFields, yAxisFields } = state;

  const gridSpec = useMemo(
    () => generateGridSpec({ xFields: xAxisFields, yFields: yAxisFields }),
    [xAxisFields, yAxisFields]
  );

  const xDimensions = useMemo(
    () => state.xAxisFields.filter(isDimension),
    [state.xAxisFields]
  );
  const yDimensions = useMemo(
    () => state.yAxisFields.filter(isDimension),
    [state.yAxisFields]
  );
  const xMeasures = useMemo(
    () => state.xAxisFields.filter(isMeasure),
    [state.xAxisFields]
  );
  const yMeasures = useMemo(
    () => state.yAxisFields.filter(isMeasure),
    [state.yAxisFields]
  );

  useEffect(() => {
    const fetchData = async () => {
      const queryDesc = buildQuery({
        xDimensions,
        yDimensions,
        xMeasures,
        yMeasures,
        selectedTable: state.selectedTable,
        selectedDatabase: state.selectedDatabase,
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
        dispatch({ type: 'SET_QUERY_RESULT', payload: null });
        dispatch({ type: 'SET_QUERY_ERROR', payload: null });
      }
    };

    fetchData();
  }, [
    state.selectedTable,
    state.selectedDatabase,
    xDimensions,
    yDimensions,
    xMeasures,
    yMeasures,
    dispatch,
  ]);

  return (
    <div className={styles.container}>
      <ChartGrid gridSpec={gridSpec} />
    </div>
  );
};

export default ChartArea; 