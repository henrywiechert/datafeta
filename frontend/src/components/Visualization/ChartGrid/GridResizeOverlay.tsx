import React, { useMemo, useState, useEffect } from 'react';
import GridResizeHandle from './GridResizeHandle';
import VirtualResizeLine from './VirtualResizeLine';
import { UniformResizeIntent } from './utils/uniformCellSizing';

interface GridResizeOverlayProps {
  // Grid dimensions
  columns: number;
  rows: number;
  
  // Grid template strings (to parse for positions)
  columnTemplate: string;
  rowTemplate: string;
  
  // Dimensions of axis areas (where handles are interactive)
  leftFixedWidth: number; // Y-axis area width
  bottomFixedHeight: number; // X-axis area height
  topHeaderHeight: number; // Top facet labels height
  rowHandleLength?: number;
  columnHandleLength?: number;
  
  // Container dimensions
  containerWidth: number;
  containerHeight: number;

  // Current scroll offsets so we can keep handles aligned with the
  // scrolled grid content.
  horizontalScrollOffset: number;
  verticalScrollOffset: number;
  
  // Reference to the actual plot grid for measuring positions
  plotGridRef: React.RefObject<HTMLDivElement>;
  
  // Resize callbacks
  previewColumnResize?: (intent: UniformResizeIntent) => number;
  previewRowResize?: (intent: UniformResizeIntent) => number;
  onColumnResize?: (intent: UniformResizeIntent) => void;
  onRowResize?: (intent: UniformResizeIntent) => void;
  facetLeftHeaderPx?: number;
  facetLeftValueWidthsPx?: number[];
  facetTopValueHeightsPx?: number[];
  previewFacetColumnResize?: (intent: UniformResizeIntent) => number;
  previewFacetRowResize?: (intent: UniformResizeIntent) => number;
  onFacetColumnResize?: (depthIndex: number, intent: UniformResizeIntent) => void;
  onFacetRowResize?: (depthIndex: number, intent: UniformResizeIntent) => void;
}

/**
 * Measure actual gridline positions from the rendered CSS Grid.
 * This is more accurate than calculating from template strings, especially for flexible units.
 * 
 * @param gridElement - The grid container element
 * @param count - Number of tracks (columns or rows)
 * @param orientation - 'horizontal' for row positions, 'vertical' for column positions
 * @returns Array of cumulative positions in px relative to the grid container
 */
function measureGridPositions(gridElement: HTMLDivElement | null, count: number, orientation: 'horizontal' | 'vertical'): number[] {
  if (!gridElement || gridElement.children.length === 0) {
    // Fallback: evenly spaced positions
    return Array.from({ length: count + 1 }, (_, i) => i * 100);
  }

  const gridRect = gridElement.getBoundingClientRect();
  
  // Get unique positions by measuring children
  const uniquePositions = new Set<number>();
  
  for (let i = 0; i < gridElement.children.length; i++) {
    const child = gridElement.children[i] as HTMLElement;
    const childRect = child.getBoundingClientRect();
    
    if (orientation === 'vertical') {
      // Measure columns: left and right edges
      const leftPos = childRect.left - gridRect.left;
      const rightPos = childRect.right - gridRect.left;
      uniquePositions.add(Math.round(leftPos));
      uniquePositions.add(Math.round(rightPos));
    } else {
      // Measure rows: top and bottom edges
      const topPos = childRect.top - gridRect.top;
      const bottomPos = childRect.bottom - gridRect.top;
      uniquePositions.add(Math.round(topPos));
      uniquePositions.add(Math.round(bottomPos));
    }
  }
  
  // Sort and return
  const sorted = Array.from(uniquePositions).sort((a, b) => a - b);
  return sorted.slice(0, count + 1);
}

/**
 * Parse CSS Grid template string to get cumulative positions of gridlines.
 * Handles both px values and fr units.
 * 
 * @param template - CSS Grid template string (e.g., "400px 300px 1fr")
 * @param totalSize - Total size available (for fr calculation)
 * @param count - Number of tracks
 * @returns Array of cumulative positions in px
 */
