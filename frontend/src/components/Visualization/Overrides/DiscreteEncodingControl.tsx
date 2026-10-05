// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { Box, IconButton, Popover, Tooltip, Typography } from '@mui/material';
import { PropertyDropZone } from '../Properties/PropertyDropZone';
import { DragSource, Field } from '../../../types';
import FieldChip from '../FieldChip';
import { parseDragData } from './overrideUtils';
import { resolveSingleEncodingDropField } from '../../../utils/singleEncodingZone';
import { T } from '../../../theme/tokens';

export interface DiscreteEncodingControlProps<V extends string> {
  /** Channel name, e.g. "Shape"; used in the empty zone, tooltips and picker title. */
  label: string;
  zoneSource: DragSource;
  field: Field | null;
  /** Fixed value used while no field is assigned. */
  manualValue: V;
  manualOptions: readonly V[];
  renderOption: (value: V) => React.ReactNode;
  optionTitle: (value: V) => string;
  /** Tooltip of the manual picker button while no field is assigned. */
  manualTooltip: string;
  onDrop: (field: Field) => void;
  onManualChange: (value: V) => void;
  onRemove: (fieldIds: string[]) => void;
}

/**
 * Drop zone for a discrete-only encoding field, plus a picker for the fixed
 * value used while the zone is empty. The picker is disabled once a field
 * drives the channel.
 */
function DiscreteEncodingControl<V extends string>({
  label,
  zoneSource,
  field,
  manualValue,
  manualOptions,
  renderOption,
  optionTitle,
  manualTooltip,
  onDrop,
  onManualChange,
  onRemove,
}: DiscreteEncodingControlProps<V>): React.ReactElement {
  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);
  const pickerOpen = Boolean(anchorEl);

  const handleDrop = (e: React.DragEvent) => {
    const { field: droppedField, source } = parseDragData(e);
    if (!droppedField) return;

    const fieldToSet = resolveSingleEncodingDropField({
      field: droppedField,
      source,
      zoneSource,
      requiredFlavour: 'discrete',
    });
    if (!fieldToSet) {
      console.warn(`${label} field must be discrete (categorical). Continuous fields are not supported.`);
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
        <Tooltip
          title={field ? `${label} is driven by the assigned field` : manualTooltip}
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
              {renderOption(manualValue)}
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
          <Typography variant="caption" sx={{ display: 'block', mb: 0.75, fontWeight: 600, color: T.textMuted }}>
            {label}
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 32px)',
              gap: '6px',
              justifyContent: 'start',
            }}
          >
            {manualOptions.map((option) => {
              const selected = option === manualValue;
              return (
                <Box
                  key={option}
                  title={optionTitle(option)}
                  onClick={() => {
                    onManualChange(option);
                    handleClosePicker();
                  }}
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: 1,
                    border: selected ? `2px solid ${T.accentRing}` : `1px solid ${T.borderAlpha}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    color: selected ? 'primary.main' : T.textControlLabel,
                    backgroundColor: selected ? T.accentTintSelected : T.surfaceRaised,
                    '&:hover': {
                      backgroundColor: T.accentTintSelected,
                    },
                    transition: 'all 0.15s ease',
                  }}
                >
                  {renderOption(option)}
                </Box>
              );
            })}
          </Box>
        </Popover>

        <Box sx={{ minWidth: 0 }}>
          <PropertyDropZone
            hasContent={field !== null}
            emptyMessage={`${label} (discrete only)`}
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
                  source={zoneSource}
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
}

export default DiscreteEncodingControl;
