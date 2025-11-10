import React, { useMemo } from 'react';
import GridResizeHandle from './GridResizeHandle';

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
  
  // Container dimensions
  containerWidth: number;
  containerHeight: number;
  
  // Resize callbacks
  onColumnResize?: (newWidth: number) => void;
  onRowResize?: (newHeight: number) => void;
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
  containerWidth,
  containerHeight,
  onColumnResize,
  onRowResize,
}) => {
  // Calculate gridline positions
  const columnPositions = useMemo(() => {
    const plotAreaWidth = containerWidth - leftFixedWidth;
    return parseGridTemplate(columnTemplate, plotAreaWidth, columns);
  }, [columnTemplate, containerWidth, leftFixedWidth, columns]);

  const rowPositions = useMemo(() => {
    const plotAreaHeight = containerHeight - topHeaderHeight - bottomFixedHeight;
    return parseGridTemplate(rowTemplate, plotAreaHeight, rows);
  }, [rowTemplate, containerHeight, topHeaderHeight, bottomFixedHeight, rows]);

  // Column resize handlers (all columns get the same width)
  const handleColumnResizeStart = () => {
    // Could add visual feedback here
  };

  const handleColumnResizeMove = (delta: number, index: number) => {
    // For now, we'll handle this in Phase 3 (virtual line)
  };

  const handleColumnResizeEnd = (delta: number, index: number) => {
    if (!onColumnResize) return;
    
    // Calculate new width based on delta
    // We're using uniform sizing, so any gridline resize changes ALL column widths
    const currentWidth = index > 0 ? columnPositions[index] - columnPositions[index - 1] : columnPositions[0];
    const newWidth = currentWidth + delta;
    
    onColumnResize(newWidth);
  };

  // Row resize handlers (all rows get the same height)
  const handleRowResizeStart = () => {
    // Could add visual feedback here
  };

  const handleRowResizeMove = (delta: number, index: number) => {
    // For now, we'll handle this in Phase 3 (virtual line)
  };

  const handleRowResizeEnd = (delta: number, index: number) => {
    if (!onRowResize) return;
    
    // Calculate new height based on delta
    const currentHeight = index > 0 ? rowPositions[index] - rowPositions[index - 1] : rowPositions[0];
    const newHeight = currentHeight + delta;
    
    onRowResize(newHeight);
  };

  return (
    <>
      {/* Column resize handles (vertical lines in X-axis area) */}
      {columnPositions.map((xPos, index) => {
        // Skip first position (left edge) for now - add if needed for rightmost
        if (index === 0) return null;
        
        return (
          <GridResizeHandle
            key={`col-${index}`}
            orientation="vertical"
            position={leftFixedWidth + xPos}
            length={bottomFixedHeight} // Only extends through X-axis area
            isInAxisArea={true}
            onResizeStart={handleColumnResizeStart}
            onResizeMove={(delta) => handleColumnResizeMove(delta, index)}
            onResizeEnd={(delta) => handleColumnResizeEnd(delta, index)}
            zIndex={20} // Above grid content
          />
        );
      })}

      {/* Row resize handles (horizontal lines in Y-axis area) */}
      {rowPositions.map((yPos, index) => {
        // Skip first position (top edge) for now - add if needed for bottom
        if (index === 0) return null;
        
        return (
          <GridResizeHandle
            key={`row-${index}`}
            orientation="horizontal"
            position={topHeaderHeight + yPos}
            length={leftFixedWidth} // Only extends through Y-axis area
            isInAxisArea={true}
            onResizeStart={handleRowResizeStart}
            onResizeMove={(delta) => handleRowResizeMove(delta, index)}
            onResizeEnd={(delta) => handleRowResizeEnd(delta, index)}
            zIndex={20} // Above grid content
          />
        );
      })}
    </>
  );
};

export default GridResizeOverlay;

