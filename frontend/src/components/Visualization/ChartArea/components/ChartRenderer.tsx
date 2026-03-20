import React, { useRef, useMemo } from 'react';
import { Box } from '@mui/material';
import ChartGrid, { GanttZoomRange } from '../../ChartGrid/ChartGrid';
import { PlotBrushEvent } from '../../ChartGrid/PlotArea';
import TableViewLazy from '../../Table/TableViewLazy';
import TableViewRowsLazy from '../../Table/TableViewRowsLazy';
import TableRowsPagination from '../../Table/TableRowsPagination';
import BarSortControl from './BarSortControl';
import { PlotResult } from '../../../../observable-plot-generator/types';
import { TableData } from '../types';
import { TableRowsSortModel } from '../hooks/useTableRowsQuery';
import { QueryResultColumn } from '../../../../types';
import type { TableCellFilterAction } from '../../Table/TableViewRows';

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
  /** Whether the current chart is a Gantt chart */
  isGanttChart?: boolean;
  /** Current Gantt zoom range (null = full data range) */
  ganttZoomRange?: GanttZoomRange | null;
  /** Callback when Gantt zoom range changes */
  onGanttZoomRangeChange?: (range: GanttZoomRange | null) => void;
  /** Full data range for Gantt chart (for zoom calculations) */
  ganttFullDataRange?: GanttZoomRange | null;
  brushDisabled?: boolean;
  onBrushEnd?: (event: PlotBrushEvent) => void;
  /** Table rows view mode */
  showTableRows?: boolean;
  tableRowsData?: {
    rows: Record<string, any>[];
    columns: QueryResultColumn[];
    totalRows: number;
    page: number;
    pageSize: number;
    setPage: (page: number) => void;
    setPageSize: (size: number) => void;
    sortModel: TableRowsSortModel | null;
    setSortModel: (sort: TableRowsSortModel | null) => void;
    loading: boolean;
    error: string | null;
  };
  /** Callback for context-menu filter actions on table rows. */
  onTableCellFilterAction?: (action: TableCellFilterAction) => void;
}

const ChartRenderer: React.FC<ChartRendererProps> = ({
  useTableView,
  tableData,
  spec,
  queryResult,
  xAxisFields,
  yAxisFields,
  onPlotRenderComplete,
  isGanttChart = false,
  ganttZoomRange,
  onGanttZoomRangeChange,
  ganttFullDataRange,
  brushDisabled,
  onBrushEnd,
  showTableRows = false,
  tableRowsData,
  onTableCellFilterAction,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  // NOTE: We intentionally do NOT dispatch global window resize events here.
  // With large faceted grids, this forces every ObservablePlot instance to re-render,
  // creating multi-second UI stalls. Each plot already has a ResizeObserver.

  // Memoize table rows content separately so chart-only prop changes don't re-create it
  const tableRowsContent = useMemo(() => {
    if (!showTableRows || !tableRowsData) return null;
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Box sx={{ flex: 1, minHeight: 0 }}>
          <TableViewRowsLazy
            rows={tableRowsData.rows}
            columns={tableRowsData.columns}
            sortModel={tableRowsData.sortModel}
            onSortChanged={tableRowsData.setSortModel}
            loading={tableRowsData.loading}
            onCellFilterAction={onTableCellFilterAction}
          />
        </Box>
        <TableRowsPagination
          page={tableRowsData.page}
          pageSize={tableRowsData.pageSize}
          totalRows={tableRowsData.totalRows}
          onPageChange={tableRowsData.setPage}
          onPageSizeChange={tableRowsData.setPageSize}
          loading={tableRowsData.loading}
        />
      </Box>
    );
  }, [showTableRows, tableRowsData, onTableCellFilterAction]);

  // Memoize chart/table content separately so table rows mode is unaffected by chart changes
  const content = useMemo(() => {
    if (tableRowsContent) return tableRowsContent;
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
        isGanttChart={isGanttChart}
        ganttZoomRange={ganttZoomRange}
        onGanttZoomRangeChange={onGanttZoomRangeChange}
        ganttFullDataRange={ganttFullDataRange}
        brushDisabled={brushDisabled}
        onBrushEnd={onBrushEnd}
      />
    );
  }, [tableRowsContent, useTableView, tableData, spec, queryResult, xAxisFields, yAxisFields, onPlotRenderComplete, isGanttChart, ganttZoomRange, onGanttZoomRangeChange, ganttFullDataRange, brushDisabled, onBrushEnd]);

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
      {!useTableView && !showTableRows && (
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
    prevProps.onPlotRenderComplete === nextProps.onPlotRenderComplete &&
    prevProps.isGanttChart === nextProps.isGanttChart &&
    prevProps.ganttZoomRange === nextProps.ganttZoomRange &&
    prevProps.ganttFullDataRange === nextProps.ganttFullDataRange &&
    prevProps.brushDisabled === nextProps.brushDisabled &&
    prevProps.showTableRows === nextProps.showTableRows &&
    prevProps.tableRowsData === nextProps.tableRowsData &&
    prevProps.onTableCellFilterAction === nextProps.onTableCellFilterAction
  );
}); 