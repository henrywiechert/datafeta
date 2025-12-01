import React, { useCallback } from 'react';
import { Field } from '../../../types';
import { applyFieldUpdateRules } from './utils';
import { DragSource } from './types';
import ContextMenu from '../ContextMenu';
import FieldMenuItems from './FieldMenuItems';

interface FieldContextMenuProps {
  field: Field;
  source: DragSource;
  onUpdate: (field: Field) => void;
  menuPosition: { x: number; y: number } | null;
  onCloseMenu: () => void;
  selectedFields?: Field[]; // For bulk editing
}

const FieldContextMenu: React.FC<FieldContextMenuProps> = ({ 
  field, 
  source, 
  onUpdate, 
  menuPosition, 
  onCloseMenu,
  selectedFields = []
}) => {
  const handleUpdate = useCallback((updates: Partial<Field>) => {
    // If multiple fields are selected, update all of them
    if (selectedFields.length > 1) {
      selectedFields.forEach(selectedField => {
        const updatedField = applyFieldUpdateRules(selectedField, updates);
        if (updatedField) {
          onUpdate(updatedField);
        }
      });
    } else {
      // Single field update
      const updatedField = applyFieldUpdateRules(field, updates);
      if (updatedField) {
        onUpdate(updatedField);
      }
    }
    onCloseMenu();
  }, [field, selectedFields, onUpdate, onCloseMenu]);
  
  if (!menuPosition) {
    return null;
  }

  return (
    <ContextMenu position={menuPosition} onClose={onCloseMenu}>
      <FieldMenuItems 
        field={field}
        source={source}
        onUpdate={handleUpdate}
        selectedFields={selectedFields}
      />
    </ContextMenu>
  );
};

export default FieldContextMenu;
