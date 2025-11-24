import React, { useEffect, useRef, useMemo } from 'react';
import { Box } from '@mui/material';
import ChartGrid from '../../ChartGrid/ChartGrid';
import TableViewLazy from '../../TableViewLazy';
import BarSortControl from './BarSortControl';
import { PlotResult } from '../../../../observable-plot-generator/types';
import { TableData } from '../types';

interface ChartRendererProps {
  useTableView: boolean;
  tableData: TableData;
  spec: PlotResult | null;
  queryResult: any;
  xAxisFields: any[];
  yAxisFields: any[];
  isDebugOpen: boolean;
  debugHeight: number;
  onPlotRenderComplete?: (plotId: string) => void;
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
  onPlotRenderComplete,
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

  // Memoize content to prevent re-rendering when unrelated props change
  const content = useMemo(() => {
    if (useTableView) {
      return (
        <TableViewLazy 
          columns={tableData.columns} 
          rows={tableData.rows} 
          xFields={xAxisFields}
          yFields={yAxisFields}
        />
      );
    }
    return (
      <ChartGrid 
        spec={spec} 
        data={queryResult}
        onPlotRenderComplete={onPlotRenderComplete}
      />
    );
  }, [useTableView, tableData, spec, queryResult, xAxisFields, yAxisFields, onPlotRenderComplete]);

  return (
    <Box 
      ref={containerRef}
      sx={{ 
        flex: 1, 
        minHeight: 0, 
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative'
      }}
    >
      {content}
      {!useTableView && (
        <BarSortControl 
          xFields={xAxisFields} 
          yFields={yAxisFields}
        />
      )}
    </Box>
  );
};

// Memoize the entire component to prevent re-renders when props haven't changed
export default React.memo(ChartRenderer, (prevProps, nextProps) => {
  return (
    prevProps.useTableView === nextProps.useTableView &&
    prevProps.tableData === nextProps.tableData &&
    prevProps.spec === nextProps.spec &&
    prevProps.queryResult === nextProps.queryResult &&
    prevProps.xAxisFields === nextProps.xAxisFields &&
    prevProps.yAxisFields === nextProps.yAxisFields &&
    prevProps.isDebugOpen === nextProps.isDebugOpen &&
    prevProps.debugHeight === nextProps.debugHeight &&
    prevProps.onPlotRenderComplete === nextProps.onPlotRenderComplete
  );
}); 