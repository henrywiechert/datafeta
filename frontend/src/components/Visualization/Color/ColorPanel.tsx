// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import PaletteIcon from '@mui/icons-material/Palette';
import { Field, DragSource } from '../../../types';
import { PropertySection } from '../Properties';
import { DEFAULT_MANUAL_COLOR } from '../../../config/colorSchemes';
import ColorDropZone from './ColorDropZone';

interface ColorPanelProps {
  colorField: Field | null;
  colorScheme?: string;
  colorBias?: number;
  manualColor?: string;
  onDrop: (field: Field, source: DragSource) => void;
  onRemove: (fieldIds: string[]) => void;
  onSchemeChange?: (schemeId: string) => void;
  onBiasChange?: (bias: number) => void;
  onManualColorChange?: (color: string) => void;
}

const ColorPanel: React.FC<ColorPanelProps> = ({
  colorField,
  colorScheme = 'tableau10',
  colorBias = 0,
  manualColor = DEFAULT_MANUAL_COLOR,
  onDrop,
  onRemove,
  onSchemeChange,
  onBiasChange,
  onManualColorChange,
}) => {
  return (
    <PropertySection
      title="Color"
      icon={<PaletteIcon fontSize="small" />}
      defaultExpanded={true}
      storageKey="colorPanel.expanded"
    >
      <ColorDropZone
        colorField={colorField}
        onDrop={onDrop}
        onRemove={onRemove}
        colorSchemeId={colorScheme}
        onSchemeChange={onSchemeChange}
        manualColor={manualColor}
        onManualColorChange={onManualColorChange}
        colorBias={colorBias}
        onBiasChange={onBiasChange}
      />
    </PropertySection>
  );
};

export default ColorPanel;

