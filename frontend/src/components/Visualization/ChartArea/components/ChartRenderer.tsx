import React, { useEffect, useRef } from 'react';
import { Box } from '@mui/material';
import ChartGrid from '../../ChartGrid';
import TableView from '../../TableView';
import { VegaLiteSpec } from '../../../../spec-generator/types';
import { TableData } from '../types';

interface ChartRendererProps {
  useTableView: boolean;
  tableData: TableData;
  spec: VegaLiteSpec | null;
  queryResult: any;
  xAxisFields: any[];
  yAxisFields: any[];
  isDebugOpen: boolean;
  debugHeight: number;
}

const ChartRenderer: React.FC<ChartRendererProps> = ({
  useTableView,
  tableData,
  spec,
  queryResult,
  xAxisFields,
  yAxisFields,
  isDebugOpen,
  debugHeight,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Force a resize event when the debug panel state changes
  useEffect(() => {
    const triggerResize = () => {
      if (containerRef.current) {
        // Multiple resize events to handle different timing scenarios
        window.dispatchEvent(new Event('resize'));
        
        // Second event after a short delay for cases where layout is still updating
        setTimeout(() => {
          window.dispatchEvent(new Event('resize'));
        }, 50);
      }
    };

    // Delay to ensure layout changes are complete
    const timeoutId = setTimeout(triggerResize, 100);
    
    return () => clearTimeout(timeoutId);
  }, [isDebugOpen, debugHeight]); // Trigger when debug state changes

  const content = useTableView ? (
    <TableView 
      columns={tableData.columns} 
      rows={tableData.rows} 
      xFields={xAxisFields}
      yFields={yAxisFields}
    />
  ) : (
    <ChartGrid 
      spec={spec} 
      data={queryResult} 
    />
  );

  return (
    <Box 
      ref={containerRef}
      sx={{ 
        flex: 1, 
        minHeight: 0, 
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      {content}
    </Box>
  );
};

export default ChartRenderer; 