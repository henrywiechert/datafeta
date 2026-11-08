// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { useEffect, useState } from 'react';
import { Box, IconButton, Popover, Slider, SvgIcon, ToggleButton, ToggleButtonGroup, Switch, Typography, Tooltip } from '@mui/material';
import { v4 as uuidv4 } from 'uuid';
import { PropertyDropZone } from '../Properties/PropertyDropZone';
import { Field, DataLabelMode } from '../../../types';
import FieldChip from '../FieldChip';
import { parseDragData } from './overrideUtils';
import { T } from '../../../theme/tokens';

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

type LabelSamplingStrategy = 'auto' | 'all' | 'sample';

/** Max labels per step; one extra step past the end means "all". */
const DENSITY_STEPS = [10, 25, 50, 100, 200, 300, 500, 1000, 2000, 5000];
const DENSITY_ALL_INDEX = DENSITY_STEPS.length;

function densityIndexOf(strategy: LabelSamplingStrategy, threshold: number): number {
  if (strategy === 'all') return DENSITY_ALL_INDEX;
  let best = 0;
  DENSITY_STEPS.forEach((step, i) => {
    if (Math.abs(step - threshold) < Math.abs(DENSITY_STEPS[best] - threshold)) best = i;
  });
  return best;
}

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
  labelSamplingStrategy?: LabelSamplingStrategy;
  labelSamplingThreshold?: number;
  onLabelDrop: (field: Field) => void;
  /** Replace an existing label field in place (e.g. after a context-menu edit). */
  onLabelUpdate: (field: Field) => void;
  onLabelRemove: (fieldId: string) => void;
  onDisplayLabelChange?: (label: string | undefined) => void;
  onDataLabelModeChange?: (mode: DataLabelMode) => void;
  onLabelsEnabledChange?: (enabled: boolean) => void;
  onLabelFontSizeChange?: (fontSize: number) => void;
  onLabelDensityChange?: (strategy: LabelSamplingStrategy, threshold: number) => void;
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
  labelSamplingStrategy = 'auto',
  labelSamplingThreshold = 300,
  onLabelDrop,
  onLabelUpdate,
  onLabelRemove,
  onDisplayLabelChange,
  onDataLabelModeChange,
  onLabelsEnabledChange,
  onLabelFontSizeChange,
  onLabelDensityChange,
}) => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const popoverOpen = Boolean(anchorEl);
  const committedDensity = densityIndexOf(labelSamplingStrategy, labelSamplingThreshold);
  const [densityIndex, setDensityIndex] = useState(committedDensity);
  useEffect(() => setDensityIndex(committedDensity), [committedDensity]);

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

  const handleDensityCommit = (_: unknown, value: number | number[]) => {
    if (!onLabelDensityChange) return;
    const index = Array.isArray(value) ? value[0] : value;
    if (index >= DENSITY_ALL_INDEX) onLabelDensityChange('all', labelSamplingThreshold);
    else onLabelDensityChange('auto', DENSITY_STEPS[index]);
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
                        onLabelUpdate(f);
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
        PaperProps={{
          sx: {
            p: 0.75,
            width: 220,
            borderRadius: 1,
          },
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          {showLabelsEnabled && onLabelsEnabledChange && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 1,
                minHeight: 28,
              }}
            >
              <Typography
                variant="body2"
                sx={{ fontSize: '0.7rem', fontWeight: 500, color: T.textControlLabel, lineHeight: 1.3 }}
              >
                Show labels
              </Typography>
              <Switch
                size="small"
                checked={labelsEnabled}
                onChange={(e) => onLabelsEnabledChange(e.target.checked)}
              />
            </Box>
          )}

          {showDataLabelMode && onDataLabelModeChange && (
            <Box>
              <Typography
                variant="body2"
                sx={{ mb: 0.25, fontSize: '0.7rem', fontWeight: 500, color: T.textControlLabel, lineHeight: 1.3 }}
              >
                Mode
              </Typography>
              <ToggleButtonGroup
                exclusive
                size="small"
                value={dataLabelMode}
                onChange={handleLabelModeChange}
                fullWidth
                sx={{
                  height: 24,
                  '& .MuiToggleButton-root': {
                    py: 0,
                    px: 0.75,
                    fontSize: '0.7rem',
                    textTransform: 'none',
                    lineHeight: 1.2,
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

          {onLabelDensityChange && (
            <Box
              sx={{
                px: 0.5,
                py: 0.25,
                borderRadius: 1,
                backgroundColor: T.surfaceSubtle,
              }}
            >
              <Typography
                variant="body2"
                sx={{ fontSize: '0.7rem', fontWeight: 500, color: T.textControlLabel, lineHeight: 1.3 }}
              >
                Label density: {densityIndex >= DENSITY_ALL_INDEX ? 'all' : `up to ${DENSITY_STEPS[densityIndex]}`}
              </Typography>
              <Slider
                size="small"
                value={densityIndex}
                min={0}
                max={DENSITY_ALL_INDEX}
                step={1}
                onChange={(_, value) => setDensityIndex(Array.isArray(value) ? value[0] : value)}
                onChangeCommitted={handleDensityCommit}
                valueLabelDisplay="off"
                marks={[
                  { value: 0, label: 'Min' },
                  { value: DENSITY_ALL_INDEX, label: 'All' },
                ]}
                sx={{
                  mt: 0.25,
                  mb: 0.5,
                  mx: 0.5,
                  width: 'calc(100% - 8px)',
                  '& .MuiSlider-markLabel': {
                    fontSize: '0.65rem',
                    top: 20,
                  },
                }}
              />
            </Box>
          )}

          {onLabelFontSizeChange && (
            <Box
              sx={{
                px: 0.5,
                py: 0.25,
                borderRadius: 1,
                backgroundColor: T.surfaceSubtle,
              }}
            >
              <Typography
                variant="body2"
                sx={{ fontSize: '0.7rem', fontWeight: 500, color: T.textControlLabel, lineHeight: 1.3 }}
              >
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
                sx={{
                  mt: 0.25,
                  mb: 0.5,
                  mx: 0.5,
                  width: 'calc(100% - 8px)',
                  '& .MuiSlider-markLabel': {
                    fontSize: '0.65rem',
                    top: 20,
                  },
                }}
              />
            </Box>
          )}

          {!showLabelsEnabled && !showDataLabelMode && !onLabelFontSizeChange && !onLabelDensityChange && (
            <Typography variant="caption" sx={{ color: T.textMuted, fontSize: '0.7rem' }}>
              Label options (coming soon)
            </Typography>
          )}
        </Box>
      </Popover>

    </Box>
  );
};

export default LabelFieldControl;