function parseGridTemplate(template: string, totalSize: number, count: number): number[] {
  // Handle repeat() syntax
  let cleanTemplate = template;
  const repeatMatch = template.match(/repeat\((\d+),\s*([^)]+)\)/);
  if (repeatMatch) {
    const repeatCount = parseInt(repeatMatch[1], 10);
    const trackSize = repeatMatch[2];
    cleanTemplate = Array(repeatCount).fill(trackSize).join(' ');
  }
  
  const tracks = cleanTemplate.split(/\s+/).filter(Boolean);
  
  // Parse each track
  const parsedTracks: Array<{ value: number; isFr: boolean }> = [];
  let totalPx = 0;
  let totalFr = 0;
  
  for (const track of tracks) {
    if (track.includes('minmax')) {
      // Extract the fr value from minmax(XXpx, 1fr) → treat as fr
      parsedTracks.push({ value: 1, isFr: true });
      totalFr += 1;
    } else if (track.endsWith('fr')) {
      const frValue = parseFloat(track);
      parsedTracks.push({ value: frValue, isFr: true });
      totalFr += frValue;
    } else if (track.endsWith('px')) {
      const pxValue = parseFloat(track);
      parsedTracks.push({ value: pxValue, isFr: false });
      totalPx += pxValue;
    } else {
      // Fallback: treat as fr
      parsedTracks.push({ value: 1, isFr: true });
      totalFr += 1;
    }
  }
  
  // Calculate size per fr unit
  const availableForFr = Math.max(0, totalSize - totalPx);
  const pxPerFr = totalFr > 0 ? availableForFr / totalFr : 0;
  
  // Calculate cumulative positions
  const positions: number[] = [0]; // First gridline at 0
  let cumulative = 0;
  
  for (const track of parsedTracks) {
    const size = track.isFr ? track.value * pxPerFr : track.value;
    cumulative += size;
    positions.push(cumulative);
  }
  
  return positions;
}

function getTrackSize(positions: number[], endGridlineIndex: number): number {
  return endGridlineIndex > 0
    ? positions[endGridlineIndex] - positions[endGridlineIndex - 1]
    : positions[0];
}

/**
 * GridResizeOverlay - Manages all resize handles for the grid
 * 
 * Calculates gridline positions and renders handles. Handles are only
 * interactive in axis areas (Y-axis for rows, X-axis for columns).
 */
