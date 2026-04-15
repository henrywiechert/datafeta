import React, { useState } from 'react';
import { Box, IconButton, Popover, SvgIcon, Tooltip } from '@mui/material';
import { v4 as uuidv4 } from 'uuid';
import { PropertyDropZone } from '../Properties/PropertyDropZone';
import SizeRangeControl from './SizeRangeControl';
import { Field } from '../../../types';
import FieldChip from '../FieldChip';
import { parseDragData } from './overrideUtils';
import { resolveSingleEncodingDropField } from '../../../utils/singleEncodingZone';

const TableauSizeIcon: React.FC<{ fontSize?: 'inherit' | 'small' | 'medium' | 'large' }> = ({ fontSize }) => (
  <SvgIcon fontSize={fontSize} viewBox="0 0 24 24">
    <circle cx="10" cy="13" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <circle cx="15.5" cy="10" r="6" fill="none" stroke="currentColor" strokeWidth="1.8" opacity="0.9" />
  </SvgIcon>
);

interface SizeFieldControlProps {
  field: Field | null;
  sizeRange: [number, number];
  manualSize: number;
  onDrop: (field: Field) => void;
  onRemove: (fieldIds: string[]) => void;
  onSizeRangeChange: (range: [number, number]) => void;
  onManualSizeChange: (size: number) => void;
  /** 
   * When true, always show single slider for thickness control regardless of field.
   * Used for tick-strip and gantt charts where sizeField doesn't map to visual size.
   */
  forceSingleSlider?: boolean;
}

const SizeFieldControl: React.FC<SizeFieldControlProps> = ({
  field,
  sizeRange,
  manualSize,
  onDrop,
  onRemove,
  onSizeRangeChange,
  onManualSizeChange,
  forceSingleSlider = false,
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
    const { field: droppedField, source } = parseDragData(e);
    if (droppedField) {
      const fieldToSet = resolveSingleEncodingDropField({
        field: droppedField,
        source,
        zoneSource: 'SIZE_ZONE',
      });
      if (!fieldToSet) return;
      onDrop(fieldToSet);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'auto minmax(0, 1fr)',
          alignItems: 'center',
          gap: 0.5,
        }}
      >
        {/* Size icon opens the size slider popover */}
        <Tooltip title="Size" placement="top" arrow enterDelay={500} leaveDelay={100}>
          <IconButton size="small" sx={{ width: 28, height: 28 }} onClick={handleOpenPopover}>
            <TableauSizeIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Box sx={{ minWidth: 0 }}>
          <PropertyDropZone
            hasContent={field !== null}
            emptyMessage="Drag field"
            variant="plain"
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
          forceSingleSlider={forceSingleSlider}
        />
      </Popover>
    </Box>
  );
};

export default SizeFieldControl;

