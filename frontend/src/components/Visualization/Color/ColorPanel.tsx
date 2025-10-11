import React from 'react';
import PaletteIcon from '@mui/icons-material/Palette';
import { Field, DragSource } from '../../../types';
import { PropertySection } from '../Properties';
import ColorDropZone from './ColorDropZone';
import ColorSchemeSelector from './ColorSchemeSelector';

interface ColorPanelProps {
  colorField: Field | null;
  colorScheme?: string;
  onDrop: (field: Field, source: DragSource) => void;
  onRemove: () => void;
  onSchemeChange?: (schemeId: string) => void;
}

const ColorPanel: React.FC<ColorPanelProps> = ({
  colorField,
  colorScheme = 'tableau10',
  onDrop,
  onRemove,
  onSchemeChange,
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
    </PropertySection>
  );
};

export default ColorPanel;

