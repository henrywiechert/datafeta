// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { useCallback, useMemo, useRef } from 'react';
import { Tooltip } from '@mui/material';
import DoNotDisturbAltIcon from '@mui/icons-material/DoNotDisturbAlt';
import { Field } from '../../../types';
import ObservablePlot from '../ObservablePlot';
import PieSvgRenderer from './renderers/PieSvgRenderer';
import BrushOverlay, { BrushResult } from './BrushOverlay';
import styles from './ChartGrid.module.css';
import { GRID_DIVIDER_COLOR } from '../../../config/chartLayoutConfig';
import { buildPlotGridSizingStyle } from './utils/layoutUtils';
import { GanttMeasurementResult } from './utils/ganttMeasure';
import { useGanttMeasurement } from './hooks/useGanttMeasurement';
import { T } from '../../../theme/tokens';
import {
  EmptyGridCellModel,
  GridCellModel,
  GridResultModel,
  hasColumnHeaders,
  hasFacetHeaders,
  MarkSymbolSpec,
  PieGridCellModel,
  PlotGridCellModel,
  TableGridCellModel,
} from '../../../observable-plot-generator/gridModel';
import { buildSymbolPreviewLayout, symbolAreaToSideLength } from './utils/discreteGridSymbolLayout';
import { useDoubleTap } from './hooks/useDoubleTap';

export interface PlotBrushEvent {
  brush: BrushResult;
  plotElement: SVGSVGElement | HTMLElement;
  xField?: Field;
  yField?: Field;
}

interface PlotAreaProps {
  grid: GridResultModel;
  plotsTranslateRef: React.RefObject<HTMLDivElement>;
  plotTemplateColumns: string;
  plotRowsSpec: string;
  totalContentWidthPx: number;
  onPlotRenderComplete?: (plotId: string) => void;
  brushDisabled?: boolean;
  onBrushEnd?: (event: PlotBrushEvent) => void;
  /** Enables Alt/Option+drag span measurement (Gantt charts only). */
  isGanttChart?: boolean;
  onCellContextMenu?: (plotId: string, clientX: number, clientY: number) => void;
  /** Touch double tap on a cell (tablet Zoom facet) */
  onCellZoom?: (plotId: string) => void;
  autoExpandPinnedComparison?: boolean;
  onAutoExpandPinnedComparisonChange?: (enabled: boolean) => void;
  /**
   * Current scroll offsets of the synced scroll layers. The plot grid itself
   * is never natively scrolled vertically -- it's translated by `-vertical`
   * to stay in sync with the vertical scroll layer (see useScrollSync) -- so
   * any overlay that must stay pinned within the visible viewport (e.g. the
   * Gantt measurement label) needs these to cancel that translate out.
   */
  horizontalScrollOffset?: number;
  verticalScrollOffset?: number;
}

/**
 * Remove axis labels and axis rendering for external axis display.
 * Preserve grid on measure axes (stable positioning) but disable on category axes (would shift with padding).
 * Force all margins and insets to 0 so plots fill cells exactly with no offset.
 */
function suppressAxes(options: any, hideX: boolean, hideY: boolean) {
  const next = { ...options };
  next.marginLeft = 0;
  next.marginRight = 0;
  next.marginTop = 0;
  next.marginBottom = 0;
  next.inset = 0;
  next.insetLeft = 0;
  next.insetRight = 0;
  next.insetTop = 0;
  next.insetBottom = 0;

  if (hideX) {
    next.x = {
      ...(next.x || {}),
      label: '',
      axis: false,
    };
  }
  if (hideY) {
    next.y = {
      ...(next.y || {}),
      label: '',
      axis: false,
    };
  }
  return next;
}

function buildBaseCellStyle(cell: GridCellModel): React.CSSProperties {
  const facetBg = (cell.content as any).facetBackground;
  return {
    gridColumn: cell.position.col + 1,
    gridRow: cell.position.row + 1,
    borderRight: `1px solid ${GRID_DIVIDER_COLOR}`,
    borderBottom: `1px solid ${GRID_DIVIDER_COLOR}`,
    ...(facetBg?.backgroundColor && !facetBg.isMixed
      ? { backgroundColor: facetBg.backgroundColor }
      : {}),
  };
}

