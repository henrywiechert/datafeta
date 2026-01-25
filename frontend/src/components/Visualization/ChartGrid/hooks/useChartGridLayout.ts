import { useMemo, RefObject } from 'react';
import { PlotResult } from '../../../../observable-plot-generator/types';
import { MIN_GRID_COLUMN_PX, MIN_GRID_ROW_PX, NAMES_BAND_LEFT_PX, VALUES_BAND_LEFT_PX, VALUES_BAND_TOP_PX } from '../../../../config/chartLayoutConfig';
import { YAxisLabelStyle } from '../../../../contexts/VisualizationContext/types';
import {
  computeDynamicYAxisGutterPx,
  computeDynamicXAxisGutterPx,
  computeDynamicYLabelColPx,
  computeTotalContentWidth,
  generateColumnTemplate,
  inferRowSizes,
  generateRowTemplate,
  getActualRowHeights,
} from '../utils/layoutUtils';

export interface LayoutCalculations {
  layoutType: string;
  columns: number;
  rows: number;
  calculatedRowHeightPx: number;
  plotTemplateColumns: string;
  totalContentWidthPx: number;
  inferredRowSizes: Array<number | 'fr'>;
  plotRowsSpec: string;
  actualRowHeights: number[];
  colLevels: any[];
  hasRowFacets: boolean;
  baseCols: number;
  baseRows: number;
  leftLabelsPx: number;
  dynamicYAxisPx: number;
  dynamicXAxisPx: number;
  yLabelColPx: number;
  leftFixedWidthPx: number;
  topHeaderHeight: number;
}

/**
 * Hook for computing all layout-related calculations
 * Memoized to prevent cascading re-renders
 */
export function useChartGridLayout(
  spec: PlotResult | null,
  userCellWidth: number | null,
  userCellHeight: number | null,
  rowHeightPx: number,
  vScrollRef: RefObject<HTMLDivElement>,
  yAxisLabelStyle?: YAxisLabelStyle
): LayoutCalculations | null {
  return useMemo(() => {
    if (!spec || !spec.plots || spec.plots.length === 0) {
      return null;
    }

    const layoutType = spec.layout?.type || 'grid';
    const columns = spec.layout?.columns || 1;
    const rows = spec.layout?.rows || 1;
    const columnSizes = spec.layout?.columnSizes;
    const rowSizes = spec.layout?.rowSizes;
    const minColumnPx = MIN_GRID_COLUMN_PX;

    // CRITICAL: Calculate rowHeightPx synchronously during render
    // This prevents stale height values when faceting changes (e.g., 30 rows → 3 rows)
    // Read container height directly from ref (if available) instead of waiting for ResizeObserver
    let calculatedRowHeightPx = rowHeightPx; // Fallback to state
    if (vScrollRef.current && userCellHeight === null) {
      const availableHeight = vScrollRef.current.clientHeight;
      if (availableHeight > 0) {
        calculatedRowHeightPx = Math.max(MIN_GRID_ROW_PX, Math.floor(availableHeight / Math.max(1, rows)));
      }
    } else if (userCellHeight !== null) {
      calculatedRowHeightPx = userCellHeight;
    }

    if (process.env.NODE_ENV === 'development' && calculatedRowHeightPx !== rowHeightPx) {
      console.log('[ChartGrid] Synchronously calculated rowHeight:', rowHeightPx, '→', calculatedRowHeightPx);
    }

    // Column template
    const plotTemplateColumns = generateColumnTemplate(
      layoutType,
      columns,
      columnSizes,
      userCellWidth,
      minColumnPx
    );

    // Total content width
    const totalContentWidthPx = computeTotalContentWidth(
      columns,
      columnSizes,
      userCellWidth,
      minColumnPx
    );

    // Inferred row sizes
    const inferredRowSizes = inferRowSizes(
      spec,
      rows,
      rowSizes,
      userCellHeight,
      calculatedRowHeightPx
    );

    const plotRowsSpec = generateRowTemplate(inferredRowSizes, calculatedRowHeightPx);
    const actualRowHeights = getActualRowHeights(inferredRowSizes, calculatedRowHeightPx);

    // Facet label helpers
    const colLevels = spec.facetLabels?.colsLevels || [];
    const rowLevels = spec.facetLabels?.rowsLevels || [];
    const hasRowFacets = rowLevels.length > 0;
    const baseCols = spec.facetLabels?.spans?.baseCols || 1;
    const baseRows = spec.facetLabels?.spans?.baseRows || 1;
    const yLevelsCount = rowLevels.length;
    const leftLabelsPx = hasRowFacets ? NAMES_BAND_LEFT_PX + VALUES_BAND_LEFT_PX * yLevelsCount : 0;

    // Dynamic gutters
    const dynamicYAxisPx = computeDynamicYAxisGutterPx(spec, rows);
    const dynamicXAxisPx = computeDynamicXAxisGutterPx(spec, columns);
    const yLabelColPx = computeDynamicYLabelColPx(spec, calculatedRowHeightPx, yAxisLabelStyle);
    const leftFixedWidthPx = leftLabelsPx + yLabelColPx + dynamicYAxisPx;
    const topHeaderHeight = colLevels.length > 0 ? 20 + (colLevels.length * VALUES_BAND_TOP_PX) : 0;

    if (process.env.NODE_ENV === 'development') {
      console.log('[ChartGrid] Layout calculations recomputed:', {
        columns,
        rows,
        rowHeightPx: calculatedRowHeightPx,
        plotRowsSpec,
      });
    }

    return {
      layoutType,
      columns,
      rows,
      calculatedRowHeightPx,
      plotTemplateColumns,
      totalContentWidthPx,
      inferredRowSizes,
      plotRowsSpec,
      actualRowHeights,
      colLevels,
      hasRowFacets,
      baseCols,
      baseRows,
      leftLabelsPx,
      dynamicYAxisPx,
      dynamicXAxisPx,
      yLabelColPx,
      leftFixedWidthPx,
      topHeaderHeight,
    };
  }, [
    spec,
    userCellWidth,
    userCellHeight,
    rowHeightPx,
    vScrollRef,
    yAxisLabelStyle,
  ]);
}
