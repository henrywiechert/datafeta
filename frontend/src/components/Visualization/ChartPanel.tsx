import React, { useEffect, useRef, useCallback } from 'react';
import { Box } from '@mui/material';
import DropZone from './DropZone';
import ChartArea from './ChartArea';
import { Field, DragSource } from '../../types';
import { useSelectionStore } from '../../stores/selectionStore';

interface ChartPanelProps {
  xAxisFields: Field[];
  yAxisFields: Field[];
  onXAxisDrop: (field: Field | Field[], source: DragSource, index?: number) => void;
  onYAxisDrop: (field: Field | Field[], source: DragSource, index?: number) => void;
  onFieldUpdate: (fields: Field | Field[]) => void;
  onRemoveField: (fieldId: string) => void;
  onReorderFields: (axis: 'x' | 'y', fromIndex: number, toIndex: number) => void;
  onMoveFieldBetweenAxes: (fieldId: string, fromAxis: 'x' | 'y', toAxis: 'x' | 'y', insertIndex?: number) => void;
}

const ChartPanel: React.FC<ChartPanelProps> = ({
  xAxisFields,
  yAxisFields,
  onXAxisDrop,
  onYAxisDrop,
  onFieldUpdate,
  onRemoveField,
  onReorderFields,
  onMoveFieldBetweenAxes
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Get clearSelection action (stable reference, never causes re-render)
  const clearSelection = useSelectionStore((s) => s.clearSelection);
  
  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        clearSelection();
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [clearSelection]);
  
  // Handle clicks on empty space to clear selection
  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    // Only clear if clicking on the container itself
    if (e.target === e.currentTarget) {
      clearSelection();
    }
  }, [clearSelection]);
  
  return (
    <Box 
      ref={containerRef}
      onClick={handleContainerClick}
      sx={{ height: '100%', p: 1, display: 'flex', flexDirection: 'column' }}
    >
      <Box sx={{ mb: 1 }}>
        <DropZone 
          onDrop={onXAxisDrop}
          axis="x"
          fields={xAxisFields}
          onFieldUpdate={onFieldUpdate}
          onRemoveField={onRemoveField}
          onReorderFields={onReorderFields}
          onMoveFieldBetweenAxes={onMoveFieldBetweenAxes}
        >
          X
        </DropZone>
      </Box>
      <Box sx={{ mb: 1 }}>
        <DropZone 
          onDrop={onYAxisDrop}
          axis="y"
          fields={yAxisFields}
          onFieldUpdate={onFieldUpdate}
          onRemoveField={onRemoveField}
          onReorderFields={onReorderFields}
          onMoveFieldBetweenAxes={onMoveFieldBetweenAxes}
        >
          Y
        </DropZone>
      </Box>
      {/* Add separation line between drop zones and chart area */}
      <Box sx={{ 
        height: '1px', 
        backgroundColor: '#e0e0e0', 
        width: '100%', 
        mb: 2,
        mt: 1
      }} />
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <ChartArea />
      </Box>
    </Box>
  );
};

export default ChartPanel;