const PlotArea: React.FC<PlotAreaProps> = ({
  grid,
  plotsTranslateRef,
  plotTemplateColumns,
  plotRowsSpec,
  totalContentWidthPx,
  onPlotRenderComplete,
  brushDisabled,
  onBrushEnd,
  isGanttChart,
  onCellContextMenu,
  onCellZoom,
  autoExpandPinnedComparison,
  onAutoExpandPinnedComparisonChange,
  horizontalScrollOffset = 0,
  verticalScrollOffset = 0,
}) => {
  // Store rendered plot elements per cell so the brush can access scales
  const plotElementsRef = useRef<Record<string, SVGSVGElement | HTMLElement>>({});

  const handlePlotReady = useCallback((plotId: string, element: SVGSVGElement | HTMLElement) => {
    plotElementsRef.current[plotId] = element;
  }, []);

  const cells = grid.cells;
  // Mirrors legacy `spec.facetLabels ? 2 : 1` placement: when any facet headers
  // are present, the plot area sits in row 2 below the header row.
  const gridRow = hasFacetHeaders(grid) || hasColumnHeaders(grid) ? 2 : 1;

  return (
    <div style={{ gridColumn: 1, gridRow, overflow: 'hidden', position: 'relative' }}>
      <div
        ref={plotsTranslateRef}
        style={{
          ...buildPlotGridSizingStyle({
            plotTemplateColumns,
            plotRowsSpec,
            totalContentWidthPx,
            columnSizes: grid.layout.columnSizes,
          }),
          willChange: 'transform',
        }}
      >
        {cells.map((cell, index) => {
          const key = cell.id || String(index);
          switch (cell.content.kind) {
            case 'plot':
              return (
                <PlotCell
                  key={key}
                  cell={cell as PlotGridCellModel}
                  plotElementsRef={plotElementsRef}
                  onPlotReady={handlePlotReady}
                  onPlotRenderComplete={onPlotRenderComplete}
                  brushDisabled={brushDisabled}
                  onBrushEnd={onBrushEnd}
                  isGanttChart={isGanttChart}
                  onCellContextMenu={onCellContextMenu}
                  onCellZoom={onCellZoom}
                  autoExpandPinnedComparison={autoExpandPinnedComparison}
                  onAutoExpandPinnedComparisonChange={onAutoExpandPinnedComparisonChange}
                  horizontalScrollOffset={horizontalScrollOffset}
                  verticalScrollOffset={verticalScrollOffset}
                />
              );
            case 'pie':
              return (
                <PieCell
                  key={key}
                  cell={cell as PieGridCellModel}
                  onPlotRenderComplete={onPlotRenderComplete}
                  onCellContextMenu={onCellContextMenu}
                  onCellZoom={onCellZoom}
                />
              );
            case 'table-cell':
              return (
                <TableCell
                  key={key}
                  cell={cell as TableGridCellModel}
                  onCellContextMenu={onCellContextMenu}
                  onCellZoom={onCellZoom}
                />
              );
            case 'empty':
              return (
                <EmptyCell
                  key={key}
                  cell={cell as EmptyGridCellModel}
                />
              );
            default:
              return null;
          }
        })}
      </div>
    </div>
  );
};

interface PlotCellProps {
  cell: PlotGridCellModel;
  plotElementsRef: React.MutableRefObject<Record<string, SVGSVGElement | HTMLElement>>;
  onPlotReady: (plotId: string, element: SVGSVGElement | HTMLElement) => void;
  onPlotRenderComplete?: (plotId: string) => void;
  brushDisabled?: boolean;
  onBrushEnd?: (event: PlotBrushEvent) => void;
  isGanttChart?: boolean;
  onCellContextMenu?: (plotId: string, clientX: number, clientY: number) => void;
  onCellZoom?: (plotId: string) => void;
  autoExpandPinnedComparison?: boolean;
  onAutoExpandPinnedComparisonChange?: (enabled: boolean) => void;
  horizontalScrollOffset?: number;
  verticalScrollOffset?: number;
}

