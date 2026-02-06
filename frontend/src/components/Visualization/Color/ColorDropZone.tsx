import React from 'react';
import { Box } from '@mui/material';
import { Field, DragSource } from '../../../types';
import { readDragPayload } from '../../../utils/dragDataStore';
import { PropertyDropZone } from '../Properties';
import FieldChip from '../FieldChip';
import ColorPalettePopover from './ColorPalettePopover';
import styles from './ColorDropZone.module.css';

interface ColorDropZoneProps {
  colorField: Field | null;
  onDrop: (field: Field, source: DragSource) => void;
  onRemove: (fieldIds: string[]) => void;
  colorSchemeId?: string;
  onSchemeChange?: (schemeId: string) => void;
  manualColor?: string;
  onManualColorChange?: (color: string) => void;
  colorBias?: number;
  onBiasChange?: (bias: number) => void;
}

const ColorDropZone: React.FC<ColorDropZoneProps> = ({
  colorField,
  onDrop,
  onRemove,
  colorSchemeId,
  onSchemeChange,
  manualColor,
  onManualColorChange,
  colorBias,
  onBiasChange,
}) => {
  const handleDrop = (e: React.DragEvent) => {
    try {
      const parsedData = readDragPayload(e.nativeEvent.dataTransfer ?? undefined);
      if (parsedData) {
        const fields = parsedData.fields;
        const source = parsedData.source;
        
        // For color zone, only take the first field (single field only)
        if (fields && fields.length > 0) {
          onDrop(fields[0], source as DragSource);
        }
      }
    } catch (error) {
      console.error('Error handling drop:', error);
    }
  };

  return (
    <PropertyDropZone
      // Always render the row (so the palette icon is always visible).
      // We render the empty message ourselves inside the chip cell.
      hasContent={true}
      emptyMessage=""
      onDrop={handleDrop}
    >
      <Box className={styles.row}>
        <ColorPalettePopover
          fieldFlavour={colorField ? colorField.flavour : null}
          currentSchemeId={colorSchemeId}
          onSchemeChange={onSchemeChange}
          colorBias={colorBias}
          onBiasChange={onBiasChange}
          manualColor={manualColor}
          onManualColorChange={onManualColorChange}
        />

        <Box className={styles.chipCell}>
          {colorField ? (
            <FieldChip
              field={colorField}
              source="COLOR_ZONE"
              onUpdate={(updated) => {
                const f = Array.isArray(updated) ? updated[0] : updated;
                onDrop(f, 'COLOR_ZONE');
              }}
              onRemoveFromZone={(fieldIds) => onRemove(fieldIds)}
            />
          ) : (
            <Box className={styles.placeholder}>Drag a field here to color by</Box>
          )}
        </Box>
      </Box>
    </PropertyDropZone>
  );
};

export default ColorDropZone;

