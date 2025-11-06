import React from 'react';
import PaletteIcon from '@mui/icons-material/Palette';
import { Field, DragSource } from '../../../types';
import { PropertySection } from '../Properties';
import ColorDropZone from './ColorDropZone';
import ColorSchemeSelector from './ColorSchemeSelector';
import ColorBiasControl from './ColorBiasControl';

interface ColorPanelProps {
  colorField: Field | null;
  colorScheme?: string;
  colorBias?: number;
  onDrop: (field: Field, source: DragSource) => void;
  onRemove: () => void;
  onSchemeChange?: (schemeId: string) => void;
  onBiasChange?: (bias: number) => void;
}

const ColorPanel: React.FC<ColorPanelProps> = ({
  colorField,
  colorScheme = 'tableau10',
  colorBias = 0,
  onDrop,
  onRemove,
  onSchemeChange,
  onBiasChange,
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
        ) : null
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