const PlotCell: React.FC<PlotCellProps> = ({
  cell,
  plotElementsRef,
  onPlotReady,
  onPlotRenderComplete,
  brushDisabled,
  onBrushEnd,
  isGanttChart,
  onCellContextMenu,
  onCellZoom,
  autoExpandPinnedComparison,
  onAutoExpandPinnedComparisonChange,
  horizontalScrollOffset = 0,
  verticalScrollOffset = 0,
}) => {
  const facetBg = cell.content.facetBackground;
  const xField = cell.metadata?.xField;
  const yField = cell.metadata?.yField;

  const getPlotElement = useCallback(() => plotElementsRef.current[cell.id], [plotElementsRef, cell.id]);
  const {
    measurement,
    onBrushMove: handleMeasureBrushMove,
    onBrushEnd: handleMeasureBrushEnd,
    onDragStart: handleDragStart,
    onCellClick,
    onGripPointerDown,
  } = useGanttMeasurement({ isGanttChart, getPlotElement, xField, yField });

  // ObservablePlot only skips work when `options` is reference-identical, and a rebuild
  // means re-running Plot.plot() and replacing the SVG. Deriving a fresh object on every
  // render would tie that cost to any re-render of PlotArea, whatever its cause.
  const opts = useMemo(
    () => suppressAxes(cell.content.options, true, true),
    [cell.content.options],
  );

  const handleCellBrushMove = (brush: BrushResult) => {
    handleMeasureBrushMove(brush);
  };

  const handleCellBrushEnd = (brush: BrushResult) => {
    handleMeasureBrushEnd(brush);
    if (brush.gesture === 'measure') return;

    const el = plotElementsRef.current[cell.id];
    if (!el) return;
    onBrushEnd?.({ brush, plotElement: el, xField, yField });
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    onCellContextMenu?.(cell.id, e.clientX, e.clientY);
  };
  const doubleTap = useDoubleTap(onCellZoom && (() => onCellZoom(cell.id)));

  return (
    <div
      className={styles.plotWrapper}
      style={buildBaseCellStyle(cell)}
      onContextMenu={handleContextMenu}
      onClick={isGanttChart ? onCellClick : undefined}
      {...doubleTap}
    >
      {facetBg?.isMixed && (
        <Tooltip title="Mixed values in background field" placement="top" arrow>
          <DoNotDisturbAltIcon
            sx={{
              position: 'absolute',
              top: 2,
              right: 2,
              width: 14,
              height: 14,
              color: T.chartGlyphMuted,
              zIndex: 1,
            }}
          />
        </Tooltip>
      )}
      <BrushOverlay
        disabled={brushDisabled}
        onBrushEnd={handleCellBrushEnd}
        onBrushMove={handleCellBrushMove}
        measureEnabled={isGanttChart}
        onDragStart={handleDragStart}
      >
        <div className={styles.observablePlotContainer}>
          <ObservablePlot
            key={cell.id}
            options={opts}
            plotId={cell.id}
            onRenderComplete={onPlotRenderComplete}
            onPlotReady={(el) => onPlotReady(cell.id, el)}
            autoExpandPinnedComparison={autoExpandPinnedComparison}
            onAutoExpandPinnedComparisonChange={onAutoExpandPinnedComparisonChange}
          />
        </div>
        {measurement && (
          <GanttMeasurementOverlay
            measurement={measurement}
            onGripPointerDown={onGripPointerDown}
            horizontalScrollOffset={horizontalScrollOffset}
            verticalScrollOffset={verticalScrollOffset}
          />
        )}
      </BrushOverlay>
    </div>
  );
};

const GRIP_HIT_WIDTH_PX = 10;
const GRIP_LINE_WIDTH_PX = 1;
/** Distance of the dimension-arrow/label row from the band's near edge. */
const ARROW_OFFSET_PX = 16;
const ARROW_SIZE_PX = 4;
const ARROW_SHAFT_THICKNESS_PX = 1;

/**
 * Snapped span-measurement result: live during an Alt/Option+drag, and
 * persisted afterward with two draggable grips (Perfetto/Chrome-tracing
 * style) to re-anchor either end onto a different bar boundary. A dimension
 * arrow (shaft + outward-pointing arrowheads, coloured per each end's own
 * snapped state) spans the two grips with the distance label sitting on top
 * of it as a rounded pill, breaking the line the way CAD/Figma redlines do.
 */
