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
    <Box sx={{ height: '100%', p: 2 }}>
      <Box sx={{ mb: 2 }}>
        <DropZone 
          onDrop={onXAxisDrop}
          axis="x"
          fields={xAxisFields}
          onFieldUpdate={onFieldUpdate}
          onRemoveField={onRemoveField}
          onReorderFields={onReorderFields}
        >
          X-Axis:
        </DropZone>
      </Box>
      <Box sx={{ mb: 2 }}>
        <DropZone 
          onDrop={onYAxisDrop}
          axis="y"
          fields={yAxisFields}
          onFieldUpdate={onFieldUpdate}
          onRemoveField={onRemoveField}
          onReorderFields={onReorderFields}
        >
          Y-Axis:
        </DropZone>
      </Box>
      <ChartArea />
    </Box>
  );
};

export default ChartPanel;
