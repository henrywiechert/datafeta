import React from 'react';
import { Box } from '@mui/material';
import DropZone from './DropZone';
import ChartArea from './ChartArea';
import { Field, DragSource } from '../../types';

interface ChartPanelProps {
  xAxisFields: Field[];
  yAxisFields: Field[];
  onXAxisDrop: (field: Field, source: DragSource, index?: number) => void;
  onYAxisDrop: (field: Field, source: DragSource, index?: number) => void;
  onFieldUpdate: (field: Field) => void;
  onRemoveField: (fieldId: string) => void;
  onReorderFields: (axis: 'x' | 'y', fromIndex: number, toIndex: number) => void;
}

const ChartPanel: React.FC<ChartPanelProps> = ({
  xAxisFields,
  yAxisFields,
  onXAxisDrop,
  onYAxisDrop,
  onFieldUpdate,
  onRemoveField,
  onReorderFields
}) => {
  return (
    <Box sx={{ height: '100%', p: 1, display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ mb: 1 }}>
        <DropZone 
          onDrop={onXAxisDrop}
          axis="x"
          fields={xAxisFields}
          onFieldUpdate={onFieldUpdate}
          onRemoveField={onRemoveField}
          onReorderFields={onReorderFields}
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
      <ChartArea />
    </Box>
  );
};

export default ChartPanel;