const GanttMeasurementOverlay: React.FC<{
  measurement: GanttMeasurementResult;
  onGripPointerDown: (end: 'start' | 'end') => (e: React.PointerEvent) => void;
  /** Cancels out the plot grid's scroll translate so the label/arrow stay within the visible viewport. */
  horizontalScrollOffset: number;
  verticalScrollOffset: number;
}> = ({ measurement, onGripPointerDown, horizontalScrollOffset, verticalScrollOffset }) => {
  const { axis, leftPx, rightPx, leftSnapped, rightSnapped, label } = measurement;
  const isX = axis === 'x';
  // The band/grips must stay anchored to the measured data position (correct
  // as-is), but the arrow+label sit at a fixed offset from the chart's near
  // edge rather than at a data position -- on a tall/wide Gantt chart that
  // edge scrolls out of view while the band itself is still visible. Add the
  // current scroll offset back in so they track the visible viewport edge
  // instead of the full (possibly off-screen) content edge.
  const arrowCrossAxisOffsetPx = ARROW_OFFSET_PX + (isX ? verticalScrollOffset : horizontalScrollOffset);
  const leftColor = leftSnapped ? T.statusSuccess : T.chartGlyphMuted;
  const rightColor = rightSnapped ? T.statusSuccess : T.chartGlyphMuted;
  const midPx = (leftPx + rightPx) / 2;

  const bandStyle: React.CSSProperties = {
    position: 'absolute',
    left: isX ? leftPx : 0,
    top: isX ? 0 : leftPx,
    width: isX ? rightPx - leftPx : '100%',
    height: isX ? '100%' : rightPx - leftPx,
    backgroundColor: T.chartBrushFill,
    pointerEvents: 'none',
    zIndex: 3,
  };

  // The arrow's own local box: spans left→right (or top→bottom), a fixed
  // offset from the band's near edge. Shaft + arrowheads are positioned
  // relative to THIS box so each half can carry its own endpoint's colour.
  const arrowTrackStyle: React.CSSProperties = isX
    ? { position: 'absolute', left: leftPx, top: arrowCrossAxisOffsetPx, width: rightPx - leftPx, height: 0, pointerEvents: 'none', zIndex: 4 }
    : { position: 'absolute', top: leftPx, left: arrowCrossAxisOffsetPx, height: rightPx - leftPx, width: 0, pointerEvents: 'none', zIndex: 4 };
  const shaftStyle: React.CSSProperties = isX
    ? { position: 'absolute', left: 0, right: 0, top: -ARROW_SHAFT_THICKNESS_PX / 2, height: ARROW_SHAFT_THICKNESS_PX, background: `linear-gradient(to right, ${leftColor}, ${rightColor})` }
    : { position: 'absolute', top: 0, bottom: 0, left: -ARROW_SHAFT_THICKNESS_PX / 2, width: ARROW_SHAFT_THICKNESS_PX, background: `linear-gradient(to bottom, ${leftColor}, ${rightColor})` };
  // CSS border-triangle trick: the colored side is the triangle's flat base,
  // the two transparent sides taper it to a point opposite that base.
  const nearArrowheadStyle: React.CSSProperties = isX
    ? { position: 'absolute', left: 0, top: 0, width: 0, height: 0, transform: 'translate(0, -50%)', borderTop: `${ARROW_SIZE_PX}px solid transparent`, borderBottom: `${ARROW_SIZE_PX}px solid transparent`, borderRight: `${ARROW_SIZE_PX + 1}px solid ${leftColor}` }
    : { position: 'absolute', top: 0, left: 0, width: 0, height: 0, transform: 'translate(-50%, 0)', borderLeft: `${ARROW_SIZE_PX}px solid transparent`, borderRight: `${ARROW_SIZE_PX}px solid transparent`, borderBottom: `${ARROW_SIZE_PX + 1}px solid ${leftColor}` };
  const farArrowheadStyle: React.CSSProperties = isX
    ? { position: 'absolute', right: 0, top: 0, width: 0, height: 0, transform: 'translate(0, -50%)', borderTop: `${ARROW_SIZE_PX}px solid transparent`, borderBottom: `${ARROW_SIZE_PX}px solid transparent`, borderLeft: `${ARROW_SIZE_PX + 1}px solid ${rightColor}` }
    : { position: 'absolute', bottom: 0, left: 0, width: 0, height: 0, transform: 'translate(-50%, 0)', borderLeft: `${ARROW_SIZE_PX}px solid transparent`, borderRight: `${ARROW_SIZE_PX}px solid transparent`, borderTop: `${ARROW_SIZE_PX + 1}px solid ${rightColor}` };

  const labelStyle: React.CSSProperties = {
    position: 'absolute',
    left: isX ? midPx : arrowCrossAxisOffsetPx,
    top: isX ? arrowCrossAxisOffsetPx : midPx,
    transform: 'translate(-50%, -50%)',
    background: T.inverseSurface,
    color: T.inverseText,
    border: `1px solid ${T.inverseBorder}`,
    boxShadow: `0 1px 4px ${T.shadowStrong}`,
    fontSize: 11,
    fontWeight: 600,
    padding: '3px 8px',
    borderRadius: 999,
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
    zIndex: 5,
  };

  const gripHitStyle = (px: number): React.CSSProperties => ({
    position: 'absolute',
    left: isX ? px - GRIP_HIT_WIDTH_PX / 2 : 0,
    top: isX ? 0 : px - GRIP_HIT_WIDTH_PX / 2,
    width: isX ? GRIP_HIT_WIDTH_PX : '100%',
    height: isX ? '100%' : GRIP_HIT_WIDTH_PX,
    cursor: isX ? 'ew-resize' : 'ns-resize',
    pointerEvents: 'auto',
    zIndex: 6,
  });
  const gripLineStyle = (snapped: boolean, color: string): React.CSSProperties => ({
    position: 'absolute',
    left: isX ? (GRIP_HIT_WIDTH_PX - GRIP_LINE_WIDTH_PX) / 2 : 0,
    top: isX ? 0 : (GRIP_HIT_WIDTH_PX - GRIP_LINE_WIDTH_PX) / 2,
    width: isX ? GRIP_LINE_WIDTH_PX : '100%',
    height: isX ? '100%' : GRIP_LINE_WIDTH_PX,
    backgroundColor: color,
    opacity: snapped ? 1 : 0.6,
    pointerEvents: 'none',
  });

  return (
    <>
      <div style={bandStyle} />
      <div style={arrowTrackStyle}>
        <div style={shaftStyle} />
        <div style={nearArrowheadStyle} />
        <div style={farArrowheadStyle} />
      </div>
      <div style={labelStyle}>{label}</div>
      <div style={gripHitStyle(leftPx)} onPointerDown={onGripPointerDown('start')} onClick={(e) => e.stopPropagation()}>
        <div style={gripLineStyle(leftSnapped, leftColor)} />
      </div>
      <div style={gripHitStyle(rightPx)} onPointerDown={onGripPointerDown('end')} onClick={(e) => e.stopPropagation()}>
        <div style={gripLineStyle(rightSnapped, rightColor)} />
      </div>
    </>
  );
};

