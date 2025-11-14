import React from 'react';
import PaletteIcon from '@mui/icons-material/Palette';
import { Field, DragSource } from '../../../types';
import { PropertySection } from '../Properties';
import ColorDropZone from './ColorDropZone';
import ColorSchemeSelector from './ColorSchemeSelector';
import ColorBiasControl from './ColorBiasControl';
import ManualColorSelector from './ManualColorSelector';

interface ColorPanelProps {
  colorField: Field | null;
  colorScheme?: string;
  colorBias?: number;
  manualColor?: string;
  onDrop: (field: Field, source: DragSource) => void;
  onRemove: () => void;
  onSchemeChange?: (schemeId: string) => void;
  onBiasChange?: (bias: number) => void;
  onManualColorChange?: (color: string) => void;
}

const ColorPanel: React.FC<ColorPanelProps> = ({
  colorField,
  colorScheme = 'tableau10',
  colorBias = 0,
  manualColor = '#1976d2',
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
      headerActions={
        colorField && onSchemeChange ? (
          <ColorSchemeSelector
            currentSchemeId={colorScheme}
            fieldFlavour={colorField.flavour}
            onSchemeChange={onSchemeChange}
          />
        ) : (
          onManualColorChange && (
            <ManualColorSelector
              value={manualColor}
              onChange={onManualColorChange}
            />
          )
        )
      }
    >
      <ColorDropZone
        colorField={colorField}
        onDrop={onDrop}
        onRemove={onRemove}
      />
      {colorField && colorField.flavour === 'continuous' && onBiasChange && (
        <ColorBiasControl
          colorBias={colorBias}
          onChange={onBiasChange}
        />
      )}
    </PropertySection>
  );
};

export default ColorPanel;

