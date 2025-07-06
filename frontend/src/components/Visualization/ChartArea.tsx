import React, { useEffect, useMemo, useState } from 'react';
import { Box, IconButton, Collapse, Typography, Divider } from '@mui/material';
import BugReportIcon from '@mui/icons-material/BugReport';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import styles from './ChartArea.module.css';
import { useVisualizationContext } from '../../contexts/VisualizationContext';
import ChartGrid from './ChartGrid';
import DebugView from './DebugView';
import ResizeHandle from '../Layout/ResizeHandle';
import { apiService } from '../../apiService';
import { buildQuery, getQueryTypeFromFields } from '../../queryBuilder/queryBuilder';
import { generateVegaLiteSpec } from '../../spec-generator/specGenerator';
import { QueryDescription } from '../../types';

const ChartArea: React.FC = () => {
  const { state, dispatch } = useVisualizationContext();
  const { xAxisFields, yAxisFields, selectedTable, selectedDatabase, queryResult, queryError } = state;
  const [isDebugOpen, setIsDebugOpen] = useState(false);
  const [debugHeight, setDebugHeight] = useState(300);
  const [maxDebugHeight, setMaxDebugHeight] = useState(800);
  const [queryDescription, setQueryDescription] = useState<QueryDescription | null>(null);

  const spec = useMemo(
    () => generateVegaLiteSpec({ xFields: xAxisFields, yFields: yAxisFields }),
    [xAxisFields, yAxisFields]
  );

  // Calculate dynamic max height based on window height
  useEffect(() => {
    const updateMaxHeight = () => {
      const windowHeight = window.innerHeight;
      // Allow debug view to take up to 70% of the window height
      const newMaxHeight = Math.floor(windowHeight * 0.7);
      const calculatedMaxHeight = Math.max(400, newMaxHeight); // Ensure minimum of 400px
      setMaxDebugHeight(calculatedMaxHeight);
      
      // Ensure current debug height doesn't exceed new max height
      setDebugHeight(prev => Math.min(prev, calculatedMaxHeight));
    };

    updateMaxHeight();
    window.addEventListener('resize', updateMaxHeight);
    return () => window.removeEventListener('resize', updateMaxHeight);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      const allFields = [...xAxisFields, ...yAxisFields];
      let queryDesc: QueryDescription | null = null;
      
      // NEW APPROACH: Use field-driven query type determination
      // The user's field configuration is now the source of truth
      queryDesc = buildQuery({
        fields: allFields,
        selectedTable,
        selectedDatabase,
      });

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

  const handleDebugResize = (newHeight: number) => {
    setDebugHeight(newHeight);
  };

  return (
    <div className={styles.container}>
      {/* Main chart area */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'auto' }}>
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
            height: `${debugHeight}px`,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* Resize handle at the top */}
            <ResizeHandle 
              direction="vertical"
              edge="top"
              onResize={handleDebugResize}
              currentSize={debugHeight}
              minSize={150}
              maxSize={maxDebugHeight}
            />
            <Box sx={{ flex: 1, overflow: 'hidden' }}>
              <DebugView 
                queryDescription={queryDescription}
                queryResult={queryResult}
                queryError={queryError}
                vegaSpec={spec}
              />
            </Box>
          </Box>
        </Collapse>
      </Box>
    </div>
  );
};

export default ChartArea; 