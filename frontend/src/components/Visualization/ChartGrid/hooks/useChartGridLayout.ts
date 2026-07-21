// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { useMemo, RefObject } from 'react';
import { GridResultModel } from '../../../../observable-plot-generator/gridModel';
import {
  MIN_GRID_COLUMN_PX,
  MIN_GRID_ROW_PX,
  NAMES_BAND_LEFT_PX,
  TABLE_MEASURE_BAND_COL_PX,
  TABLE_MEASURE_BAND_ROW_PX,
  TABLE_NAMES_BAND_LEFT_PX,
  TABLE_VALUES_BAND_LEFT_PX,
  TABLE_VALUES_BAND_TOP_PX,
  VALUES_BAND_LEFT_PX,
  VALUES_BAND_TOP_PX,
} from '../../../../config/chartLayoutConfig';
import { YAxisLabelStyle, FacetLabelStyles, CategoryTickStyles } from '../../../../contexts/VisualizationContext/types';
import { UserChartType } from '../../../../types';
import {
  computeAutoFacetLeftHeaderWidth,
  computeAutoFacetLeftValueWidths,
  computeAutoFacetTopHeaderHeight,
  computeAutoFacetTopValueHeights,
  computeDynamicYAxisGutterPx,
  computeDynamicXAxisGutterPx,
  computeDynamicYLabelColPx,
  computeTotalContentWidth,
  generateColumnTemplate,
  getEffectiveFacetLabelStyles,
  inferRowSizes,
  generateRowTemplate,
  getActualRowHeights,
  resolveFacetLeftValueWidths,
  resolveFacetTopValueHeights,
  sumTrackSizes,
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
  // Facet dimension overrides (for styling)
  facetTopHeaderPx: number;
  facetLeftHeaderPx: number;
  facetLeftValuesPx: number;
  facetTopValuesPx: number;
  facetLeftValueWidthsPx: number[];
  facetTopValueHeightsPx: number[];
  /** Width (px) of each Y-axis measure value column (Tableau "Measure Values"). */
  yMeasureBandWidthsPx: number[];
  /** Height (px) of each X-axis measure value row. */
  xMeasureBandHeightsPx: number[];
}

/**
 * Hook for computing all layout-related calculations
 * Memoized to prevent cascading re-renders
 */