interface PieCellProps {
  cell: PieGridCellModel;
  onPlotRenderComplete?: (plotId: string) => void;
  onCellContextMenu?: (plotId: string, clientX: number, clientY: number) => void;
  onCellZoom?: (plotId: string) => void;
}

const PieCell: React.FC<PieCellProps> = ({ cell, onPlotRenderComplete, onCellContextMenu, onCellZoom }) => {
  const facetBg = cell.content.facetBackground;
  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    onCellContextMenu?.(cell.id, e.clientX, e.clientY);
  };
  const doubleTap = useDoubleTap(onCellZoom && (() => onCellZoom(cell.id)));

  return (
    <div className={styles.plotWrapper} style={buildBaseCellStyle(cell)} onContextMenu={handleContextMenu} {...doubleTap}>
      {facetBg?.isMixed && (
        <Tooltip title="Mixed values in background field" placement="top" arrow>
          <DoNotDisturbAltIcon
            sx={{
              position: 'absolute',
              top: 2,
              right: 2,
              width: 14,
              height: 14,
              color: T.chartGlyphMuted,
              zIndex: 1,
            }}
          />
        </Tooltip>
      )}
      <div className={styles.observablePlotContainer}>
        <PieSvgRenderer
          pieSpec={cell.content.pieSpec}
          tooltipConfig={cell.content.tooltipConfig}
          plotId={cell.id}
          onRenderComplete={onPlotRenderComplete}
        />
      </div>
    </div>
  );
};

interface TableCellProps {
  cell: TableGridCellModel;
  onCellContextMenu?: (plotId: string, clientX: number, clientY: number) => void;
  onCellZoom?: (plotId: string) => void;
}

