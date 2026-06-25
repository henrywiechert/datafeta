// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { useState, useCallback } from 'react';
import * as Plot from '@observablehq/plot';
import ObservablePlot from '../ObservablePlot';
import { GridResultModel, getPlotGridCellAtCol, getXAxisLabelAtCol, hasFacetHeaders } from '../../../observable-plot-generator/gridModel';
import { GRID_DIVIDER_COLOR, X_LABEL_ROW_PX } from '../../../config/chartLayoutConfig';
import AxisLabel from './AxisLabel';
import AxisLabelStylePopover from './AxisLabelStylePopover';
import { XAxisLabelStyle } from '../../../contexts/VisualizationContext/types';
import { TEXT_PX_PER_CHAR } from './utils/layoutUtils';

interface XAxesProps {
  grid: GridResultModel;
  columns: number;
  plotTemplateColumns: string;
  totalContentWidthPx: number;
  dynamicXAxisPx: number;
  /** Lifted from VisualizationContext so this memoized component isn't invalidated by unrelated reducer changes. */
  xAxisLabelStyle: XAxisLabelStyle;
  onXAxisLabelStyleChange: (updates: Partial<XAxisLabelStyle>) => void;
  /**
   * When false, the tick-scale row is skipped and only the bottom label row is
   * rendered. Used by axis-less charts (e.g. pie) that still want the shared
   * measure-field label header without numeric/categorical tick axes.
   */
  renderScales?: boolean;
}

function buildXAxisOptions(
  label: string | undefined,
  domain: any,
  gutterPx: number,
  type?: string,
  padding?: number,
  ticks?: any,
  tickFormat?: any,
) {
  // If the cell options explicitly say 'band', respect that — it's a categorical
  // axis regardless of whether the values look like dates.
  const isCategorical = type === 'band';

  const first = Array.isArray(domain) ? domain[0] : undefined;
  const isDateString = typeof first === 'string' && /^\d{4}-\d{2}-\d{2}/.test(first);
  const isDateRange = !isCategorical && Array.isArray(domain) && domain.length === 2 &&
    ((first instanceof Date || domain[1] instanceof Date) || isDateString);

  // For categorical band scales with many items (like timeline timestamps),
  // limit the number of ticks to avoid overcrowding.
  const domainLength = Array.isArray(domain) ? domain.length : 0;
  const maxTicksForBand = isCategorical && domainLength > 10 ? Math.min(20, Math.ceil(domainLength / 2)) : undefined;

  return {
    frame: null,
    height: Math.max(16, gutterPx),
    marginLeft: 0,
    marginRight: 0,
    marginTop: 0,
    marginBottom: Math.max(12, gutterPx - 2),
    inset: 0,
    y: { axis: null },
    x: {
      label: '',
      domain: domain ?? [0, 1],
      type: isCategorical ? 'band' : (isDateRange ? 'utc' : undefined),
      labelArrow: null,
      nice: false,
      ...(padding !== undefined && isCategorical ? { padding } : {}),
      ...(ticks !== undefined ? { ticks } : {}),
      ...(tickFormat !== undefined ? { tickFormat } : {}),
      ...(maxTicksForBand ? { ticks: maxTicksForBand } : {}),
    },
    marks: [Plot.axisX()],
  } as any;
}