const GridResizeOverlay: React.FC<GridResizeOverlayProps> = ({
  columns,
  rows,
  columnTemplate,
  rowTemplate,
  leftFixedWidth,
  bottomFixedHeight,
  topHeaderHeight,
  rowHandleLength,
  columnHandleLength,
  containerWidth,
  containerHeight,
  horizontalScrollOffset,
  verticalScrollOffset,
  plotGridRef,
  previewColumnResize,
  previewRowResize,
  onColumnResize,
  onRowResize,
  facetLeftHeaderPx = 0,
  facetLeftValueWidthsPx = [],
  facetTopValueHeightsPx = [],
  previewFacetColumnResize,
  previewFacetRowResize,
  onFacetColumnResize,
  onFacetRowResize,
}) => {
  const canResizePlotColumns = Boolean(onColumnResize || previewColumnResize);
  const canResizePlotRows = Boolean(onRowResize || previewRowResize);

  // Drag state for virtual line
  const [dragState, setDragState] = useState<{
    orientation: 'horizontal' | 'vertical';
    index: number;
    startPosition: number;
    currentDelta: number;
    currentSize: number;
    kind: 'plot-column' | 'plot-row' | 'facet-column' | 'facet-row';
  } | null>(null);

  // Measured gridline positions from actual DOM
  const [measuredColumnPositions, setMeasuredColumnPositions] = useState<number[]>([]);
  const [measuredRowPositions, setMeasuredRowPositions] = useState<number[]>([]);

  // Measure actual grid positions when layout changes
  useEffect(() => {
    if (!plotGridRef.current) return;

    let rafId: number | null = null;
    let isUpdateScheduled = false;

    const measurePositions = () => {
      if (plotGridRef.current) {
        const colPos = measureGridPositions(plotGridRef.current, columns, 'vertical');
        const rowPos = measureGridPositions(plotGridRef.current, rows, 'horizontal');
        setMeasuredColumnPositions(colPos);
        setMeasuredRowPositions(rowPos);
      }
      isUpdateScheduled = false;
    };

    // Throttle measurements using requestAnimationFrame
    const scheduleMeasurement = () => {
      if (!isUpdateScheduled) {
        isUpdateScheduled = true;
        rafId = requestAnimationFrame(measurePositions);
      }
    };

    // Measure after a short delay to ensure grid has been laid out
    const timeoutId = setTimeout(measurePositions, 0);

    // Also re-measure on resize with RAF throttling
    const ro = new ResizeObserver(scheduleMeasurement);
    if (plotGridRef.current) {
      ro.observe(plotGridRef.current);
    }

    return () => {
      clearTimeout(timeoutId);
      ro.disconnect();
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [plotGridRef, columns, rows, columnTemplate, rowTemplate, containerWidth, containerHeight]);

  // Fallback to calculated positions if measurement not available yet
  const columnPositions = useMemo(() => {
    if (measuredColumnPositions.length > 0) {
      return measuredColumnPositions;
    }
    const plotAreaWidth = containerWidth - leftFixedWidth;
    return parseGridTemplate(columnTemplate, plotAreaWidth, columns);
  }, [measuredColumnPositions, columnTemplate, containerWidth, leftFixedWidth, columns]);

  const rowPositions = useMemo(() => {
    if (measuredRowPositions.length > 0) {
      return measuredRowPositions;
    }
    const plotAreaHeight = containerHeight - topHeaderHeight - bottomFixedHeight;
    return parseGridTemplate(rowTemplate, plotAreaHeight, rows);
  }, [measuredRowPositions, rowTemplate, containerHeight, topHeaderHeight, bottomFixedHeight, rows]);

  const facetTopHeaderOffset = useMemo(() => {
    const facetValuesHeight = facetTopValueHeightsPx.reduce((sum, height) => sum + height, 0);
    return Math.max(0, topHeaderHeight - facetValuesHeight);
  }, [facetTopValueHeightsPx, topHeaderHeight]);

  const facetColumnPositions = useMemo(() => {
    const positions: number[] = [];
    let cumulative = facetLeftHeaderPx;
    for (const width of facetLeftValueWidthsPx) {
      cumulative += width;
      positions.push(cumulative);
    }
    return positions;
  }, [facetLeftHeaderPx, facetLeftValueWidthsPx]);

  const facetRowPositions = useMemo(() => {
    const positions: number[] = [];
    let cumulative = facetTopHeaderOffset;
    for (const height of facetTopValueHeightsPx) {
      cumulative += height;
      positions.push(cumulative);
    }
    return positions;
  }, [facetTopHeaderOffset, facetTopValueHeightsPx]);

  // Column resize handlers report the dragged track; the parent owns uniform sizing policy.
  const handleColumnResizeStart = (index: number) => {
    // Column handles live in the bottom X-axis area, which scrolls horizontally.
    // Subtract the current horizontal scroll so the handle stays aligned with the
    // visible gridline.
    const startPosition = leftFixedWidth + columnPositions[index] - horizontalScrollOffset;
    setDragState({
      orientation: 'vertical',
      index,
      startPosition,
      currentDelta: 0,
      currentSize: getTrackSize(columnPositions, index),
      kind: 'plot-column',
    });
  };

  const handleColumnResizeMove = (delta: number, index: number) => {
    setDragState(prev => prev ? { ...prev, currentDelta: delta } : null);
  };

  const handleColumnResizeEnd = (delta: number, index: number) => {
    // Clear virtual line
    setDragState(null);
    
    if (!onColumnResize) return;
    
    onColumnResize({
      currentSize: getTrackSize(columnPositions, index),
      delta,
    });
  };

  // Row resize handlers report the dragged track; the parent owns uniform sizing policy.
  const handleRowResizeStart = (index: number) => {
    // Row handles live in the left Y-axis area, which scrolls vertically.
    // Subtract the current vertical scroll so the handle stays aligned with the
    // visible gridline.
    const startPosition = topHeaderHeight + rowPositions[index] - verticalScrollOffset;
    setDragState({
      orientation: 'horizontal',
      index,
      startPosition,
      currentDelta: 0,
      currentSize: getTrackSize(rowPositions, index),
      kind: 'plot-row',
    });
  };

  const handleRowResizeMove = (delta: number, index: number) => {
    setDragState(prev => prev ? { ...prev, currentDelta: delta } : null);
  };

  const handleRowResizeEnd = (delta: number, index: number) => {
    // Clear virtual line
    setDragState(null);
    
    if (!onRowResize) return;
    
    onRowResize({
      currentSize: getTrackSize(rowPositions, index),
      delta,
    });
  };

  const handleFacetColumnResizeStart = (depthIndex: number) => {
    setDragState({
      orientation: 'vertical',
      index: depthIndex,
      startPosition: facetColumnPositions[depthIndex],
      currentDelta: 0,
      currentSize: facetLeftValueWidthsPx[depthIndex],
      kind: 'facet-column',
    });
  };

  const handleFacetColumnResizeMove = (delta: number) => {
    setDragState(prev => prev ? { ...prev, currentDelta: delta } : null);
  };

  const handleFacetColumnResizeEnd = (delta: number, depthIndex: number) => {
    const currentSize = facetLeftValueWidthsPx[depthIndex];
    setDragState(null);
    if (!onFacetColumnResize || currentSize === undefined) return;
    onFacetColumnResize(depthIndex, { currentSize, delta });
  };

  const handleFacetRowResizeStart = (depthIndex: number) => {
    setDragState({
      orientation: 'horizontal',
      index: depthIndex,
      startPosition: facetRowPositions[depthIndex],
      currentDelta: 0,
      currentSize: facetTopValueHeightsPx[depthIndex],
      kind: 'facet-row',
    });
  };

  const handleFacetRowResizeMove = (delta: number) => {
    setDragState(prev => prev ? { ...prev, currentDelta: delta } : null);
  };

  const handleFacetRowResizeEnd = (delta: number, depthIndex: number) => {
    const currentSize = facetTopValueHeightsPx[depthIndex];
    setDragState(null);
    if (!onFacetRowResize || currentSize === undefined) return;
    onFacetRowResize(depthIndex, { currentSize, delta });
  };

  // Calculate virtual line position and size
  const virtualLineData = useMemo(() => {
    if (!dragState) return null;

    const { orientation, startPosition, currentDelta, currentSize, kind } = dragState;
    const intent = { currentSize, delta: currentDelta };
    let previewSize = currentSize + currentDelta;

    if (kind === 'plot-column') {
      previewSize = previewColumnResize ? previewColumnResize(intent) : previewSize;
    } else if (kind === 'plot-row') {
      previewSize = previewRowResize ? previewRowResize(intent) : previewSize;
    } else if (kind === 'facet-column') {
      previewSize = previewFacetColumnResize ? previewFacetColumnResize(intent) : previewSize;
    } else {
      previewSize = previewFacetRowResize ? previewFacetRowResize(intent) : previewSize;
    }

    return {
      orientation,
      position: startPosition + (previewSize - currentSize),
      size: previewSize,
    };
  }, [dragState, previewColumnResize, previewRowResize, previewFacetColumnResize, previewFacetRowResize]);

  return (
    <>
      {/* Top facet header vertical resize handles (same track as plot columns) */}
      {canResizePlotColumns && topHeaderHeight > 0 && columnPositions.map((xPos, index) => {
        if (index === 0) return null;

        return (
          <GridResizeHandle
            key={`top-facet-col-${index}`}
            testId={`top-facet-col-handle-${index}`}
            orientation="vertical"
            position={leftFixedWidth + xPos - horizontalScrollOffset}
            length={topHeaderHeight}
            crossAxisOffset={0}
            isInAxisArea={true}
            onResizeStart={() => handleColumnResizeStart(index)}
            onResizeMove={(delta) => handleColumnResizeMove(delta, index)}
            onResizeEnd={(delta) => handleColumnResizeEnd(delta, index)}
            zIndex={22}
          />
        );
      })}

      {/* Left facet value resize handles (vertical lines in facet label area) */}
      {facetColumnPositions.map((xPos, depthIndex) => (
        <GridResizeHandle
          key={`facet-col-${depthIndex}`}
          testId={`facet-col-handle-${depthIndex}`}
          orientation="vertical"
          position={xPos}
          length={Math.max(1, containerHeight - topHeaderHeight - bottomFixedHeight)}
          crossAxisOffset={topHeaderHeight}
          isInAxisArea={true}
          onResizeStart={() => handleFacetColumnResizeStart(depthIndex)}
          onResizeMove={handleFacetColumnResizeMove}
          onResizeEnd={(delta) => handleFacetColumnResizeEnd(delta, depthIndex)}
          zIndex={21}
        />
      ))}

      {/* Top facet value resize handles (horizontal lines in facet header area) */}
      {facetRowPositions.map((yPos, depthIndex) => (
        <GridResizeHandle
          key={`facet-row-${depthIndex}`}
          testId={`facet-row-handle-${depthIndex}`}
          orientation="horizontal"
          position={yPos}
          length={Math.max(1, containerWidth - leftFixedWidth)}
          crossAxisOffset={leftFixedWidth}
          isInAxisArea={true}
          onResizeStart={() => handleFacetRowResizeStart(depthIndex)}
          onResizeMove={handleFacetRowResizeMove}
          onResizeEnd={(delta) => handleFacetRowResizeEnd(delta, depthIndex)}
          zIndex={21}
        />
      ))}

      {/* Column resize handles (vertical lines in X-axis area) */}
      {canResizePlotColumns && columnPositions.map((xPos, index) => {
        // Skip first position (left edge) for now - add if needed for rightmost
        if (index === 0) return null;
        
        return (
          <GridResizeHandle
            key={`col-${index}`}
            testId={`plot-col-handle-${index}`}
            orientation="vertical"
            // Adjust for horizontal scroll so the handle tracks the visible gridline.
            position={leftFixedWidth + xPos - horizontalScrollOffset}
            length={columnHandleLength ?? bottomFixedHeight} // Usually X-axis area; axisless charts use plot area.
            crossAxisOffset={containerHeight - (columnHandleLength ?? bottomFixedHeight)}
            isInAxisArea={true}
            onResizeStart={() => handleColumnResizeStart(index)}
            onResizeMove={(delta) => handleColumnResizeMove(delta, index)}
            onResizeEnd={(delta) => handleColumnResizeEnd(delta, index)}
            zIndex={20} // Above grid content
          />
        );
      })}

      {/* Row resize handles (horizontal lines in Y-axis area) */}
      {canResizePlotRows && rowPositions.map((yPos, index) => {
        // Skip first position (top edge) for now - add if needed for bottom
        if (index === 0) return null;
        
        return (
          <GridResizeHandle
            key={`row-${index}`}
            testId={`plot-row-handle-${index}`}
            orientation="horizontal"
            // Adjust for vertical scroll so the handle tracks the visible gridline.
            position={topHeaderHeight + yPos - verticalScrollOffset}
            length={rowHandleLength ?? leftFixedWidth} // Usually Y-axis area; axisless charts use plot area.
            crossAxisOffset={0}
            isInAxisArea={true}
            onResizeStart={() => handleRowResizeStart(index)}
            onResizeMove={(delta) => handleRowResizeMove(delta, index)}
            onResizeEnd={(delta) => handleRowResizeEnd(delta, index)}
            zIndex={20} // Above grid content
          />
        );
      })}

      {/* Virtual resize line (shown during drag) */}
      {virtualLineData && (
        <VirtualResizeLine
          orientation={virtualLineData.orientation}
          position={virtualLineData.position}
          isVisible={true}
          displaySize={virtualLineData.size}
        />
      )}
    </>
  );
};

export default GridResizeOverlay;

