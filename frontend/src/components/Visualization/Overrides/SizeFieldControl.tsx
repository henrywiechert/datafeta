import React, { useState } from 'react';
import { Box, IconButton, Popover } from '@mui/material';
import PhotoSizeSelectLargeIcon from '@mui/icons-material/PhotoSizeSelectLarge';
import { PropertyDropZone } from '../Properties/PropertyDropZone';
import SizeRangeControl from '../Size/SizeRangeControl';
import { Field } from '../../../types';
import FieldChip from '../FieldChip';
import { parseDragData } from './overrideUtils';

interface SizeFieldControlProps {
  field: Field | null;
  sizeRange: [number, number];
  manualSize: number;
  onDrop: (field: Field) => void;
  onRemove: (fieldIds: string[]) => void;
  onSizeRangeChange: (range: [number, number]) => void;
  onManualSizeChange: (size: number) => void;
}

const SizeFieldControl: React.FC<SizeFieldControlProps> = ({
  field,
  sizeRange,
  manualSize,
  onDrop,
  onRemove,
  onSizeRangeChange,
  onManualSizeChange,
}) => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  const handleOpenPopover = (e: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(e.currentTarget);
  };

  const handleClosePopover = () => {
    setAnchorEl(null);
  };

  const popoverOpen = Boolean(anchorEl);

  const handleDrop = (e: React.DragEvent) => {
    const { field: droppedField } = parseDragData(e);
    if (droppedField) {
      onDrop(droppedField);
    }
  };

  return (
    <Box sx={{ 
      display: 'flex', 
      flexDirection: 'column', 
      gap: 0.5, 
      mb: 0,
      p: 0.75,
      border: '1px solid #d0d0d0',
      borderRadius: '4px',
      backgroundColor: '#fafafa'
    }}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'auto minmax(0, 1fr)',
          alignItems: 'center',
          gap: 0.5,
        }}
      >
        {/* Size icon opens the size slider popover */}
        <IconButton size="small" sx={{ width: 28, height: 28 }} onClick={handleOpenPopover}>
          <PhotoSizeSelectLargeIcon sx={{ fontSize: 18 }} />
        </IconButton>
        <Box sx={{ minWidth: 0 }}>
          <PropertyDropZone
            hasContent={field !== null}
            emptyMessage="Drag field"
            onDrop={handleDrop}
          >
            {field && (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                  minWidth: 0,
                  width: '100%',
                }}
              >
                <FieldChip
                  field={field}
                  source="SIZE_ZONE"
                  onUpdate={(updated) => {
                    const f = Array.isArray(updated) ? updated[0] : updated;
                    onDrop(f);
                  }}
                  onRemoveFromZone={(fieldIds) => onRemove(fieldIds)}
                />
              </Box>
            )}
          </PropertyDropZone>
        </Box>
      </Box>

      <Popover
        open={popoverOpen}
        anchorEl={anchorEl}
        onClose={handleClosePopover}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        PaperProps={{ sx: { p: 1, width: 320 } }}
      >
        <SizeRangeControl
          sizeField={field}
          sizeRange={sizeRange}
          manualSize={manualSize}
          onSizeRangeChange={onSizeRangeChange}
          onManualSizeChange={onManualSizeChange}
        />
      </Popover>
    </Box>
  );
};

export default SizeFieldControl;

