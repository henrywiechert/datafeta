// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { useRef, useMemo } from 'react';
import { Box } from '@mui/material';
import ChartGrid, {
  ChartGridGanttProps,
  ChartGridBrushProps,
  ChartGridLabelStyles,
} from '../../ChartGrid/ChartGrid';
import { HeatmapSizeToolbarState } from '../../ChartGrid/hooks/useHeatmapSizeToolbar';
import { CellSizeOverrides } from '../../ChartGrid/hooks/useCellSizeOverrides';
import TableViewRowsLazy from '../../Table/TableViewRowsLazy';
import TableRowsPagination from '../../Table/TableRowsPagination';
import BarSortControl from './BarSortControl';
import { GridResultModel } from '../../../../observable-plot-generator/gridModel';
import type { TableCellFilterAction } from '../../Table/TableViewRows';
import { TableRowsSortModel } from '../../../../types';
import { QueryResultColumn } from '../../../../types';
import { UserChartType } from '../../../../types';

interface ChartRendererProps {
  grid: GridResultModel | null;
  cellSizeOverrides: CellSizeOverrides;
  onAutoCategoryTickMeasure?: (sizes: { xHeightPx: number; yWidthPx: number }) => void;
  queryResult: any;
  xAxisFields: any[];
  yAxisFields: any[];
  onPlotRenderComplete?: (plotId: string) => void;
  /** Gantt-specific configuration (omit for non-Gantt charts). Forwarded to ChartGrid. */
  gantt?: ChartGridGanttProps;
  /** Brush selection configuration. Forwarded to ChartGrid. */
  brush?: ChartGridBrushProps;
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
  /**
   * Pager data for the 'table-refactor' chart type. When provided, a pager bar
   * is rendered below the chart grid. `pagination.totalRowTuples` may be 0 to
   * indicate "no data yet" (the pager renders disabled).
   */
  tableRefactorPagerData?: {
    page: number;
    pageSize: number;
    totalRowTuples: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (size: number) => void;
    loading: boolean;
  };
  onHeatmapSizeToolbarChange?: (toolbarState: HeatmapSizeToolbarState | null) => void;
  /** Axis / facet / category label styling, lifted from VisualizationContext. Forwarded to ChartGrid. */
  labelStyles: ChartGridLabelStyles;
  globalChartType: UserChartType | null;
}

const ChartRenderer: React.FC<ChartRendererProps> = ({
  grid,
  cellSizeOverrides,
  onAutoCategoryTickMeasure,
  xAxisFields,
  yAxisFields,
  onPlotRenderComplete,
  gantt,
  brush,
  showTableRows = false,
  tableRowsData,
  onTableCellFilterAction,
  tableRefactorPagerData,
  onHeatmapSizeToolbarChange,
  labelStyles,
  globalChartType,
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
    const chartGridNode = (
      <ChartGrid 
        grid={grid} 
        cellSizeOverrides={cellSizeOverrides}
        onAutoCategoryTickMeasure={onAutoCategoryTickMeasure}
        onPlotRenderComplete={onPlotRenderComplete}
        onHeatmapSizeToolbarChange={onHeatmapSizeToolbarChange}
        globalChartType={globalChartType}
        gantt={gantt}
        brush={brush}
        labelStyles={labelStyles}
      />
    );
    if (!tableRefactorPagerData) return chartGridNode;
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {chartGridNode}
        </Box>
        <TableRowsPagination
          page={tableRefactorPagerData.page}
          pageSize={tableRefactorPagerData.pageSize}
          totalRows={tableRefactorPagerData.totalRowTuples}
          onPageChange={tableRefactorPagerData.onPageChange}
          onPageSizeChange={tableRefactorPagerData.onPageSizeChange}
          loading={tableRefactorPagerData.loading}
        />
      </Box>
    );
  }, [tableRowsContent, grid, cellSizeOverrides, onAutoCategoryTickMeasure, onPlotRenderComplete, gantt, brush, tableRefactorPagerData, onHeatmapSizeToolbarChange, labelStyles, globalChartType]);

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
      {!showTableRows && (
        <BarSortControl 
          xFields={xAxisFields} 
          yFields={yAxisFields}
        />
      )}
    </Box>
  );
};

// Memoize the entire component to prevent re-renders when props haven't changed.
// All callback props are useCallback-stable in ChartArea so the default shallow
// comparator is correct here. (A previous hand-written comparator enumerated
// every prop and was a drift-risk: any new prop added without updating the
// comparator would silently skip updates.)
export default React.memo(ChartRenderer); 