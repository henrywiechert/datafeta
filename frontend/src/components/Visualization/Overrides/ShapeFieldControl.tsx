import React from 'react';
import { Box, SvgIcon, Tooltip } from '@mui/material';
import { PropertyDropZone } from '../Properties/PropertyDropZone';
import { Field } from '../../../types';
import FieldChip from '../FieldChip';
import { parseDragData } from './overrideUtils';
import { resolveSingleEncodingDropField } from '../../../utils/singleEncodingZone';

/** Tableau-style shape icon: a circle surrounded by a diamond outline. */
const TableauShapeIcon: React.FC<{ fontSize?: 'inherit' | 'small' | 'medium' | 'large' }> = ({ fontSize }) => (
  <SvgIcon fontSize={fontSize} viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="3.5" fill="currentColor" />
    <path
      d="M12 2 L22 12 L12 22 L2 12 Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    />
  </SvgIcon>
);

interface ShapeFieldControlProps {
  field: Field | null;
  onDrop: (field: Field) => void;
  onRemove: (fieldIds: string[]) => void;
}

const ShapeFieldControl: React.FC<ShapeFieldControlProps> = ({ field, onDrop, onRemove }) => {
  const handleDrop = (e: React.DragEvent) => {
    const { field: droppedField, source } = parseDragData(e);
    if (!droppedField) return;

    const fieldToSet = resolveSingleEncodingDropField({
      field: droppedField,
      source,
      zoneSource: 'SHAPE_ZONE',
      requiredFlavour: 'discrete',
    });
    if (!fieldToSet) {
      console.warn('Shape field must be discrete (categorical). Continuous fields are not supported.');
      return;
    }
    onDrop(fieldToSet);
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
        <Tooltip title="Shape (scatter, discrete only)" placement="top" arrow enterDelay={500} leaveDelay={100}>
          <Box sx={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'text.secondary' }}>
            <TableauShapeIcon fontSize="small" />
          </Box>
        </Tooltip>
        <Box sx={{ minWidth: 0 }}>
          <PropertyDropZone
            hasContent={field !== null}
            emptyMessage="Shape (discrete only)"
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
                  source="SHAPE_ZONE"
                  onRemoveFromZone={(fieldIds) => onRemove(fieldIds)}
                  onUpdate={(updatedField: Field | Field[]) => {
                    const f = Array.isArray(updatedField) ? updatedField[0] : updatedField;
                    onDrop(f);
                  }}
                />
              </Box>
            )}
          </PropertyDropZone>
        </Box>
      </Box>
    </Box>
  );
};

export default ShapeFieldControl;