export function useChartGridLayout(
  grid: GridResultModel | null,
  userCellWidth: number | null,
  userCellHeight: number | null,
  rowHeightPx: number,
  vScrollRef: RefObject<HTMLDivElement>,
  yAxisLabelStyle?: YAxisLabelStyle,
  facetLabelStyles?: FacetLabelStyles,
  categoryTickStyles?: CategoryTickStyles,
  globalChartType?: UserChartType | null,
): LayoutCalculations | null {
  return useMemo(() => {
    if (!grid || grid.cells.length === 0) {
      return null;
    }

    const layoutType = grid.layout?.type || 'grid';
    const columns = grid.layout?.columns || 1;
    const rows = grid.layout?.rows || 1;
    const columnSizes = grid.layout?.columnSizes;
    const rowSizes = grid.layout?.rowSizes;
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
      grid,
      rows,
      rowSizes,
      userCellHeight,
      calculatedRowHeightPx
    );

    const plotRowsSpec = generateRowTemplate(inferredRowSizes, calculatedRowHeightPx);
    const actualRowHeights = getActualRowHeights(inferredRowSizes, calculatedRowHeightPx);

    // Facet label helpers
    const colLevels = grid.headers?.cols?.levels || [];
    const rowLevels = grid.headers?.rows?.levels || [];
    const hasRowFacets = rowLevels.length > 0;
    const baseCols = grid.headers?.cols?.baseSpan || 1;
    const baseRows = grid.headers?.rows?.baseSpan || 1;
    const yLevelsCount = rowLevels.length;
    const effectiveFacetLabelStyles = getEffectiveFacetLabelStyles(facetLabelStyles, globalChartType);
    const isTableGrid = globalChartType === 'table-refactor';

    const leftHeaderFallbackPx = isTableGrid
      ? computeAutoFacetLeftHeaderWidth(
          rowLevels.map((level) => level.fieldLabel),
          effectiveFacetLabelStyles?.leftHeader ?? {
            fontSize: 12,
            orientation: 'vertical',
          },
          TABLE_NAMES_BAND_LEFT_PX,
        )
      : NAMES_BAND_LEFT_PX;
    const topHeaderFallbackPx = isTableGrid
      ? computeAutoFacetTopHeaderHeight(
          colLevels.map((level) => level.fieldLabel),
          effectiveFacetLabelStyles?.topHeader ?? {
            fontSize: 12,
            orientation: 'horizontal',
          },
          VALUES_BAND_TOP_PX,
        )
      : 20;
    const leftValueFallbackPx = computeAutoFacetLeftValueWidths(
      rowLevels,
      effectiveFacetLabelStyles?.leftValues ?? {
        fontSize: 10,
        orientation: 'horizontal',
        widthPx: null,
      },
      isTableGrid ? TABLE_VALUES_BAND_LEFT_PX : VALUES_BAND_LEFT_PX,
    );
    const topValueFallbackPx = isTableGrid
      ? computeAutoFacetTopValueHeights(
          colLevels,
          effectiveFacetLabelStyles?.topValues ?? {
            fontSize: 10,
            orientation: 'horizontal',
            heightPx: null,
          },
          TABLE_VALUES_BAND_TOP_PX,
        )
      : VALUES_BAND_TOP_PX;

    // Facet dimensions - use style overrides or fall back to constants
    const facetLeftHeaderPx = effectiveFacetLabelStyles?.leftHeader.widthPx ?? leftHeaderFallbackPx;
    const facetLeftValuesPx = effectiveFacetLabelStyles?.leftValues.widthPx ?? (leftValueFallbackPx[0] ?? VALUES_BAND_LEFT_PX);
    const facetTopValuesPx = effectiveFacetLabelStyles?.topValues.heightPx ?? (Array.isArray(topValueFallbackPx) ? topValueFallbackPx[0] ?? VALUES_BAND_TOP_PX : topValueFallbackPx);
    const facetLeftValueWidthsPx = resolveFacetLeftValueWidths(
      yLevelsCount,
      effectiveFacetLabelStyles?.leftValues,
      leftValueFallbackPx,
    );
    const facetTopValueHeightsPx = resolveFacetTopValueHeights(
      colLevels.length,
      effectiveFacetLabelStyles?.topValues,
      topValueFallbackPx,
    );

    // Axis-measure value bands (table-refactor only). A Y measure renders as a
    // value column in the left fixed area; an X measure as a value row in the
    // top header area. Gated on facet headers being present so the band tracks
    // land in reserved layout space (left/top zones) rather than over the body.
    const facetHeadersPresent = Boolean(grid.headers);
    const yMeasureBands = facetHeadersPresent ? (grid.measureBands?.rows ?? []) : [];
    const xMeasureBands = facetHeadersPresent ? (grid.measureBands?.cols ?? []) : [];
    const measureBandColWidths = effectiveFacetLabelStyles?.measureBands?.colWidthsPx;
    const measureBandRowHeights = effectiveFacetLabelStyles?.measureBands?.rowHeightsPx;
    const yMeasureBandWidthsPx = yMeasureBands.map((_, i) => measureBandColWidths?.[i] ?? TABLE_MEASURE_BAND_COL_PX);
    const xMeasureBandHeightsPx = xMeasureBands.map((_, i) => measureBandRowHeights?.[i] ?? TABLE_MEASURE_BAND_ROW_PX);
    const yMeasureBandTotalPx = sumTrackSizes(yMeasureBandWidthsPx);
    const xMeasureBandTotalPx = sumTrackSizes(xMeasureBandHeightsPx);

    const leftLabelsPx = (hasRowFacets ? facetLeftHeaderPx + sumTrackSizes(facetLeftValueWidthsPx) : 0)
      + yMeasureBandTotalPx;

    // Dynamic gutters
    const dynamicYAxisPx = computeDynamicYAxisGutterPx(grid, rows, categoryTickStyles?.yWidthPx ?? null);
    const dynamicXAxisPx = computeDynamicXAxisGutterPx(grid, columns, categoryTickStyles?.xHeightPx ?? null);
    const yLabelColPx = computeDynamicYLabelColPx(grid, calculatedRowHeightPx, yAxisLabelStyle);
    const leftFixedWidthPx = leftLabelsPx + yLabelColPx + dynamicYAxisPx;
    const facetTopHeaderPx = colLevels.length > 0 ? topHeaderFallbackPx : 0;
    const dimTopHeaderHeight = colLevels.length > 0 ? facetTopHeaderPx + sumTrackSizes(facetTopValueHeightsPx) : 0;
    // Reserve a thin strip for Y-measure band names when there is no column
    // header band to host them.
    const topHeaderHeight = yMeasureBandWidthsPx.length > 0
      ? Math.max(dimTopHeaderHeight + xMeasureBandTotalPx, TABLE_VALUES_BAND_TOP_PX)
      : dimTopHeaderHeight + xMeasureBandTotalPx;

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
      facetTopHeaderPx,
      facetLeftHeaderPx,
      facetLeftValuesPx,
      facetTopValuesPx,
      facetLeftValueWidthsPx,
      facetTopValueHeightsPx,
      yMeasureBandWidthsPx,
      xMeasureBandHeightsPx,
    };
  }, [
    grid,
    userCellWidth,
    userCellHeight,
    rowHeightPx,
    vScrollRef,
    yAxisLabelStyle,
    facetLabelStyles,
    categoryTickStyles,
    globalChartType,
  ]);
}
