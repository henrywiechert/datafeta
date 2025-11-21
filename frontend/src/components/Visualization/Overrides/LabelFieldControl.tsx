import React from 'react';
import { Box, Typography, TextField, Chip, ToggleButton, ToggleButtonGroup, Switch, styled } from '@mui/material';
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
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {showDisplayLabel && onDisplayLabelChange && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="caption" sx={{ minWidth: 60 }}>
            Label
          </Typography>
          <TextField
            size="small"
            variant="outlined"
            label="Display label"
            value={displayLabel ?? ''}
            onChange={(e) => onDisplayLabelChange(e.target.value || undefined)}
            sx={{ flex: 1, minWidth: 0 }}
          />
        </Box>
      )}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="caption" sx={{ minWidth: 60 }}>
          Label fields
        </Typography>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <PropertyDropZone
            hasContent={labelFields.length > 0}
            emptyMessage="Drag fields to show as labels"
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
                        ...(labelFields.length === 1
                          ? { flex: 1 }
                          : { maxWidth: 160 }),
                        ...getChipStyles(field),
                      }}
                    />
                  );
                })}
              </Box>
            )}
          </PropertyDropZone>
        </Box>
      </Box>
      {showDataLabelMode && onDataLabelModeChange && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="caption" sx={{ minWidth: 60 }}>
            Data labels
          </Typography>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={dataLabelMode}
            onChange={handleLabelModeChange}
          >
            {LABEL_MODE_OPTIONS.map((opt) => (
              <ToggleButton key={opt.value} value={opt.value}>
                <Typography variant="caption">{opt.label}</Typography>
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>
      )}
      {showLabelsEnabled && onLabelsEnabledChange && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="caption" sx={{ minWidth: 60 }}>
            Show labels
          </Typography>
          <Switch
            size="small"
            checked={labelsEnabled}
            onChange={(e) => onLabelsEnabledChange(e.target.checked)}
          />
        </Box>
      )}
    </Box>
  );
};

export default LabelFieldControl;

