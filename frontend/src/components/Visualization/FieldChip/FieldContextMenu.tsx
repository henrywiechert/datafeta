import React, { useCallback } from 'react';
import { Field } from '../../../types';
import { applyFieldUpdateRules } from './utils';
import { DragSource } from './types';
import ContextMenu from '../ContextMenu';
import FieldMenuItems from './FieldMenuItems';

interface FieldContextMenuProps {
  field: Field;
  source: DragSource;
  onUpdate: (fields: Field | Field[]) => void; // Accepts single field or array
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
    // Always work with an array - single field is just an array of length 1
    const fieldsToUpdate = selectedFields.length > 0 ? selectedFields : [field];
    
    // Apply updates to all fields
    const updatedFields = fieldsToUpdate
      .map(selectedField => applyFieldUpdateRules(selectedField, updates))
      .filter((f): f is Field => f !== null);
    
    if (updatedFields.length === 0) {
      onCloseMenu();
      return;
    }
    
    // Pass array to onUpdate - it handles both single and multiple
    onUpdate(updatedFields.length === 1 ? updatedFields[0] : updatedFields);
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
