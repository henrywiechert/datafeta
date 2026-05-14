// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import * as Plot from '@observablehq/plot';
import ObservablePlot from '../ObservablePlot';
import { GridResultModel, getPlotGridCellAtRow } from '../../../observable-plot-generator/gridModel';
import { MIN_GRID_ROW_PX, GRID_DIVIDER_COLOR } from '../../../config/chartLayoutConfig';
import { TEXT_PX_PER_CHAR } from './utils/layoutUtils';

interface YAxesProps {
  grid: GridResultModel;
  rows: number;
  dynamicYAxisPx: number;
  rowHeights: number[]; // actual track heights in px per row
  hasRowFacets: boolean;
}

/**
 * Build axis-only plot options for external gutters.
 */
function buildYAxisOptions(
  domain: any,
  gutterPx: number,
  type?: string,
  padding?: number,
  ticks?: any,
  tickFormat?: any,
) {
  const isCategorical = type === 'band';

  const first = Array.isArray(domain) ? domain[0] : undefined;
  const isDateString = typeof first === 'string' && /^\d{4}-\d{2}-\d{2}/.test(first);
  const isDateRange = !isCategorical && Array.isArray(domain) && domain.length === 2 &&
    ((first instanceof Date || domain[1] instanceof Date) || isDateString);

  return {
    frame: null,
    marginLeft: Math.max(12, gutterPx - 2),
    marginRight: 0,
    marginTop: 0,
    marginBottom: 0,
    inset: 0,
    x: { axis: null },
    y: {
      label: '',
      domain: domain ?? [0, 1],
      type: isCategorical ? 'band' : (isDateRange ? 'utc' : undefined),
      labelArrow: null,
      nice: false,
      ...(padding !== undefined && isCategorical ? { padding } : {}),
      ...(ticks !== undefined ? { ticks } : {}),
      ...(tickFormat !== undefined ? { tickFormat } : {}),
    },
    marks: [Plot.axisY()],
  } as any;
}

const YAxes: React.FC<YAxesProps> = ({ grid, rows, dynamicYAxisPx, rowHeights, hasRowFacets }) => {
  const tickLineWidth = Math.max(3, Math.floor((dynamicYAxisPx - 8) / TEXT_PX_PER_CHAR));

  return (
    <>
      {/* Left external y-axes gutter */}
      {Array.from({ length: rows }).map((_, r) => {
        const sample = getPlotGridCellAtRow(grid, r);
        const yDomain = (sample?.content.options as any)?.y?.domain;
        const yType = (sample?.content.options as any)?.y?.type;
        const yPadding = (sample?.content.options as any)?.y?.padding;
        const yTicks = (sample?.content.options as any)?.y?.ticks;
        const yTickFormat = (sample?.content.options as any)?.y?.tickFormat;
        const trackHeightPx = Math.max(1, rowHeights[r] ?? MIN_GRID_ROW_PX);
        return (
          <div
            key={`y-axis-${r}`}
            style={{
              gridColumn: hasRowFacets ? 3 : 2,
              gridRow: r + 1,
              overflow: 'hidden',
              position: 'relative',
              borderBottom: r < rows - 1 ? `1px solid ${GRID_DIVIDER_COLOR}` : undefined,
            }}
          >
            <ObservablePlot options={{ ...buildYAxisOptions(yDomain, dynamicYAxisPx, yType, yPadding, yTicks, yTickFormat), height: trackHeightPx, marks: [Plot.axisY({ ...(yTicks !== undefined ? { ticks: yTicks } : {}), ...(yTickFormat !== undefined ? { tickFormat: yTickFormat } : {}), ...(yType === 'band' ? { textOverflow: 'ellipsis', lineWidth: tickLineWidth } : {}) })] as any }} />
          </div>
        );
      })}
    </>
  );
};

// Memoize to prevent re-renders when props haven't changed
export default React.memo(YAxes, (prevProps, nextProps) => {
  if (
    prevProps.rows !== nextProps.rows ||
    prevProps.dynamicYAxisPx !== nextProps.dynamicYAxisPx ||
    prevProps.hasRowFacets !== nextProps.hasRowFacets
  ) {
    return false;
  }

  if (prevProps.rowHeights !== nextProps.rowHeights) {
    if (prevProps.rowHeights.length !== nextProps.rowHeights.length) {
      return false;
    }
    for (let i = 0; i < prevProps.rowHeights.length; i++) {
      if (prevProps.rowHeights[i] !== nextProps.rowHeights[i]) {
        return false;
      }
    }
  }

  if (prevProps.grid.cells !== nextProps.grid.cells) {
    return false;
  }

  return true;
});
