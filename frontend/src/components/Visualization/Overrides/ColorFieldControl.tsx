// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { Box } from '@mui/material';
import { PropertyDropZone } from '../Properties/PropertyDropZone';
import ColorPalettePopover from '../Color/ColorPalettePopover';
import { Field } from '../../../types';
import FieldChip from '../FieldChip';
import { parseDragData } from './overrideUtils';
import { resolveSingleEncodingDropField } from '../../../utils/singleEncodingZone';

interface ColorFieldControlProps {
  field: Field | null;
  colorScheme: string;
  colorBias: number;
  colorReversed: boolean;
  manualColor: string;
  onDrop: (field: Field) => void;
  onRemove: (fieldIds: string[]) => void;
  onSchemeChange: (schemeId: string) => void;
  onColorChange: (color: string) => void;
  onBiasChange: (bias: number) => void;
  onReverseChange: (reversed: boolean) => void;
}

const ColorFieldControl: React.FC<ColorFieldControlProps> = ({
  field,
  colorScheme,
  colorBias,
  colorReversed,
  manualColor,
  onDrop,
  onRemove,
  onSchemeChange,
  onColorChange,
  onBiasChange,
  onReverseChange,
}) => {
  const handleDrop = (e: React.DragEvent) => {
    const { field: droppedField, source } = parseDragData(e);
    if (droppedField) {
      const fieldToSet = resolveSingleEncodingDropField({
        field: droppedField,
        source,
        zoneSource: 'COLOR_ZONE',
      });
      if (!fieldToSet) return;
      onDrop(fieldToSet);
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
        <ColorPalettePopover
          fieldFlavour={field ? field.flavour : null}
          currentSchemeId={colorScheme}
          onSchemeChange={onSchemeChange}
          colorBias={colorBias}
          onBiasChange={onBiasChange}
          colorReversed={colorReversed}
          onReverseChange={onReverseChange}
          manualColor={manualColor}
          onManualColorChange={onColorChange}
        />

        <Box sx={{ minWidth: 0 }}>
          <PropertyDropZone
            hasContent={field !== null}
            emptyMessage="Drag field"
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
                  source="COLOR_ZONE"
                  onUpdate={(updated) => {
                    const f = Array.isArray(updated) ? updated[0] : updated;
                    onDrop(f);
                  }}
                  onRemoveFromZone={(fieldIds) => onRemove(fieldIds)}
                />
              </Box>
            )}
          </PropertyDropZone>
        </Box>

      </Box>
    </Box>
  );
};

export default ColorFieldControl;

