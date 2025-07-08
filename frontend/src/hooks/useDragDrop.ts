import { useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Field, DragSource } from '../types';
import { useVisualizationContext } from '../contexts/VisualizationContext';

/**
 * Custom hook for handling drag and drop operations in the visualization
 */
export function useDragDrop() {
  const { state, dispatch } = useVisualizationContext();
  const { xAxisFields, yAxisFields } = state;
  
  /**
   * Handle drops between axes or from available fields
   */
  const handleAxisDrop = useCallback((
    targetAxis: 'x' | 'y', 
    field: Field, 
    source: DragSource, 
    index?: number
  ) => {
    // Handle drops from available fields
    if (source === 'AVAILABLE_FIELDS') {
      // Find the field in available fields
      const sourceField = state.availableFields.find(f => f.id === field.id);
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
    const oppositeAxis = sourceAxis === 'x' ? 'y' : 'x';
    
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
  }, [dispatch, state.availableFields, xAxisFields, yAxisFields]);
  
  /**
   * Remove a field from either axis
   */
  const handleRemoveFromAxis = useCallback((fieldId: string) => {
    const newXFields = xAxisFields.filter(f => f.id !== fieldId);
    const newYFields = yAxisFields.filter(f => f.id !== fieldId);
    dispatch({ type: 'SET_X_AXIS_FIELDS', payload: newXFields });
    dispatch({ type: 'SET_Y_AXIS_FIELDS', payload: newYFields });
  }, [dispatch, xAxisFields, yAxisFields]);
  
  /**
   * Reorder fields within an axis
   */
  const handleReorderFields = useCallback((axis: 'x' | 'y', fromIndex: number, toIndex: number) => {
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
  }, [dispatch, xAxisFields, yAxisFields]);

  return {
    handleAxisDrop,
    handleRemoveFromAxis,
    handleReorderFields
  };
}
