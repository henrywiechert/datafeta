import React from 'react';
import { Box, IconButton, Popover, Tooltip, Typography } from '@mui/material';
import { PropertyDropZone } from '../Properties/PropertyDropZone';
import { Field } from '../../../types';
import FieldChip from '../FieldChip';
import { parseDragData } from './overrideUtils';
import { resolveSingleEncodingDropField } from '../../../utils/singleEncodingZone';
import {
  DEFAULT_MANUAL_SHAPE,
  MANUAL_NO_SHAPE,
  MANUAL_SHAPE_OPTIONS,
  ManualShapeOption,
  resolveManualShapeOption,
} from '../../../observable-plot-generator/utils/shapeUtils';
import ShapeSymbolPreview from '../ShapeSymbolPreview';

interface ShapeFieldControlProps {
  field: Field | null;
  manualShape?: string;
  onDrop: (field: Field) => void;
  onManualShapeChange: (shape: ManualShapeOption) => void;
  onRemove: (fieldIds: string[]) => void;
}

const ShapeFieldControl: React.FC<ShapeFieldControlProps> = ({
  field,
  manualShape = DEFAULT_MANUAL_SHAPE,
  onDrop,
  onManualShapeChange,
  onRemove,
}) => {
  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);
  const pickerOpen = Boolean(anchorEl);
  const effectiveManualShape = resolveManualShapeOption(manualShape);

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

  const handleOpenPicker = (event: React.MouseEvent<HTMLElement>) => {
    if (field) return;
    setAnchorEl(event.currentTarget);
  };

  const handleClosePicker = () => {
    setAnchorEl(null);
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
        <>
          <Tooltip
            title={field ? 'Shape is driven by the assigned field' : 'Pick a fixed shape or no shape'}
            placement="top"
            arrow
            enterDelay={500}
            leaveDelay={100}
          >
            <span>
              <IconButton
                size="small"
                onClick={handleOpenPicker}
                disabled={Boolean(field)}
                sx={{
                  width: 28,
                  height: 28,
                  color: field ? 'text.disabled' : 'text.secondary',
                }}
              >
                <ShapeSymbolPreview symbol={effectiveManualShape} fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>

          <Popover
            open={pickerOpen}
            anchorEl={anchorEl}
            onClose={handleClosePicker}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            PaperProps={{
              sx: {
                p: 0.75,
                width: 'fit-content',
                maxWidth: 'calc(100vw - 16px)',
                borderRadius: 1,
              },
            }}
          >
            <Typography variant="caption" sx={{ display: 'block', mb: 0.75, fontWeight: 600, color: '#666' }}>
              Shape
            </Typography>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 32px)',
                gap: '6px',
                justifyContent: 'start',
              }}
            >
              {MANUAL_SHAPE_OPTIONS.map((symbol) => {
                const selected = symbol === effectiveManualShape;
                const title = symbol === MANUAL_NO_SHAPE ? 'No shape' : `${symbol[0].toUpperCase()}${symbol.slice(1)}`;
                return (
                  <Box
                    key={symbol}
                    title={title}
                    onClick={() => {
                      onManualShapeChange(symbol);
                      handleClosePicker();
                    }}
                    sx={{
                      width: 32,
                      height: 32,
                      borderRadius: 1,
                      border: selected ? '2px solid rgba(25,118,210,0.9)' : '1px solid rgba(0,0,0,0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      color: selected ? '#1976d2' : '#4a4a4a',
                      backgroundColor: selected ? 'rgba(25,118,210,0.06)' : '#fff',
                      '&:hover': {
                        backgroundColor: 'rgba(25,118,210,0.06)',
                      },
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <ShapeSymbolPreview symbol={symbol} fontSize="small" />
                  </Box>
                );
              })}
            </Box>
          </Popover>
        </>

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
                    const nextField = Array.isArray(updatedField) ? updatedField[0] : updatedField;
                    onDrop(nextField);
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