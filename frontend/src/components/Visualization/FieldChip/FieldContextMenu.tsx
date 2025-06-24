import React, { useCallback, useState } from 'react';
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
}

const FieldContextMenu: React.FC<FieldContextMenuProps> = ({ 
  field, 
  source, 
  onUpdate, 
  menuPosition, 
  onCloseMenu 
}) => {
  const handleUpdate = useCallback((updates: Partial<Field>) => {
    const updatedField = applyFieldUpdateRules(field, updates);
    
    // If null is returned, the update wasn't allowed by the rules
    if (updatedField) {
      onUpdate(updatedField);
      onCloseMenu();
    }
  }, [field, onUpdate, onCloseMenu]);
  
  if (!menuPosition) {
    return null;
  }

  return (
    <ContextMenu position={menuPosition} onClose={onCloseMenu}>
      <FieldMenuItems 
        field={field}
        source={source}
        onUpdate={handleUpdate}
      />
    </ContextMenu>
  );
};

export default FieldContextMenu;
