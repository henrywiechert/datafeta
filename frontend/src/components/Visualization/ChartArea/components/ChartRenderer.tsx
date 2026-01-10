import React, { useRef, useMemo } from 'react';
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
  onPlotRenderComplete,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  // NOTE: We intentionally do NOT dispatch global window resize events here.
  // With large faceted grids, this forces every ObservablePlot instance to re-render,
  // creating multi-second UI stalls. Each plot already has a ResizeObserver.

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