import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Box, IconButton, Collapse, Typography, Divider } from '@mui/material';
import BugReportIcon from '@mui/icons-material/BugReport';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import styles from './ChartArea.module.css';
import { useVisualizationContext } from '../../contexts/VisualizationContext';
import ChartGrid from './ChartGrid';
import TableView from './TableView';
import DebugView from './DebugView';
import ResizeHandle from '../Layout/ResizeHandle';
import { apiService } from '../../apiService';
import { buildQuery, getQueryTypeFromFields } from '../../queryBuilder/queryBuilder';
import { generateVegaLiteSpec } from '../../spec-generator/specGenerator';
import { shouldUseTableView, prepareTableData } from '../../utils/tableViewUtils';
import { QueryDescription } from '../../types';
import { VegaLiteSpec } from '../../spec-generator/types';
import { chartWorkerService } from '../../services/chartWorkerService';
import { getTimeoutForOperation } from '../../config/loadingConfig';

const ChartArea: React.FC = () => {
  const { state, dispatch, startOperation, completeOperation, cancelOperation } = useVisualizationContext();
  const { xAxisFields, yAxisFields, selectedTable, selectedDatabase, queryResult, queryError, isLoadingQuery, isLoadingRendering } = state;
  const [isDebugOpen, setIsDebugOpen] = useState(false);
  const [debugHeight, setDebugHeight] = useState(300);
  const [maxDebugHeight, setMaxDebugHeight] = useState(800);
  const [queryDescription, setQueryDescription] = useState<QueryDescription | null>(null);
  const [spec, setSpec] = useState<VegaLiteSpec | null>(null);
  const [chartInfo, setChartInfo] = useState<any>(null);
  const [renderingError, setRenderingError] = useState<string | null>(null);
  
  // Refs for cancellation
  const queryAbortControllerRef = useRef<AbortController | null>(null);
  const renderingAbortControllerRef = useRef<AbortController | null>(null);

  // Determine if we should show table view instead of chart
  const useTableView = useMemo(
    () => shouldUseTableView(xAxisFields, yAxisFields),
    [xAxisFields, yAxisFields]
  );

  // Prepare table data if using table view
  const tableData = useMemo(() => {
    if (useTableView && queryResult) {
      return prepareTableData(queryResult, xAxisFields, yAxisFields);
    }
    return { columns: [], rows: [] };
  }, [useTableView, queryResult, xAxisFields, yAxisFields]);

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

  // Generate chart specification using Web Worker
  const generateChartSpec = useCallback(async () => {
    const startTime = Date.now();
    console.log(`🎨 generateChartSpec called - xFields: ${xAxisFields.length}, yFields: ${yAxisFields.length}`);
    
    // Skip if no fields or if we're using table view
    if ((xAxisFields.length === 0 && yAxisFields.length === 0) || useTableView) {
      console.log('⏭️ Skipping chart generation', { 
        noFields: xAxisFields.length === 0 && yAxisFields.length === 0,
        useTableView 
      });
      setSpec(null);
      setChartInfo(null);
      setRenderingError(null);
      return;
    }

    try {
      // Cancel any existing rendering operation
      if (renderingAbortControllerRef.current) {
        renderingAbortControllerRef.current.abort();
      }

      // Create new abort controller
      renderingAbortControllerRef.current = new AbortController();

      // Start rendering operation
      startOperation('rendering', true);
      setRenderingError(null);

      // Check if worker is available, fallback to sync generation
      if (!chartWorkerService.isWorkerAvailable()) {
        console.warn('🔄 Chart worker not available, falling back to synchronous generation');
        
        // Add a small delay to ensure the modal appears even for sync generation
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const syncSpec = generateVegaLiteSpec({ xFields: xAxisFields, yFields: yAxisFields });
        setSpec(syncSpec);
        setChartInfo(null);
        
        const duration = Date.now() - startTime;
        console.log(`⏱️ Chart generation completed in ${duration}ms (sync)`);
        completeOperation();
        return;
      }

      // Generate spec using Web Worker
      const result = await chartWorkerService.generateChartSpec(
        xAxisFields, 
        yAxisFields, 
        { 
          timeout: getTimeoutForOperation('worker'), // Timeout from config
          signal: renderingAbortControllerRef.current?.signal 
        }
      );

      // Update state with result
      setSpec(result.spec);
      setChartInfo(result.chartInfo);
      
      const duration = Date.now() - startTime;
      console.log(`⏱️ Chart generation completed in ${duration}ms (worker)`);
      completeOperation();

    } catch (error: any) {
      console.error('Chart generation error:', error);
      
      if (error.code === 'CANCELLED') {
        // Operation was cancelled, don't set error
        setRenderingError(null);
      } else {
        // Set error and fallback to synchronous generation
        setRenderingError(error.message || 'Chart generation failed');
        
        try {
          const fallbackSpec = generateVegaLiteSpec({ xFields: xAxisFields, yFields: yAxisFields });
          setSpec(fallbackSpec);
          setChartInfo(null);
        } catch (fallbackError) {
          console.error('Fallback chart generation failed:', fallbackError);
          setSpec(null);
          setChartInfo(null);
        }
      }
      
      completeOperation();
    }
  }, [xAxisFields, yAxisFields, useTableView, startOperation, completeOperation]);

  // Execute query with cancellation support
  const executeQuery = useCallback(async (queryDesc: QueryDescription) => {
    const startTime = Date.now();
    console.log(`🔍 executeQuery called - table: ${queryDesc.target_table}, dims: ${queryDesc.dimensions?.length}, measures: ${queryDesc.measures?.length}`);
    
    // Query will run without automatic sampling limits
    
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
      
      const duration = Date.now() - startTime;
      console.log(`⏱️ Query completed in ${duration}ms, rows: ${result.row_count}`);
      
      if (result.error) {
        dispatch({ type: 'SET_QUERY_ERROR', payload: result.error });
      } else {
        // Validate and clean the data before setting it
        const cleanedResult = validateAndCleanData(result);
        dispatch({ type: 'SET_QUERY_RESULT', payload: cleanedResult });
        
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

  // Function to validate and clean data for Vega-Lite
  const validateAndCleanData = (result: any) => {
    if (!result.rows || result.rows.length === 0) {
      return result;
    }

    console.log(`🧹 Validating and cleaning ${result.rows.length} rows`);
    
    const cleanedRows = result.rows
      .map((row: any) => {
        const cleanedRow = { ...row };
        
        // Clean each field in the row
        Object.keys(cleanedRow).forEach(key => {
          const value = cleanedRow[key];
          
          // Handle invalid numeric values
          if (typeof value === 'number') {
            if (!isFinite(value) || isNaN(value)) {
              console.warn(`🚨 Invalid value found in field ${key}: ${value}, replacing with null`);
              cleanedRow[key] = null;
            }
          }
          
          // Handle string representations of invalid numbers
          if (typeof value === 'string') {
            const numValue = parseFloat(value);
            if (!isNaN(numValue) && !isFinite(numValue)) {
              console.warn(`🚨 Invalid numeric string found in field ${key}: ${value}, replacing with null`);
              cleanedRow[key] = null;
            }
          }
        });
        
        return cleanedRow;
      })
      .filter((row: any) => {
        // Filter out rows that are completely null/undefined
        const hasValidData = Object.values(row).some(value => 
          value !== null && value !== undefined && value !== ''
        );
        return hasValidData;
      });

    const filteredCount = result.rows.length - cleanedRows.length;
    if (filteredCount > 0) {
      console.warn(`🧹 Filtered out ${filteredCount} invalid rows`);
    }

    return {
      ...result,
      rows: cleanedRows,
      row_count: cleanedRows.length
    };
  };

  // Effect to handle chart specification generation
  useEffect(() => {
    generateChartSpec();
  }, [generateChartSpec]);

  // Effect to handle query execution
  useEffect(() => {
    const fetchData = async () => {
      const allFields = [...xAxisFields, ...yAxisFields];
      let queryDesc: QueryDescription | null = null;
      
      console.log(`�� Building query for ${allFields.length} fields`);
      
      // NEW APPROACH: Use field-driven query type determination
      // The user's field configuration is now the source of truth
      queryDesc = buildQuery({
        fields: allFields,
        selectedTable,
        selectedDatabase,
      });

      console.log(`📋 Generated query:`, { 
        type: queryDesc ? (queryDesc.measures?.length ? 'aggregated' : 'raw') : 'none',
        dimensions: queryDesc?.dimensions?.length || 0,
        measures: queryDesc?.measures?.length || 0
      });

      // Store query description for debug view
      setQueryDescription(queryDesc);

      if (queryDesc) {
        await executeQuery(queryDesc);
      } else {
        // If there's no query to run, clear previous results
        dispatch({ type: 'SET_QUERY_RESULT', payload: null });
        dispatch({ type: 'SET_QUERY_ERROR', payload: null });
        setQueryDescription(null);
      }
    };

    fetchData();
  }, [selectedTable, selectedDatabase, xAxisFields, yAxisFields, executeQuery, dispatch]);

  // Cancel operations when component unmounts
  useEffect(() => {
    return () => {
      if (queryAbortControllerRef.current) {
        queryAbortControllerRef.current.abort();
      }
      if (renderingAbortControllerRef.current) {
        renderingAbortControllerRef.current.abort();
      }
    };
  }, []);

  // Handle cancellation from context
  useEffect(() => {
    // This effect runs when the cancel operation is triggered from the modal
    // We need to listen for cancellation events and clean up accordingly
    const handleCancellation = () => {
      if (queryAbortControllerRef.current) {
        queryAbortControllerRef.current.abort();
      }
      if (renderingAbortControllerRef.current) {
        renderingAbortControllerRef.current.abort();
      }
      chartWorkerService.cancelAllTasks();
    };

    // We can't directly listen to cancellation from context, but the abort controllers will handle it
    // The cancellation will be handled by the individual operations
  }, []);

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
          {useTableView ? (
            <TableView 
              columns={tableData.columns} 
              rows={tableData.rows} 
              xFields={xAxisFields}
              yFields={yAxisFields}
            />
          ) : (
            <ChartGrid spec={spec} data={queryResult} />
          )}
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
                chartInfo={chartInfo}
                renderingError={renderingError}
              />
            </Box>
          </Box>
        </Collapse>
      </Box>
    </div>
  );
};

export default ChartArea; 