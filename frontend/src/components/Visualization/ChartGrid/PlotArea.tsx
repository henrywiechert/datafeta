import React, { useCallback, useRef } from 'react';
import { Tooltip } from '@mui/material';
import DoNotDisturbAltIcon from '@mui/icons-material/DoNotDisturbAlt';
import { Field } from '../../../types';
import ObservablePlot from '../ObservablePlot';
import PieSvgRenderer from './renderers/PieSvgRenderer';
import BrushOverlay, { BrushResult } from './BrushOverlay';
import styles from './ChartGrid.module.css';
import { GRID_DIVIDER_COLOR } from '../../../config/chartLayoutConfig';
import { buildPlotGridSizingStyle } from './utils/layoutUtils';
import {
  EmptyGridCellModel,
  GridCellModel,
  GridResultModel,
  hasColumnHeaders,
  hasFacetHeaders,
  MarkGridCellModel,
  PieGridCellModel,
  PlotGridCellModel,
  TextGridCellModel,
} from '../../../observable-plot-generator/gridModel';
import { buildSymbolPreviewLayout, symbolAreaToSideLength } from './utils/discreteGridSymbolLayout';

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
  onCellContextMenu?: (plotId: string, clientX: number, clientY: number) => void;
  autoExpandPinnedComparison?: boolean;
  onAutoExpandPinnedComparisonChange?: (enabled: boolean) => void;
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
  onCellContextMenu,
  autoExpandPinnedComparison,
  onAutoExpandPinnedComparisonChange,
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
                  onCellContextMenu={onCellContextMenu}
                  autoExpandPinnedComparison={autoExpandPinnedComparison}
                  onAutoExpandPinnedComparisonChange={onAutoExpandPinnedComparisonChange}
                />
              );
            case 'pie':
              return (
                <PieCell
                  key={key}
                  cell={cell as PieGridCellModel}
                  onPlotRenderComplete={onPlotRenderComplete}
                  onCellContextMenu={onCellContextMenu}
                />
              );
            case 'text':
              return (
                <TextCell
                  key={key}
                  cell={cell as TextGridCellModel}
                  onCellContextMenu={onCellContextMenu}
                />
              );
            case 'mark':
              return (
                <MarkCell
                  key={key}
                  cell={cell as MarkGridCellModel}
                  onCellContextMenu={onCellContextMenu}
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
  onCellContextMenu?: (plotId: string, clientX: number, clientY: number) => void;
  autoExpandPinnedComparison?: boolean;
  onAutoExpandPinnedComparisonChange?: (enabled: boolean) => void;
}

const PlotCell: React.FC<PlotCellProps> = ({
  cell,
  plotElementsRef,
  onPlotReady,
  onPlotRenderComplete,
  brushDisabled,
  onBrushEnd,
  onCellContextMenu,
  autoExpandPinnedComparison,
  onAutoExpandPinnedComparisonChange,
}) => {
  const facetBg = cell.content.facetBackground;
  const xField = cell.metadata?.xField;
  const yField = cell.metadata?.yField;

  const opts = suppressAxes(cell.content.options, true, true);

  const handleCellBrushEnd = (brush: BrushResult) => {
    const el = plotElementsRef.current[cell.id];
    if (!el || !onBrushEnd) return;
    onBrushEnd({ brush, plotElement: el, xField, yField });
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    onCellContextMenu?.(cell.id, e.clientX, e.clientY);
  };

  return (
    <div className={styles.plotWrapper} style={buildBaseCellStyle(cell)} onContextMenu={handleContextMenu}>
      {facetBg?.isMixed && (
        <Tooltip title="Mixed values in background field" placement="top" arrow>
          <DoNotDisturbAltIcon
            sx={{
              position: 'absolute',
              top: 2,
              right: 2,
              width: 14,
              height: 14,
              color: 'rgba(0, 0, 0, 0.25)',
              zIndex: 1,
            }}
          />
        </Tooltip>
      )}
      <BrushOverlay disabled={brushDisabled} onBrushEnd={handleCellBrushEnd}>
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
      </BrushOverlay>
    </div>
  );
};

interface PieCellProps {
  cell: PieGridCellModel;
  onPlotRenderComplete?: (plotId: string) => void;
  onCellContextMenu?: (plotId: string, clientX: number, clientY: number) => void;
}

const PieCell: React.FC<PieCellProps> = ({ cell, onPlotRenderComplete, onCellContextMenu }) => {
  const facetBg = cell.content.facetBackground;
  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    onCellContextMenu?.(cell.id, e.clientX, e.clientY);
  };

  return (
    <div className={styles.plotWrapper} style={buildBaseCellStyle(cell)} onContextMenu={handleContextMenu}>
      {facetBg?.isMixed && (
        <Tooltip title="Mixed values in background field" placement="top" arrow>
          <DoNotDisturbAltIcon
            sx={{
              position: 'absolute',
              top: 2,
              right: 2,
              width: 14,
              height: 14,
              color: 'rgba(0, 0, 0, 0.25)',
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

interface TextCellProps {
  cell: TextGridCellModel;
  onCellContextMenu?: (plotId: string, clientX: number, clientY: number) => void;
}

const TextCell: React.FC<TextCellProps> = ({ cell, onCellContextMenu }) => {
  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    onCellContextMenu?.(cell.id, e.clientX, e.clientY);
  };

  const rows = cell.content.rows;
  // Tableau-style: a single text row drops the alias and shows just the value.
  // 2+ rows prefix every row with its alias so the user can tell them apart.
  const showAliases = rows.length > 1;

  return (
    <div
      className={styles.textCell}
      style={buildBaseCellStyle(cell)}
      onContextMenu={handleContextMenu}
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
  );
};

interface MarkCellProps {
  cell: MarkGridCellModel;
  onCellContextMenu?: (plotId: string, clientX: number, clientY: number) => void;
}

const MarkCell: React.FC<MarkCellProps> = ({ cell, onCellContextMenu }) => {
  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    onCellContextMenu?.(cell.id, e.clientX, e.clientY);
  };

  const symbols = cell.content.symbols;
  const placements = buildSymbolPreviewLayout(symbols.length);

  return (
    <div
      className={styles.markCell}
      style={buildBaseCellStyle(cell)}
      onContextMenu={handleContextMenu}
    >
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
          return renderSymbolMark(symbol, cx, cy, side, `${cell.id}-symbol-${placement.index}`);
        })}
      </svg>
    </div>
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

// Memoize to prevent re-renders when props haven't changed
// CONSERVATIVE: Be more lenient to avoid missing updates
export default React.memo(PlotArea, (prevProps, nextProps) => {
  if (
    prevProps.plotTemplateColumns !== nextProps.plotTemplateColumns ||
    prevProps.plotRowsSpec !== nextProps.plotRowsSpec ||
    prevProps.totalContentWidthPx !== nextProps.totalContentWidthPx
  ) {
    return false;
  }

  if (prevProps.grid.cells !== nextProps.grid.cells) {
    return false;
  }

  if (prevProps.grid.headers !== nextProps.grid.headers) {
    return false;
  }

  if (prevProps.grid.layout !== nextProps.grid.layout) {
    return false;
  }

  if (prevProps.autoExpandPinnedComparison !== nextProps.autoExpandPinnedComparison) {
    return false;
  }

  return true;
});
