import React, { useCallback } from 'react';
import { CellSizeOverrides } from './hooks/useCellSizeOverrides';
import { GridLayoutModel } from '../../../observable-plot-generator/gridModel';

/**
 * Step factors for +/- buttons: each click multiplies the current size by this factor.
 * SHRINK_FACTOR = 0.7 means ~3 clicks to halve, GROW_FACTOR = 1.4 means ~3 clicks to double.
 */
const SHRINK_FACTOR = 0.7;
const GROW_FACTOR = 1.4;

interface HeatmapSizeControlProps {
  cellSizeOverrides: CellSizeOverrides;
  layout: GridLayoutModel;
  /** Available plot area width (container minus fixed axis widths and scrollbar gutter). */
  availableContentWidth: number;
  /** Available plot area height (container minus axis bands and scrollbar gutter). */
  availableContentHeight: number;
}

const baseButtonStyle: React.CSSProperties = {
  backgroundColor: '#f8f8f8',
  border: '1px solid #ccc',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '12px',
  fontWeight: 500,
  color: '#333',
  padding: '3px 7px',
  lineHeight: 1,
};

const labelStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  color: '#555',
  userSelect: 'none',
  marginRight: 2,
};

const sizeDisplayStyle: React.CSSProperties = {
  fontSize: '11px',
  color: '#333',
  fontFamily: 'monospace',
  minWidth: 36,
  textAlign: 'center',
  userSelect: 'none',
};

/**
 * Floating control panel for heatmaps providing +/- steppers for column width and row height,
 * and a "Fit" button to size all facet panels to fill the visible area.
 *
 * Rendered at top-left of the chart container, only when globalChartType === 'heatmap'.
 */
export function HeatmapSizeControl({
  cellSizeOverrides,
  layout,
  availableContentWidth,
  availableContentHeight,
}: HeatmapSizeControlProps) {
  const { userCellWidth, userCellHeight, handleColumnResize, handleRowResize } = cellSizeOverrides;

  const colSize = layout.columnSizes[0];
  const rowSize = layout.rowSizes[0];

  // Only show for pixel-based layouts (heatmap always uses numbers, not 'fr').
  const intrinsicColW = typeof colSize === 'number' ? colSize : null;
  const intrinsicRowH = typeof rowSize === 'number' ? rowSize : null;

  const currentColW = userCellWidth ?? intrinsicColW;
  const currentRowH = userCellHeight ?? intrinsicRowH;

  const handleShrinkCol = useCallback(() => {
    if (currentColW === null) return;
    const newSize = Math.round(currentColW * SHRINK_FACTOR);
    handleColumnResize({ currentSize: currentColW, delta: newSize - currentColW });
  }, [currentColW, handleColumnResize]);

  const handleGrowCol = useCallback(() => {
    if (currentColW === null) return;
    const newSize = Math.round(currentColW * GROW_FACTOR);
    handleColumnResize({ currentSize: currentColW, delta: newSize - currentColW });
  }, [currentColW, handleColumnResize]);

  const handleShrinkRow = useCallback(() => {
    if (currentRowH === null) return;
    const newSize = Math.round(currentRowH * SHRINK_FACTOR);
    handleRowResize({ currentSize: currentRowH, delta: newSize - currentRowH });
  }, [currentRowH, handleRowResize]);

  const handleGrowRow = useCallback(() => {
    if (currentRowH === null) return;
    const newSize = Math.round(currentRowH * GROW_FACTOR);
    handleRowResize({ currentSize: currentRowH, delta: newSize - currentRowH });
  }, [currentRowH, handleRowResize]);

  const handleFitToView = useCallback(() => {
    if (currentColW === null || currentRowH === null) return;
    if (layout.columns <= 0 || layout.rows <= 0) return;
    const fitColW = Math.floor(availableContentWidth / layout.columns);
    const fitRowH = Math.floor(availableContentHeight / layout.rows);
    handleColumnResize({ currentSize: currentColW, delta: fitColW - currentColW });
    handleRowResize({ currentSize: currentRowH, delta: fitRowH - currentRowH });
  }, [
    layout.columns,
    layout.rows,
    availableContentWidth,
    availableContentHeight,
    currentColW,
    currentRowH,
    handleColumnResize,
    handleRowResize,
  ]);

  if (currentColW === null || currentRowH === null) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: 8,
        left: 8,
        zIndex: 300,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        pointerEvents: 'auto',
      }}
    >
      {/* Column width stepper */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <span style={labelStyle}>W</span>
        <button
          style={baseButtonStyle}
          onClick={handleShrinkCol}
          title="Decrease column width"
        >
          −
        </button>
        <span style={sizeDisplayStyle}>{currentColW}px</span>
        <button
          style={baseButtonStyle}
          onClick={handleGrowCol}
          title="Increase column width"
        >
          +
        </button>
      </div>

      {/* Row height stepper */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <span style={labelStyle}>H</span>
        <button
          style={baseButtonStyle}
          onClick={handleShrinkRow}
          title="Decrease row height"
        >
          −
        </button>
        <span style={sizeDisplayStyle}>{currentRowH}px</span>
        <button
          style={baseButtonStyle}
          onClick={handleGrowRow}
          title="Increase row height"
        >
          +
        </button>
      </div>

      {/* Fit all facet panels to the visible area */}
      <button
        style={{
          ...baseButtonStyle,
          padding: '3px 10px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        }}
        onClick={handleFitToView}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#e8e8e8';
          e.currentTarget.style.borderColor = '#999';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = '#f8f8f8';
          e.currentTarget.style.borderColor = '#ccc';
        }}
        title="Fit to visible area"
      >
        Fit
      </button>
    </div>
  );
}
