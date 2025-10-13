import React from 'react';
import PhotoSizeSelectLargeIcon from '@mui/icons-material/PhotoSizeSelectLarge';
import { Field, DragSource } from '../../../types';
import { PropertySection } from '../Properties';
import SizeDropZone from './SizeDropZone';
import SizeRangeControl from './SizeRangeControl';

interface SizePanelProps {
  sizeField: Field | null;
  sizeRange: [number, number];
  manualSize: number;
  onDrop: (field: Field, source: DragSource) => void;
  onRemove: () => void;
  onSizeRangeChange: (range: [number, number]) => void;
  onManualSizeChange: (size: number) => void;
}

const SizePanel: React.FC<SizePanelProps> = ({
  sizeField,
  sizeRange,
  manualSize,
  onDrop,
  onRemove,
  onSizeRangeChange,
  onManualSizeChange,
}) => {
  return (
    <PropertySection
      title="Size"
      icon={<PhotoSizeSelectLargeIcon fontSize="small" />}
      defaultExpanded={true}
      storageKey="sizePanel.expanded"
    >
      <SizeDropZone
        sizeField={sizeField}
        onDrop={onDrop}
        onRemove={onRemove}
      />
      <SizeRangeControl
        sizeField={sizeField}
        sizeRange={sizeRange}
        manualSize={manualSize}
        onSizeRangeChange={onSizeRangeChange}
        onManualSizeChange={onManualSizeChange}
      />
    </PropertySection>
  );
};

export default SizePanel;