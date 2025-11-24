import React from 'react';
import { Box, Typography, Chip, ToggleButton, ToggleButtonGroup, Switch, styled } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { PropertyDropZone } from '../Properties/PropertyDropZone';
import { Field, DataLabelMode } from '../../../types';
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

const LABEL_MODE_OPTIONS: { value: DataLabelMode; label: string }[] = [
  { value: 'inherit', label: 'Inherit' },
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
];

interface LabelFieldControlProps {
  labelFields?: Field[];
  displayLabel?: string;
  dataLabelMode?: DataLabelMode;
  showDisplayLabel?: boolean;
  showDataLabelMode?: boolean;
  showLabelsEnabled?: boolean;
  labelsEnabled?: boolean;
  onLabelDrop: (field: Field) => void;
  onLabelRemove: (fieldId: string) => void;
  onDisplayLabelChange?: (label: string | undefined) => void;
  onDataLabelModeChange?: (mode: DataLabelMode) => void;
  onLabelsEnabledChange?: (enabled: boolean) => void;
}

const LabelFieldControl: React.FC<LabelFieldControlProps> = ({
  labelFields = [],
  displayLabel,
  dataLabelMode = 'inherit',
  showDisplayLabel = false,
  showDataLabelMode = false,
  showLabelsEnabled = false,
  labelsEnabled = false,
  onLabelDrop,
  onLabelRemove,
  onDisplayLabelChange,
  onDataLabelModeChange,
  onLabelsEnabledChange,
}) => {
  const handleDrop = (e: React.DragEvent) => {
    const { field: droppedField } = parseDragData(e);
    if (droppedField) {
      onLabelDrop(droppedField);
    }
  };

  const handleLabelModeChange = (_: React.MouseEvent<HTMLElement>, value: DataLabelMode | null) => {
    if (value && onDataLabelModeChange) {
      onDataLabelModeChange(value);
    }
  };

  return (
    <Box sx={{ 
      display: 'flex', 
      flexDirection: 'column', 
      gap: 0.5,
      p: 0.75,
      border: '1px solid #d0d0d0',
      borderRadius: '4px',
      backgroundColor: '#fafafa'
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
        <Typography variant="caption" sx={{ minWidth: 50, fontSize: '0.7rem', fontWeight: 500 }}>
          Label
        </Typography>
        <Box sx={{ flex: 1, minWidth: 60 }}>
          <PropertyDropZone
            hasContent={labelFields.length > 0}
            emptyMessage="Drag fields"
            onDrop={handleDrop}
          >
            {labelFields.length > 0 && (
              <Box
                sx={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 0.5,
                  minWidth: 0,
                  width: '100%',
                }}
              >
                {labelFields.map((field: Field) => {
                  const labelText = getFieldDisplayName(field);
                  return (
                    <TruncatedChip
                      key={field.id}
                      label={labelText}
                      title={labelText}
                      onDelete={() => onLabelRemove(field.id)}
                      deleteIcon={<CloseIcon />}
                      size="small"
                      sx={{
                        height: 26,
                        fontSize: '0.75rem',
                        ...(labelFields.length === 1
                          ? { flex: 1 }
                          : { maxWidth: 140 }),
                        ...getChipStyles(field),
                      }}
                    />
                  );
                })}
              </Box>
            )}
          </PropertyDropZone>
        </Box>
        {showLabelsEnabled && onLabelsEnabledChange && (
          <Switch
            size="small"
            checked={labelsEnabled}
            onChange={(e) => onLabelsEnabledChange(e.target.checked)}
            sx={{ ml: 0.5 }}
          />
        )}
      </Box>
      {showDataLabelMode && onDataLabelModeChange && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, pl: 6.5 }}>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={dataLabelMode}
            onChange={handleLabelModeChange}
            sx={{ 
              height: 24,
              '& .MuiToggleButton-root': { 
                py: 0.25, 
                px: 1,
                fontSize: '0.7rem',
                textTransform: 'none'
              }
            }}
          >
            {LABEL_MODE_OPTIONS.map((opt) => (
              <ToggleButton key={opt.value} value={opt.value}>
                {opt.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>
      )}
    </Box>
  );
};

export default LabelFieldControl;