const XAxes: React.FC<XAxesProps> = ({
  grid,
  columns,
  plotTemplateColumns,
  totalContentWidthPx,
  dynamicXAxisPx,
  xAxisLabelStyle,
  onXAxisLabelStyleChange,
  renderScales = true,
}) => {
  const [xLabelPopoverAnchor, setXLabelPopoverAnchor] = useState<HTMLElement | null>(null);

  const handleXLabelClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    setXLabelPopoverAnchor(event.currentTarget);
  }, []);

  const handleXLabelPopoverClose = useCallback(() => {
    setXLabelPopoverAnchor(null);
  }, []);

  const facetPresent = hasFacetHeaders(grid);
  const colSizes = grid.layout?.columnSizes;
  const hasFlexible = !colSizes || colSizes.some((c) => typeof c !== 'number');
  const containerWidthStyle = hasFlexible ? '100%' : `${totalContentWidthPx}px`;
  const tickLineWidth = Math.max(2, Math.floor((dynamicXAxisPx - 8) / TEXT_PX_PER_CHAR));

  return (
    <>
      {/* Bottom X scales */}
      {renderScales && (
      <div style={{ gridColumn: 1, gridRow: facetPresent ? 3 : 2 }}>
        <div style={{ display: 'grid', gridTemplateColumns: plotTemplateColumns, minWidth: `${totalContentWidthPx}px`, width: containerWidthStyle }}>
          {Array.from({ length: columns }).map((_, c) => {
            const sample = getPlotGridCellAtCol(grid, c);
            const xLabel = (sample?.content.options as any)?.x?.label;
            const xDomain = (sample?.content.options as any)?.x?.domain;
            const xType = (sample?.content.options as any)?.x?.type;
            const xPadding = (sample?.content.options as any)?.x?.padding;
            const xTicks = (sample?.content.options as any)?.x?.ticks;
            const xTickFormat = (sample?.content.options as any)?.x?.tickFormat;
            const xRotate = xType === 'band' ? -90 : 0;
            return (
              <div
                key={`x-axis-${c}`}
                style={{
                  gridColumn: c + 1,
                  borderRight: c < columns - 1 ? `1px solid ${GRID_DIVIDER_COLOR}` : undefined,
                  borderTop: `1px solid ${GRID_DIVIDER_COLOR}`,
                }}
              >
                <ObservablePlot options={{ ...buildXAxisOptions(xLabel, xDomain, dynamicXAxisPx, xType, xPadding, xTicks, xTickFormat), marks: [Plot.axisX({ tickRotate: xRotate as any, ...(xTicks !== undefined ? { ticks: xTicks } : {}), ...(xTickFormat !== undefined ? { tickFormat: xTickFormat } : {}), ...(xType === 'band' ? { textOverflow: 'ellipsis', lineWidth: tickLineWidth } : {}) })] as any }} />
              </div>
            );
          })}
        </div>
      </div>
      )}

      {/* Bottom X labels */}
      <div style={{ gridColumn: 1, gridRow: facetPresent ? 5 : 4 }}>
        <div style={{ display: 'grid', gridTemplateColumns: plotTemplateColumns, minWidth: `${totalContentWidthPx}px`, width: containerWidthStyle }}>
          {Array.from({ length: columns }).map((_, c) => {
            const xLabel = getXAxisLabelAtCol(grid, c);
            return (
              <div
                key={`x-label-${c}`}
                style={{
                  gridColumn: c + 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '2px',
                  textAlign: 'center',
                  minHeight: `${X_LABEL_ROW_PX}px`,
                }}
              >
                <AxisLabel
                  label={xLabel || ''}
                  axis="x"
                  style={xAxisLabelStyle}
                  onClick={handleXLabelClick}
                />
              </div>
            );
          })}
        </div>
      </div>

      <AxisLabelStylePopover
        anchorEl={xLabelPopoverAnchor}
        onClose={handleXLabelPopoverClose}
        axis="x"
        style={xAxisLabelStyle}
        onChange={onXAxisLabelStyleChange}
      />
    </>
  );
};

// Memoize to prevent re-renders when props haven't changed
export default React.memo(XAxes, (prevProps, nextProps) => {
  return (
    prevProps.columns === nextProps.columns &&
    prevProps.plotTemplateColumns === nextProps.plotTemplateColumns &&
    prevProps.totalContentWidthPx === nextProps.totalContentWidthPx &&
    prevProps.dynamicXAxisPx === nextProps.dynamicXAxisPx &&
    prevProps.renderScales === nextProps.renderScales &&
    prevProps.grid.cells === nextProps.grid.cells &&
    prevProps.grid.headers === nextProps.grid.headers &&
    prevProps.grid.layout === nextProps.grid.layout &&
    prevProps.xAxisLabelStyle === nextProps.xAxisLabelStyle &&
    prevProps.onXAxisLabelStyleChange === nextProps.onXAxisLabelStyleChange
  );
});
