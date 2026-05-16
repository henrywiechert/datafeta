// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { useState } from 'react';
import { Box, IconButton, Popover, Slider, SvgIcon, ToggleButton, ToggleButtonGroup, Switch, Typography, Tooltip } from '@mui/material';
import { v4 as uuidv4 } from 'uuid';
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

const FONT_SIZE_MIN = 8;
const FONT_SIZE_MAX = 26;

interface LabelFieldControlProps {
  labelFields?: Field[];
  displayLabel?: string;
  dataLabelMode?: DataLabelMode;
  showDisplayLabel?: boolean;
  showDataLabelMode?: boolean;
  showLabelsEnabled?: boolean;
  labelsEnabled?: boolean;
  labelFontSize?: number;
  onLabelDrop: (field: Field) => void;
  onLabelRemove: (fieldId: string) => void;
  onDisplayLabelChange?: (label: string | undefined) => void;
  onDataLabelModeChange?: (mode: DataLabelMode) => void;
  onLabelsEnabledChange?: (enabled: boolean) => void;
  onLabelFontSizeChange?: (fontSize: number) => void;
}

const LabelFieldControl: React.FC<LabelFieldControlProps> = ({
  labelFields = [],
  displayLabel,
  dataLabelMode = 'inherit',
  showDisplayLabel = false,
  showDataLabelMode = false,
  showLabelsEnabled = false,
  labelsEnabled = false,
  labelFontSize = 10,
  onLabelDrop,
  onLabelRemove,
  onDisplayLabelChange,
  onDataLabelModeChange,
  onLabelsEnabledChange,
  onLabelFontSizeChange,
}) => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const popoverOpen = Boolean(anchorEl);

  const handleDrop = (e: React.DragEvent) => {
    const { field: droppedField, source } = parseDragData(e);
    if (droppedField) {
      // Create an independent copy with a new ID when dropping from AVAILABLE_FIELDS or axes
      const isFromZone = source === 'LABEL_ZONE';
      const fieldToSet = isFromZone ? droppedField : { ...droppedField, id: uuidv4() };
      onLabelDrop(fieldToSet);
    }
  };

  const handleLabelModeChange = (_: React.MouseEvent<HTMLElement>, value: DataLabelMode | null) => {
    if (value && onDataLabelModeChange) {
      onDataLabelModeChange(value);
    }
  };

  const handleFontSizeChange = (_: Event, value: number | number[]) => {
    if (!onLabelFontSizeChange) return;
    const fontSize = Array.isArray(value) ? value[0] : value;
    onLabelFontSizeChange(fontSize);
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
        {/* Icon opens popover for enable/disable (and future options) */}
        <Tooltip title="Labels" placement="top" arrow enterDelay={500} leaveDelay={100}>
          <IconButton
            size="small"
            sx={{ width: 28, height: 28 }}
            onClick={(e) => setAnchorEl(e.currentTarget)}
          >
            <TextInSquareIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        <Box sx={{ minWidth: 0 }}>
          <PropertyDropZone
            hasContent={labelFields.length > 0}
            emptyMessage="Drag fields"
            variant="plain"
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
                  alignItems: 'center',
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
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {showLabelsEnabled && onLabelsEnabledChange && (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
              <Typography variant="body2">Show labels</Typography>
              <Switch
                size="small"
                checked={labelsEnabled}
                onChange={(e) => onLabelsEnabledChange(e.target.checked)}
              />
            </Box>
          )}

          {showDataLabelMode && onDataLabelModeChange && (
            <Box>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                Mode
              </Typography>
              <ToggleButtonGroup
                exclusive
                size="small"
                value={dataLabelMode}
                onChange={handleLabelModeChange}
                sx={{
                  height: 26,
                  '& .MuiToggleButton-root': {
                    py: 0.25,
                    px: 1,
                    fontSize: '0.7rem',
                    textTransform: 'none',
                  },
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

          {onLabelFontSizeChange && (
            <Box>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                Font size: {labelFontSize}px
              </Typography>
              <Slider
                size="small"
                value={labelFontSize}
                min={FONT_SIZE_MIN}
                max={FONT_SIZE_MAX}
                step={1}
                onChange={handleFontSizeChange}
                marks={[
                  { value: FONT_SIZE_MIN, label: `${FONT_SIZE_MIN}` },
                  { value: FONT_SIZE_MAX, label: `${FONT_SIZE_MAX}` },
                ]}
                sx={{ mx: 0.5 }}
              />
            </Box>
          )}

          {!showLabelsEnabled && !showDataLabelMode && !onLabelFontSizeChange && (
            <Typography variant="caption" sx={{ color: '#666' }}>
              Label options (coming soon)
            </Typography>
          )}
        </Box>
      </Popover>

    </Box>
  );
};

export default LabelFieldControl;

