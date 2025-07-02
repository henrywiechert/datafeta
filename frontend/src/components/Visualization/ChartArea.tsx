import React, { useEffect, useMemo, useState } from 'react';
import { Box, IconButton, Collapse, Typography, Divider } from '@mui/material';
import BugReportIcon from '@mui/icons-material/BugReport';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import styles from './ChartArea.module.css';
import { useVisualizationContext } from '../../contexts/VisualizationContext';
import ChartGrid from './ChartGrid';
import DebugView from './DebugView';
import { apiService } from '../../apiService';
import { buildAggregatedQuery, buildRawQuery } from '../../queryBuilder/queryBuilder';
import { generateVegaLiteSpec } from '../../spec-generator/specGenerator';
import { QueryDescription } from '../../types';

const ChartArea: React.FC = () => {
  const { state, dispatch } = useVisualizationContext();
  const { xAxisFields, yAxisFields, selectedTable, selectedDatabase, queryResult, queryError } = state;
  const [isDebugOpen, setIsDebugOpen] = useState(false);
  const [queryDescription, setQueryDescription] = useState<QueryDescription | null>(null);

  const spec = useMemo(
    () => generateVegaLiteSpec({ xFields: xAxisFields, yFields: yAxisFields }),
    [xAxisFields, yAxisFields]
  );

  useEffect(() => {
    const fetchData = async () => {
      const allFields = [...xAxisFields, ...yAxisFields];
      let queryDesc: QueryDescription | null = null;
      
      // Choose the right query builder based on the chart type.
      // Scatter plots and line charts need raw data, bar charts need aggregated data.
      if (spec.mark === 'point' || spec.mark?.type === 'point' || spec.mark?.type === 'line') {
        queryDesc = buildRawQuery({
          fields: allFields,
          selectedTable,
          selectedDatabase,
        });
      } else if (spec.mark === 'bar' || spec.mark?.type === 'bar') {
        queryDesc = buildAggregatedQuery({
          fields: allFields,
          selectedTable,
          selectedDatabase,
        });
      }

      // Store query description for debug view
      setQueryDescription(queryDesc);

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
        setQueryDescription(null);
      }
    };

    fetchData();
  }, [spec, selectedTable, selectedDatabase, dispatch]);

  const toggleDebugView = () => {
    setIsDebugOpen(!isDebugOpen);
  };

  return (
    <div className={styles.container}>
      {/* Main chart area */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <Box sx={{ flex: 1, minHeight: 0 }}>
          <ChartGrid spec={spec} data={queryResult} />
        </Box>
        
        {/* Debug toggle button */}
        <Box sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'flex-end',
          pt: 1,
          borderTop: isDebugOpen ? '1px solid #e0e0e0' : 'none'
        }}>
          <IconButton 
            onClick={toggleDebugView}
            size="small"
            color={isDebugOpen ? 'primary' : 'default'}
            sx={{ 
              backgroundColor: isDebugOpen ? 'primary.50' : 'transparent',
              '&:hover': {
                backgroundColor: isDebugOpen ? 'primary.100' : 'action.hover',
              }
            }}
          >
            <BugReportIcon fontSize="small" />
            {isDebugOpen ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
          </IconButton>
          <Typography variant="caption" sx={{ ml: 1, color: 'text.secondary' }}>
            Debug
          </Typography>
        </Box>
        
        {/* Collapsible debug view */}
        <Collapse in={isDebugOpen}>
          <Box sx={{ 
            mt: 1, 
            border: '1px solid #e0e0e0', 
            borderRadius: 1, 
            maxHeight: '300px',
            overflow: 'hidden'
          }}>
            <DebugView 
              queryDescription={queryDescription}
              queryResult={queryResult}
              queryError={queryError}
            />
          </Box>
        </Collapse>
      </Box>
    </div>
  );
};

export default ChartArea; 