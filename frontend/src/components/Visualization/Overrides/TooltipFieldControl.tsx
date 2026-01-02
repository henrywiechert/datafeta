import React from 'react';
import { Box, IconButton, SvgIcon, Tooltip } from '@mui/material';
import { v4 as uuidv4 } from 'uuid';
import { PropertyDropZone } from '../Properties/PropertyDropZone';
import { DragSource, Field } from '../../../types';
import FieldChip from '../FieldChip';

const TooltipIcon: React.FC<{ fontSize?: 'inherit' | 'small' | 'medium' | 'large' }> = ({ fontSize }) => (
  <SvgIcon fontSize={fontSize} viewBox="0 0 24 24">
    <path
      d="M6 6.5h12a2 2 0 0 1 2 2v6.5a2 2 0 0 1-2 2H11l-3.5 2.5V17H6a2 2 0 0 1-2-2V8.5a2 2 0 0 1 2-2z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <path
      d="M8 10h8M8 12.5h6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </SvgIcon>
);

interface TooltipFieldControlProps {
  tooltipFields?: Field[];
  onTooltipDrop: (field: Field, source: DragSource) => void;
  onTooltipRemove: (fieldId: string) => void;
  onUpdateField?: (field: Field) => void;
}

const TooltipFieldControl: React.FC<TooltipFieldControlProps> = ({
  tooltipFields = [],
  onTooltipDrop,
  onTooltipRemove,
  onUpdateField,
}) => {
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    try {
      const payload = e.dataTransfer.getData('application/json');
      if (!payload) return;
      const parsed = JSON.parse(payload);

      // Handle unified payload format (always arrays) and legacy format
      let fields = parsed.fields;
      const source: DragSource = parsed.source || 'AVAILABLE_FIELDS';

      if (!fields && parsed.field) {
        fields = [parsed.field];
      } else if (!fields && !parsed.field) {
        // Very old format: just the field object
        fields = [parsed];
      }

      if (fields && fields.length > 0) {
        fields.forEach((f: Field) => {
          // Create an independent copy with a new ID when dropping from AVAILABLE_FIELDS or axes
          const isFromZone = source === 'TOOLTIP_ZONE';
          const fieldToSet = isFromZone ? f : { ...f, id: uuidv4() };
          onTooltipDrop(fieldToSet, source);
        });
      }
    } catch (err) {
      console.warn('Failed to parse dropped field for tooltip override control', err);
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
        <Tooltip title="Tooltip" placement="top" arrow enterDelay={500} leaveDelay={100}>
          <IconButton size="small" sx={{ width: 28, height: 28 }} onClick={() => {}}>
            <TooltipIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        <Box sx={{ minWidth: 0 }}>
          <PropertyDropZone
            hasContent={tooltipFields.length > 0}
            emptyMessage="Drag fields"
            variant="plain"
            onDrop={handleDrop}
          >
            {tooltipFields.length > 0 && (
              <Box
                sx={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 0.5,
                  minWidth: 0,
                  width: '100%',
                  alignItems: 'center',
                }}
              >
                {tooltipFields.map((field) => (
                  <FieldChip
                    key={field.id}
                    field={field}
                    source="TOOLTIP_ZONE"
                    onUpdate={(updated) => {
                      const f = Array.isArray(updated) ? updated[0] : updated;
                      onUpdateField?.(f);
                    }}
                    onRemoveFromZone={(ids) => ids.forEach((id) => onTooltipRemove(id))}
                  />
                ))}
              </Box>
            )}
          </PropertyDropZone>
        </Box>
      </Box>
    </Box>
  );
};

export default TooltipFieldControl;