/**
 * Combined table cell: symbols (Tableau "Marks") and text rows (Tableau
 * "Label"/"Text") coexist in the same cell. The symbol fills the cell as a
 * background layer and the text is centered on top of it (z-stacked); when
 * only one is present the cell behaves like a pure symbol or pure text cell.
 * Text size follows the Labels font-size slider via `content.fontSize`.
 */
const TableCell: React.FC<TableCellProps> = ({ cell, onCellContextMenu, onCellZoom }) => {
  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    onCellContextMenu?.(cell.id, e.clientX, e.clientY);
  };
  const doubleTap = useDoubleTap(onCellZoom && (() => onCellZoom(cell.id)));

  const { symbols, rows, fontSize } = cell.content;
  const hasSymbols = symbols.length > 0;
  const hasText = rows.length > 0;
  // Tableau-style: a single text row drops the alias and shows just the value.
  // 2+ rows prefix every row with its alias so the user can tell them apart.
  const showAliases = rows.length > 1;

  return (
    <div
      className={styles.tableCell}
      style={buildBaseCellStyle(cell)}
      onContextMenu={handleContextMenu}
      {...doubleTap}
    >
      {hasSymbols && <SymbolStack symbols={symbols} idPrefix={cell.id} />}
      {hasText && (
        <div
          className={styles.tableCellText}
          style={fontSize !== undefined ? { fontSize: `${fontSize}px` } : undefined}
        >
          {rows.map((row, idx) => (
            <span
              key={`${cell.id}-row-${idx}`}
              className={styles.textRow}
              title={`${row.label}: ${row.value}`}
              style={row.source === 'measure' ? { fontVariantNumeric: 'tabular-nums' } : undefined}
            >
              {showAliases ? `${row.label}: ${row.value}` : row.value}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

interface SymbolStackProps {
  symbols: MarkSymbolSpec[];
  idPrefix: string;
}

const SymbolStack: React.FC<SymbolStackProps> = ({ symbols, idPrefix }) => {
  const placements = buildSymbolPreviewLayout(symbols.length);
  return (
    <svg
      className={styles.symbolPreviewStack}
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      {placements.map((placement) => {
        const symbol = symbols[placement.index];
        const cx = placement.cx * 100;
        const cy = placement.cy * 100;
        const side = symbolAreaToSideLength(symbol.size) * placement.scale;
        return renderSymbolMark(symbol, cx, cy, side, `${idPrefix}-symbol-${placement.index}`);
      })}
    </svg>
  );
};

function renderSymbolMark(
  symbol: { symbol: string; color: string; opacity?: number },
  cx: number,
  cy: number,
  side: number,
  key: string,
): React.ReactNode {
  const half = side / 2;
  const fill = symbol.color;
  const opacity = symbol.opacity ?? 1;
  const common = { className: styles.symbolMark, fill, opacity };
  switch (symbol.symbol) {
    case 'square':
      return (
        <rect
          key={key}
          {...common}
          x={cx - half}
          y={cy - half}
          width={side}
          height={side}
        />
      );
    case 'triangle':
      return (
        <polygon
          key={key}
          {...common}
          points={`${cx},${cy - half} ${cx + half},${cy + half} ${cx - half},${cy + half}`}
        />
      );
    case 'diamond':
      return (
        <polygon
          key={key}
          {...common}
          points={`${cx},${cy - half} ${cx + half},${cy} ${cx},${cy + half} ${cx - half},${cy}`}
        />
      );
    case 'cross':
    case 'plus':
      return (
        <g key={key} {...common}>
          <rect x={cx - half} y={cy - side * 0.18} width={side} height={side * 0.36} />
          <rect x={cx - side * 0.18} y={cy - half} width={side * 0.36} height={side} />
        </g>
      );
    case 'circle':
    default:
      return <circle key={key} {...common} cx={cx} cy={cy} r={half} />;
  }
}

interface EmptyCellProps {
  cell: EmptyGridCellModel;
}

const EmptyCell: React.FC<EmptyCellProps> = ({ cell }) => {
  return <div className={styles.emptyCell} style={buildBaseCellStyle(cell)} />;
};

// Memoize to prevent re-renders when props haven't changed. Use the default
// shallow comparator so newly-added props are checked automatically. A previous
// partial comparator ignored callback props and risked silently skipping
// updates when those callbacks carried fresh state.
export default React.memo(PlotArea);
