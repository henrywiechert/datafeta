import React from 'react';
import { Box, IconButton, Popover, SvgIcon, Tooltip, Typography } from '@mui/material';
import { PropertyDropZone } from '../Properties/PropertyDropZone';
import { Field } from '../../../types';
import FieldChip from '../FieldChip';
import { parseDragData } from './overrideUtils';
import { resolveSingleEncodingDropField } from '../../../utils/singleEncodingZone';
import {
  DEFAULT_MANUAL_SHAPE,
  MANUAL_SHAPE_SYMBOLS,
  ShapeSymbolName,
} from '../../../observable-plot-generator/utils/shapeUtils';

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

const ShapeSymbolIcon: React.FC<{
  symbol: ShapeSymbolName;
  fontSize?: 'inherit' | 'small' | 'medium' | 'large';
}> = ({ symbol, fontSize = 'small' }) => {
  switch (symbol) {
    case 'dot':
      return (
        <SvgIcon fontSize={fontSize} viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="4.25" fill="currentColor" />
        </SvgIcon>
      );
    case 'circle':
      return (
        <SvgIcon fontSize={fontSize} viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" strokeWidth="1.8" />
        </SvgIcon>
      );
    case 'square':
      return (
        <SvgIcon fontSize={fontSize} viewBox="0 0 24 24">
          <rect x="7" y="7" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.8" />
        </SvgIcon>
      );
    case 'diamond':
      return (
        <SvgIcon fontSize={fontSize} viewBox="0 0 24 24">
          <path d="M12 5 L19 12 L12 19 L5 12 Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
        </SvgIcon>
      );
    case 'triangle':
      return (
        <SvgIcon fontSize={fontSize} viewBox="0 0 24 24">
          <path d="M12 5 L19 18 L5 18 Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
        </SvgIcon>
      );
    case 'star':
      return (
        <SvgIcon fontSize={fontSize} viewBox="0 0 24 24">
          <path d="M12 4.5 L14.2 9.1 L19.3 9.8 L15.6 13.4 L16.5 18.5 L12 16.1 L7.5 18.5 L8.4 13.4 L4.7 9.8 L9.8 9.1 Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        </SvgIcon>
      );
    case 'cross':
      return (
        <SvgIcon fontSize={fontSize} viewBox="0 0 24 24">
          <path d="M10 5 H14 V10 H19 V14 H14 V19 H10 V14 H5 V10 H10 Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="miter" />
        </SvgIcon>
      );
    case 'wye':
      return (
        <SvgIcon fontSize={fontSize} viewBox="0 0 24 24">
          <path d="M11 12.5 L6.7 8.2 L8.2 6.7 L12 10.5 L15.8 6.7 L17.3 8.2 L13 12.5 V18 H11 Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
        </SvgIcon>
      );
    case 'asterisk':
      return (
        <SvgIcon fontSize={fontSize} viewBox="0 0 24 24">
          <path d="M11 4 H13 V10.1 L18.3 7.1 L19.3 8.9 L14 12 L19.3 15.1 L18.3 16.9 L13 13.9 V20 H11 V13.9 L5.7 16.9 L4.7 15.1 L10 12 L4.7 8.9 L5.7 7.1 L11 10.1 Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
        </SvgIcon>
      );
    default:
      return <TableauShapeIcon fontSize={fontSize} />;
  }
};

interface ShapeFieldControlProps {
  field: Field | null;
  manualShape?: string;
  onDrop: (field: Field) => void;
  onManualShapeChange: (shape: ShapeSymbolName) => void;
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
  const effectiveManualShape = (MANUAL_SHAPE_SYMBOLS.includes(manualShape as ShapeSymbolName)
    ? manualShape
    : DEFAULT_MANUAL_SHAPE) as ShapeSymbolName;

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
            title={field ? 'Shape is driven by the assigned field' : 'Pick a fixed shape'}
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
                <ShapeSymbolIcon symbol={effectiveManualShape} fontSize="small" />
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
              {MANUAL_SHAPE_SYMBOLS.map((symbol) => {
                const selected = symbol === effectiveManualShape;
                return (
                  <Box
                    key={symbol}
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
                    <ShapeSymbolIcon symbol={symbol} fontSize="small" />
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