import React, { useState } from 'react';
import { Box, IconButton, Popover, SvgIcon, ToggleButton, ToggleButtonGroup, Switch, Typography } from '@mui/material';
import { PropertyDropZone } from '../Properties/PropertyDropZone';
import { Field, DataLabelMode } from '../../../types';
import FieldChip from '../FieldChip';
import { parseDragData } from './overrideUtils';

const TextInSquareIcon: React.FC<{ fontSize?: 'inherit' | 'small' | 'medium' | 'large' }> = ({ fontSize }) => (
  <SvgIcon fontSize={fontSize} viewBox="0 0 24 24">
    <rect x="4.5" y="4.5" width="15" height="15" rx="2" ry="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
    {/* Simple "T" glyph */}
    <path
      d="M8 9h8M12 9v8"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </SvgIcon>
);

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
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const popoverOpen = Boolean(anchorEl);

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
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'auto minmax(0, 1fr)',
          alignItems: 'center',
          gap: 0.5,
        }}
      >
        {/* Icon opens popover for enable/disable (and future options) */}
        <IconButton
          size="small"
          sx={{ width: 28, height: 28 }}
          onClick={(e) => setAnchorEl(e.currentTarget)}
        >
          <TextInSquareIcon fontSize="small" />
        </IconButton>

        <Box sx={{ minWidth: 0 }}>
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
                  // Keep dense even with many labels
                  maxHeight: 48,
                  overflowY: 'auto',
                  overflowX: 'hidden',
                }}
              >
                {labelFields.map((field: Field) => {
                  return (
                    <FieldChip
                      key={field.id}
                      field={field}
                      source="LABEL_ZONE"
                      onUpdate={(updated) => {
                        const f = Array.isArray(updated) ? updated[0] : updated;
                        // For override label fields, update by re-dropping (replacement semantics handled upstream)
                        onLabelDrop(f);
                      }}
                      onRemoveFromZone={(ids) => {
                        ids.forEach((id) => onLabelRemove(id));
                      }}
                    />
                  );
                })}
              </Box>
            )}
          </PropertyDropZone>
        </Box>
      </Box>

      <Popover
        open={popoverOpen}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        PaperProps={{ sx: { p: 1, width: 260 } }}
      >
        {showLabelsEnabled && onLabelsEnabledChange ? (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
            <Typography variant="body2">Show labels</Typography>
            <Switch
              size="small"
              checked={labelsEnabled}
              onChange={(e) => onLabelsEnabledChange(e.target.checked)}
            />
          </Box>
        ) : (
          <Typography variant="caption" sx={{ color: '#666' }}>
            Label options (coming soon)
          </Typography>
        )}
      </Popover>

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

