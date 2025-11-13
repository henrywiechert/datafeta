import { useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Field, DragSource } from '../types';
import { useVisualizationContext } from '../contexts/VisualizationContext';
import { useDataSource } from '../contexts/DataSourceContext';
import { DEFAULT_CATEGORICAL_SCHEME, DEFAULT_SEQUENTIAL_SCHEME } from '../config/colorSchemes';
import { useUndoRedo } from './useUndoRedo';

/**
 * Custom hook for handling drag and drop operations in the visualization
 * @param availableFields Optional override for available fields (includes virtual columns if provided)
 */
export function useDragDrop(availableFields?: Field[]) {
  const { state, dispatch, getUndoableSnapshot } = useVisualizationContext();
  const { dataSource } = useDataSource();
  const { xAxisFields, yAxisFields, filterFields } = state;
  const { recordAction } = useUndoRedo();
  
  // Use provided availableFields or fall back to dataSource.availableFields
  const fieldsToUse = availableFields || dataSource.availableFields;
  
  /**
   * Handle drops between axes or from available fields
   */
  const handleAxisDrop = useCallback((
    targetAxis: 'x' | 'y', 
    field: Field, 
    source: DragSource, 
    index?: number
  ) => {
    // Record current state for undo
    recordAction(getUndoableSnapshot());
    
    // Handle drops from available fields
    if (source === 'AVAILABLE_FIELDS') {
      // Find the field in available fields (includes virtual columns if provided)
      const sourceField = fieldsToUse.find(f => f.id === field.id);
      if (!sourceField) return;
      
      // Create an independent copy of the field with a new ID
      // This ensures that field properties can be changed independently on axes
      const fieldCopy = { ...sourceField, id: uuidv4() };
      
      // Add to target axis at the specified index or at the end
      const targetFields = targetAxis === 'x' ? [...xAxisFields] : [...yAxisFields];
      
      if (index !== undefined) {
        targetFields.splice(index, 0, fieldCopy);
      } else {
        targetFields.push(fieldCopy);
      }
      
      // Update the target axis
      dispatch({ 
        type: targetAxis === 'x' ? 'SET_X_AXIS_FIELDS' : 'SET_Y_AXIS_FIELDS', 
        payload: targetFields 
      });
      
      return;
    }
    
    // Handle drops between axes
    const sourceAxis = source === 'X_AXIS' ? 'x' : 'y';
    
    // Only proceed if we're moving between different axes
    if (sourceAxis !== targetAxis) {
      // Remove from source axis
      const sourceFields = sourceAxis === 'x' ? xAxisFields : yAxisFields;
      const newSourceFields = sourceFields.filter(f => f.id !== field.id);
      
      // Add to target axis
      const targetFields = targetAxis === 'x' ? xAxisFields : yAxisFields;
      const newTargetFields = [...targetFields];
      
      if (index !== undefined) {
        newTargetFields.splice(index, 0, field);
      } else {
        newTargetFields.push(field);
      }
      
      // Update both axes
      dispatch({ 
        type: sourceAxis === 'x' ? 'SET_X_AXIS_FIELDS' : 'SET_Y_AXIS_FIELDS', 
        payload: newSourceFields 
      });
      dispatch({ 
        type: targetAxis === 'x' ? 'SET_X_AXIS_FIELDS' : 'SET_Y_AXIS_FIELDS', 
        payload: newTargetFields 
      });
    }
  }, [dispatch, fieldsToUse, xAxisFields, yAxisFields, recordAction, getUndoableSnapshot]);
  
  /**
   * Remove a field from either axis
   */
  const handleRemoveFromAxis = useCallback((fieldId: string) => {
    // Record current state for undo
    recordAction(getUndoableSnapshot());
    
    const newXFields = xAxisFields.filter(f => f.id !== fieldId);
    const newYFields = yAxisFields.filter(f => f.id !== fieldId);
    dispatch({ type: 'SET_X_AXIS_FIELDS', payload: newXFields });
    dispatch({ type: 'SET_Y_AXIS_FIELDS', payload: newYFields });
  }, [dispatch, xAxisFields, yAxisFields, recordAction, getUndoableSnapshot]);
  
  /**
   * Reorder fields within an axis
   */
  const handleReorderFields = useCallback((axis: 'x' | 'y', fromIndex: number, toIndex: number) => {
    // Record current state for undo
    recordAction(getUndoableSnapshot());
    
    const currentFields = axis === 'x' ? xAxisFields : yAxisFields;
    const newFields = [...currentFields];
    
    // Remove the field from its current position
    const [movedField] = newFields.splice(fromIndex, 1);
    // Insert it at the new position
    newFields.splice(toIndex, 0, movedField);
    
    dispatch({ 
      type: axis === 'x' ? 'SET_X_AXIS_FIELDS' : 'SET_Y_AXIS_FIELDS', 
      payload: newFields 
    });
  }, [dispatch, xAxisFields, yAxisFields, recordAction, getUndoableSnapshot]);

  /**
   * Handle drops on the filter zone
   */
  const handleFilterDrop = useCallback((field: Field, source: DragSource) => {
    // Record current state for undo
    recordAction(getUndoableSnapshot());
    // Handle drops from available fields or axes
    if (source === 'AVAILABLE_FIELDS') {
      // Find the field in available fields (includes virtual columns)
      const sourceField = fieldsToUse.find(f => f.id === field.id);
      if (!sourceField) return;
      
      // Create an independent copy of the field with a new ID
      const fieldCopy = { ...sourceField, id: uuidv4() };
      
      // Add to filter fields
      dispatch({ 
        type: 'SET_FILTER_FIELDS', 
        payload: [...filterFields, fieldCopy]
      });
    } else if (source === 'X_AXIS' || source === 'Y_AXIS') {
      // Copy field from axis to filters (keep it on the axis too)
      const fieldCopy = { ...field, id: uuidv4() };
      dispatch({ 
        type: 'SET_FILTER_FIELDS', 
        payload: [...filterFields, fieldCopy]
      });
    }
  }, [dispatch, fieldsToUse, filterFields, recordAction, getUndoableSnapshot]);

  /**
   * Remove a field from the filter zone
   */
  const handleRemoveFromFilter = useCallback((fieldId: string) => {
    // Record current state for undo
    recordAction(getUndoableSnapshot());
    
    const newFilterFields = filterFields.filter(f => f.id !== fieldId);
    dispatch({ type: 'SET_FILTER_FIELDS', payload: newFilterFields });
    // Also remove the filter configuration
    dispatch({ type: 'REMOVE_FILTER_CONFIGURATION', payload: fieldId });
  }, [dispatch, filterFields, recordAction, getUndoableSnapshot]);

  /**
   * Handle drops on the color zone (replaces existing field)
   */
  const handleColorDrop = useCallback((field: Field, source: DragSource) => {
    // Record current state for undo
    recordAction(getUndoableSnapshot());
    let fieldToSet: Field;
    
    if (source === 'AVAILABLE_FIELDS') {
      // Find the field in available fields (includes virtual columns)
      const sourceField = fieldsToUse.find(f => f.id === field.id);
      if (!sourceField) return;
      
      // Create an independent copy of the field with a new ID
      fieldToSet = { ...sourceField, id: uuidv4() };
    } else if (source === 'COLOR_ZONE') {
      // Update from color zone itself (e.g., aggregation change)
      fieldToSet = field;
    } else {
      // Copy from axis (keep it on the axis too)
      fieldToSet = { ...field, id: uuidv4() };
    }
    
    // Replace the existing color field with the new one
    dispatch({ type: 'SET_COLOR_FIELD', payload: fieldToSet });

    if (!state.colorField || state.colorField.flavour !== fieldToSet.flavour) {
      const nextScheme = fieldToSet.flavour === 'continuous' ? DEFAULT_SEQUENTIAL_SCHEME : DEFAULT_CATEGORICAL_SCHEME;
      dispatch({ type: 'SET_COLOR_SCHEME', payload: nextScheme });
    }
  }, [dispatch, fieldsToUse, state.colorField, recordAction, getUndoableSnapshot]);

  /**
   * Remove the field from the color zone
   */
  const handleRemoveFromColor = useCallback(() => {
    // Record current state for undo
    recordAction(getUndoableSnapshot());
    
    dispatch({ type: 'REMOVE_COLOR_FIELD' });
  }, [dispatch, recordAction, getUndoableSnapshot]);

  /**
   * Handle drops on the size zone (replaces existing field)
   */
  const handleSizeDrop = useCallback((field: Field, source: DragSource) => {
    // Record current state for undo
    recordAction(getUndoableSnapshot());
    let fieldToSet: Field;
    
    if (source === 'AVAILABLE_FIELDS') {
      // Find the field in available fields (includes virtual columns)
      const sourceField = fieldsToUse.find(f => f.id === field.id);
      if (!sourceField) return;
      
      // Create an independent copy of the field with a new ID
      fieldToSet = { ...sourceField, id: uuidv4() };
    } else if (source === 'SIZE_ZONE') {
      // Update from size zone itself (e.g., aggregation change)
      fieldToSet = field;
    } else {
      // Copy from axis (keep it on the axis too)
      fieldToSet = { ...field, id: uuidv4() };
    }
    
    // Replace the existing size field with the new one
    dispatch({ type: 'SET_SIZE_FIELD', payload: fieldToSet });
  }, [dispatch, fieldsToUse, recordAction, getUndoableSnapshot]);

  /**
   * Remove the field from the size zone
   */
  const handleRemoveFromSize = useCallback(() => {
    // Record current state for undo
    recordAction(getUndoableSnapshot());
    
    dispatch({ type: 'REMOVE_SIZE_FIELD' });
  }, [dispatch, recordAction, getUndoableSnapshot]);

  // Label drop: similar to color/size but supports multiple fields (set semantics by columnName)
  const handleLabelDrop = useCallback((field: Field, source: DragSource) => {
    // Record current state for undo
    recordAction(getUndoableSnapshot());
    let fieldToAdd: Field;
    if (source === 'AVAILABLE_FIELDS') {
      const sourceField = fieldsToUse.find(f => f.id === field.id);
      if (!sourceField) return;
      fieldToAdd = { ...sourceField, id: uuidv4() };
    } else if (source === 'X_AXIS' || source === 'Y_AXIS' || source === 'COLOR_ZONE' || source === 'SIZE_ZONE') {
      const axisFields = source === 'X_AXIS' ? state.xAxisFields : state.yAxisFields;
      const measureCount = axisFields.filter(f => f.type === 'measure').length;
      if (field.type === 'measure' && measureCount > 1) {
        fieldToAdd = { id: uuidv4(), columnName: '__current_measure__', type: 'special' } as any;
      } else {
        fieldToAdd = { ...field, id: uuidv4() };
      }
    } else {
      fieldToAdd = { ...field, id: uuidv4() };
    }
    dispatch({ type: 'ADD_LABEL_FIELD', payload: fieldToAdd });
  }, [dispatch, fieldsToUse, state.xAxisFields, state.yAxisFields, recordAction, getUndoableSnapshot]);

  const handleRemoveFromLabel = useCallback((fieldId: string) => {
    // Record current state for undo
    recordAction(getUndoableSnapshot());
    
    dispatch({ type: 'REMOVE_LABEL_FIELD', payload: fieldId });
  }, [dispatch, recordAction, getUndoableSnapshot]);

  return {
    handleAxisDrop,
    handleRemoveFromAxis,
    handleReorderFields,
    handleFilterDrop,
    handleRemoveFromFilter,
    handleColorDrop,
    handleRemoveFromColor,
    handleSizeDrop,
    handleRemoveFromSize,
    handleLabelDrop,
    handleRemoveFromLabel,
  };
}
