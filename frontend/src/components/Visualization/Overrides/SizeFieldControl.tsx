import React from 'react';
import { Box, Typography, Chip, styled } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { PropertyDropZone } from '../Properties/PropertyDropZone';
import SizeRangeControl from '../Size/SizeRangeControl';
import { Field } from '../../../types';
import { getFieldDisplayName } from '../../../utils/fieldUtils';
import { getChipStyles, parseDragData } from './overrideUtils';

const TruncatedChip = styled(Chip)({
  minWidth: 0,
  display: 'inline-flex',
  alignItems: 'center',
  '& .MuiChip-label': {
    flexGrow: 1,
    textAlign: 'left',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  '& .MuiChip-deleteIcon': {
    flexShrink: 0,
  },
});

interface SizeFieldControlProps {
  field: Field | null;
  sizeRange: [number, number];
  manualSize: number;
  onDrop: (field: Field) => void;
  onRemove: () => void;
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
  const handleDrop = (e: React.DragEvent) => {
    const { field: droppedField } = parseDragData(e);
    if (droppedField) {
      onDrop(droppedField);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="caption" sx={{ minWidth: 60 }}>
          Size
        </Typography>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <PropertyDropZone
            hasContent={field !== null}
            emptyMessage="Drag a field or use manual size"
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
                <TruncatedChip
                  label={getFieldDisplayName(field)}
                  title={getFieldDisplayName(field)}
                  onDelete={onRemove}
                  deleteIcon={<CloseIcon />}
                  size="small"
                  sx={{
                    flex: 1,
                    ...getChipStyles(field),
                  }}
                />
              </Box>
            )}
          </PropertyDropZone>
        </Box>
      </Box>
      <SizeRangeControl
        sizeField={field}
        sizeRange={sizeRange}
        manualSize={manualSize}
        onSizeRangeChange={onSizeRangeChange}
        onManualSizeChange={onManualSizeChange}
      />
    </Box>
  );
};

export default SizeFieldControl;

