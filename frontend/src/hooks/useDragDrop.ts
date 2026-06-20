// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { useCallback, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Field, DragSource } from '../types';
import { isMeasureNamesField, isMeasureValuesField } from '../utils/syntheticFields';
import { useVisualizationContext } from '../contexts/VisualizationContext';
import { useDataSource } from '../contexts/DataSourceContext';
import { DEFAULT_CATEGORICAL_SCHEME, DEFAULT_SEQUENTIAL_SCHEME } from '../config/colorSchemes';
import { useUndoRedo } from './useUndoRedo';
import { resolveSingleEncodingDropField } from '../utils/singleEncodingZone';

/**
 * Custom hook for handling drag and drop operations in the visualization
 * @param availableFields Optional override for available fields (includes virtual columns if provided)
 * 
 * PERFORMANCE NOTE: This hook uses refs to store frequently-changing state (axis fields, filter fields)
 * so that callbacks remain stable across re-renders. This prevents unnecessary re-renders of components
 * like FieldsPanel that receive these callbacks as props.
 */
export function useDragDrop(
  availableFields?: Field[],
  axisDropFieldIdsRef?: { current: string[] | null },
) {
  const { state, dispatch, getUndoableSnapshot } = useVisualizationContext();
  const { dataSource } = useDataSource();
  const { xAxisFields, yAxisFields, filterFields, tableColumnFields } = state;
  const { recordAction } = useUndoRedo();
  
  // Use provided availableFields or fall back to dataSource.availableFields
  const fieldsToUse = availableFields || dataSource.availableFields;
  
  // === REFS FOR STABLE CALLBACKS ===
  // Store frequently-changing state in refs so callbacks don't need to be recreated
  // when this state changes. Callbacks read from refs at execution time.
  const xAxisFieldsRef = useRef(xAxisFields);
  const yAxisFieldsRef = useRef(yAxisFields);
  const filterFieldsRef = useRef(filterFields);
  const fieldsToUseRef = useRef(fieldsToUse);
  const colorFieldRef = useRef(state.colorField);
  const tableColumnFieldsRef = useRef(tableColumnFields);
  
  // Keep refs synchronized with latest state
  useEffect(() => {
    xAxisFieldsRef.current = xAxisFields;
  }, [xAxisFields]);
  
  useEffect(() => {
    yAxisFieldsRef.current = yAxisFields;
  }, [yAxisFields]);
  
  useEffect(() => {
    filterFieldsRef.current = filterFields;
  }, [filterFields]);
  
  useEffect(() => {
    fieldsToUseRef.current = fieldsToUse;
  }, [fieldsToUse]);
  
  useEffect(() => {
    colorFieldRef.current = state.colorField;
  }, [state.colorField]);

  useEffect(() => {
    tableColumnFieldsRef.current = tableColumnFields;
  }, [tableColumnFields]);
  
  /**
   * Handle drops between axes or from available fields
   * Always receives fields as an array (single field = array of length 1)
   */
  const handleAxisDrop = useCallback((
    targetAxis: 'x' | 'y', 
    field: Field | Field[], 
    source: DragSource, 
    index?: number
  ) => {
    // Record current state for undo
    recordAction(getUndoableSnapshot());
    
    // Ensure we're working with an array
    const fieldsToAdd = Array.isArray(field) ? field : [field];
    
    if (fieldsToAdd.length === 0) return;
    
    // Read current state from refs for stable callback
    const currentXFields = xAxisFieldsRef.current;
    const currentYFields = yAxisFieldsRef.current;
    const currentFieldsToUse = fieldsToUseRef.current;
    
    // Handle drops from available fields
    if (source === 'AVAILABLE_FIELDS') {
      // Create copies with new IDs for each field
      const fieldCopies = fieldsToAdd.map(f => {
        const sourceField = currentFieldsToUse.find(sf => sf.id === f.id);
        if (!sourceField) return null;
        return { ...sourceField, id: uuidv4() };
      }).filter(Boolean) as Field[];
      
      if (fieldCopies.length === 0) {
        if (axisDropFieldIdsRef) axisDropFieldIdsRef.current = null;
        return;
      }
      
      // Add to target axis at the specified index or at the end
      const targetFields = targetAxis === 'x' ? [...currentXFields] : [...currentYFields];
      
      if (index !== undefined) {
        targetFields.splice(index, 0, ...fieldCopies);
      } else {
        targetFields.push(...fieldCopies);
      }
      
      // Update the target axis
      if (axisDropFieldIdsRef) {
        axisDropFieldIdsRef.current = fieldCopies.map((f) => f.id);
      }
      dispatch({ 
        type: targetAxis === 'x' ? 'SET_X_AXIS_FIELDS' : 'SET_Y_AXIS_FIELDS',
        payload: targetFields
      });
      
      return;
    }
    
    if (source === 'MEASURE_GROUP') {
      // Use the dragged field copies directly
      const fieldCopies = fieldsToAdd.map(f => ({ ...f, id: uuidv4() }));
      
      if (fieldCopies.length === 0) {
        if (axisDropFieldIdsRef) axisDropFieldIdsRef.current = null;
        return;
      }
      
      // Add to target axis at the specified index or at the end
      const targetFields = targetAxis === 'x' ? [...currentXFields] : [...currentYFields];
      
      if (index !== undefined) {
        targetFields.splice(index, 0, ...fieldCopies);
      } else {
        targetFields.push(...fieldCopies);
      }
      
      // Update the target axis
      if (axisDropFieldIdsRef) {
        axisDropFieldIdsRef.current = fieldCopies.map((f) => f.id);
      }
      dispatch({ 
        type: targetAxis === 'x' ? 'SET_X_AXIS_FIELDS' : 'SET_Y_AXIS_FIELDS',
        payload: targetFields
      });
      
      return;
    }
    
    if (axisDropFieldIdsRef) {
      axisDropFieldIdsRef.current = null;
    }

    // Handle drops between axes
    const sourceAxis = source === 'X_AXIS' ? 'x' : 'y';
    
    // Only proceed if we're moving between different axes
    if (sourceAxis !== targetAxis) {
      // Use atomic action for single field to avoid double query
      if (fieldsToAdd.length === 1) {
        dispatch({
          type: 'MOVE_FIELD_BETWEEN_AXES',
          payload: {
            fieldId: fieldsToAdd[0].id,
            fromAxis: sourceAxis,
            toAxis: targetAxis,
            insertIndex: index
          }
        });
      } else {
        // Multiple fields - remove from source and add to target
        const sourceFields = sourceAxis === 'x' ? currentXFields : currentYFields;
        const targetFields = targetAxis === 'x' ? currentXFields : currentYFields;
        const fieldIds = fieldsToAdd.map(f => f.id);
        const remainingSourceFields = sourceFields.filter(f => !fieldIds.includes(f.id));
        
        // Insert at specified index or append to target
        const updatedTargetFields = [...targetFields];
        if (index !== undefined) {
          updatedTargetFields.splice(index, 0, ...fieldsToAdd);
        } else {
          updatedTargetFields.push(...fieldsToAdd);
        }
        
        // Update both axes
        dispatch({ 
          type: sourceAxis === 'x' ? 'SET_X_AXIS_FIELDS' : 'SET_Y_AXIS_FIELDS', 
          payload: remainingSourceFields 
        });
        dispatch({ 
          type: targetAxis === 'x' ? 'SET_X_AXIS_FIELDS' : 'SET_Y_AXIS_FIELDS', 
          payload: updatedTargetFields 
        });
      }
    }
  }, [dispatch, recordAction, getUndoableSnapshot, axisDropFieldIdsRef]); // Stable deps only - state read from refs
  
  /**
   * Remove a field from either axis
   */
  const handleRemoveFromAxis = useCallback((fieldId: string) => {
    // Record current state for undo
    recordAction(getUndoableSnapshot());
    
    // Read current state from refs for stable callback
    const currentXFields = xAxisFieldsRef.current;
    const currentYFields = yAxisFieldsRef.current;
    
    // Check which axis contains the field and only update that axis
    const isInXAxis = currentXFields.some(f => f.id === fieldId);
    const isInYAxis = currentYFields.some(f => f.id === fieldId);
    
    if (isInXAxis) {
      const newXFields = currentXFields.filter(f => f.id !== fieldId);
      dispatch({ type: 'SET_X_AXIS_FIELDS', payload: newXFields });
    }
    
    if (isInYAxis) {
      const newYFields = currentYFields.filter(f => f.id !== fieldId);
      dispatch({ type: 'SET_Y_AXIS_FIELDS', payload: newYFields });
    }
  }, [dispatch, recordAction, getUndoableSnapshot]); // Stable deps only - state read from refs
  
  /**
   * Remove multiple fields from axes in a single batched operation
   * This avoids race conditions when removing multiple fields at once
   */
  const handleRemoveMultipleFromAxis = useCallback((fieldIds: string[]) => {
    // Record current state for undo
    recordAction(getUndoableSnapshot());
    
    // Read current state from refs for stable callback
    const currentXFields = xAxisFieldsRef.current;
    const currentYFields = yAxisFieldsRef.current;
    
    const fieldIdSet = new Set(fieldIds);
    const newXFields = currentXFields.filter(f => !fieldIdSet.has(f.id));
    const newYFields = currentYFields.filter(f => !fieldIdSet.has(f.id));
    
    // Only dispatch if fields were actually removed from that axis
    if (newXFields.length !== currentXFields.length) {
      dispatch({ type: 'SET_X_AXIS_FIELDS', payload: newXFields });
    }
    if (newYFields.length !== currentYFields.length) {
      dispatch({ type: 'SET_Y_AXIS_FIELDS', payload: newYFields });
    }
  }, [dispatch, recordAction, getUndoableSnapshot]); // Stable deps only - state read from refs
  
  /**
   * Reorder fields within an axis
   */
  const handleReorderFields = useCallback((axis: 'x' | 'y', fromIndex: number, toIndex: number) => {
    // Record current state for undo
    recordAction(getUndoableSnapshot());
    
    // Read current state from refs for stable callback
    const currentFields = axis === 'x' ? xAxisFieldsRef.current : yAxisFieldsRef.current;
    const newFields = [...currentFields];
    
    // Remove the field from its current position
    const [movedField] = newFields.splice(fromIndex, 1);
    // Insert it at the new position
    newFields.splice(toIndex, 0, movedField);
    
    dispatch({ 
      type: axis === 'x' ? 'SET_X_AXIS_FIELDS' : 'SET_Y_AXIS_FIELDS', 
      payload: newFields 
    });
  }, [dispatch, recordAction, getUndoableSnapshot]); // Stable deps only - state read from refs

  /**
   * Handle drops on the filter zone
   */
  const handleFilterDrop = useCallback((field: Field, source: DragSource) => {
    // Record current state for undo
    recordAction(getUndoableSnapshot());
    
    // Read current state from refs for stable callback
    const currentFieldsToUse = fieldsToUseRef.current;
    const currentFilterFields = filterFieldsRef.current;
    
    // Resolve the source field depending on where it came from
    let sourceField: Field | undefined;
    if (source === 'AVAILABLE_FIELDS') {
      sourceField = currentFieldsToUse.find(f => f.id === field.id);
      if (!sourceField) return;
      if (isMeasureNamesField(sourceField) || isMeasureValuesField(sourceField)) return;
    } else if (source === 'X_AXIS' || source === 'Y_AXIS') {
      if (isMeasureNamesField(field) || isMeasureValuesField(field)) return;
      sourceField = field;
    }
    if (!sourceField) return;

    // Delegate to the shared utility (creates a copy with new UUID).
    // selectedValues is left empty — useFilterMetadata will auto-initialise
    // the config because no pre-seeded config exists for the new field id.
    const fieldCopy = { ...sourceField, id: uuidv4() };
    dispatch({
      type: 'SET_FILTER_FIELDS',
      payload: [...currentFilterFields, fieldCopy],
    });
  }, [dispatch, recordAction, getUndoableSnapshot]); // Stable deps only - state read from refs

  /**
   * Remove a field from the filter zone
   */
  const handleRemoveFromFilter = useCallback((fieldId: string) => {
    // Record current state for undo
    recordAction(getUndoableSnapshot());
    
    // Read current state from refs for stable callback
    const currentFilterFields = filterFieldsRef.current;
    
    const newFilterFields = currentFilterFields.filter(f => f.id !== fieldId);
    dispatch({ type: 'SET_FILTER_FIELDS', payload: newFilterFields });
    // Also remove the filter configuration
    dispatch({ type: 'REMOVE_FILTER_CONFIGURATION', payload: fieldId });
  }, [dispatch, recordAction, getUndoableSnapshot]); // Stable deps only - state read from refs

  /**
   * Handle drops on the color zone (replaces existing field)
   */
  const handleColorDrop = useCallback((field: Field, source: DragSource) => {
    // Record current state for undo
    recordAction(getUndoableSnapshot());
    
    // Read current state from refs for stable callback
    const currentFieldsToUse = fieldsToUseRef.current;
    const currentColorField = colorFieldRef.current;
    
    const fieldToSet = resolveSingleEncodingDropField({
      field,
      source,
      zoneSource: 'COLOR_ZONE',
      availableFields: currentFieldsToUse,
    });
    if (!fieldToSet) return;
    
    // Replace the existing color field with the new one
    dispatch({ type: 'SET_COLOR_FIELD', payload: fieldToSet });

    if (!currentColorField || currentColorField.flavour !== fieldToSet.flavour) {
      const nextScheme = fieldToSet.flavour === 'continuous' ? DEFAULT_SEQUENTIAL_SCHEME : DEFAULT_CATEGORICAL_SCHEME;
      dispatch({ type: 'SET_COLOR_SCHEME', payload: nextScheme });
    }
  }, [dispatch, recordAction, getUndoableSnapshot]); // Stable deps only - state read from refs

  /**
   * Remove the field from the color zone
   * @param _fieldIds - Unused; included for signature consistency with other zones
   */
  const handleRemoveFromColor = useCallback((_fieldIds: string[]) => {
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
    
    // Read current state from refs for stable callback
    const currentFieldsToUse = fieldsToUseRef.current;
    
    const fieldToSet = resolveSingleEncodingDropField({
      field,
      source,
      zoneSource: 'SIZE_ZONE',
      availableFields: currentFieldsToUse,
    });
    if (!fieldToSet) return;
    
    // Replace the existing size field with the new one
    dispatch({ type: 'SET_SIZE_FIELD', payload: fieldToSet });
  }, [dispatch, recordAction, getUndoableSnapshot]); // Stable deps only - state read from refs

  /**
   * Remove the field from the size zone
   * @param _fieldIds - Unused; included for signature consistency with other zones
   */
  const handleRemoveFromSize = useCallback((_fieldIds: string[]) => {
    // Record current state for undo
    recordAction(getUndoableSnapshot());
    
    dispatch({ type: 'REMOVE_SIZE_FIELD' });
  }, [dispatch, recordAction, getUndoableSnapshot]);

  /**
   * Handle drops on the shape zone (replaces existing field, discrete only)
   */
  const handleShapeDrop = useCallback((field: Field, source: DragSource) => {
    // Record current state for undo
    recordAction(getUndoableSnapshot());

    // Read current state from refs for stable callback
    const currentFieldsToUse = fieldsToUseRef.current;

    const fieldToSet = resolveSingleEncodingDropField({
      field,
      source,
      zoneSource: 'SHAPE_ZONE',
      availableFields: currentFieldsToUse,
      requiredFlavour: 'discrete',
    });
    if (!fieldToSet) return;

    dispatch({ type: 'SET_SHAPE_FIELD', payload: fieldToSet });
  }, [dispatch, recordAction, getUndoableSnapshot]);

  /**
   * Remove the field from the shape zone
   * @param _fieldIds - Unused; included for signature consistency with other zones
   */
  const handleRemoveFromShape = useCallback((_fieldIds: string[]) => {
    // Record current state for undo
    recordAction(getUndoableSnapshot());

    dispatch({ type: 'REMOVE_SHAPE_FIELD' });
  }, [dispatch, recordAction, getUndoableSnapshot]);

  // Label drop: similar to color/size but supports multiple fields (set semantics by columnName)
  const handleLabelDrop = useCallback((field: Field, source: DragSource) => {
    // Record current state for undo
    recordAction(getUndoableSnapshot());
    
    // Read current state from refs for stable callback
    const currentFieldsToUse = fieldsToUseRef.current;
    const currentXFields = xAxisFieldsRef.current;
    const currentYFields = yAxisFieldsRef.current;
    
    let fieldToAdd: Field;
    if (source === 'AVAILABLE_FIELDS') {
      const sourceField = currentFieldsToUse.find(f => f.id === field.id);
      if (!sourceField) return;
      fieldToAdd = { ...sourceField, id: uuidv4() };
    } else if (source === 'X_AXIS' || source === 'Y_AXIS' || source === 'COLOR_ZONE' || source === 'SIZE_ZONE') {
      const axisFields = source === 'X_AXIS' ? currentXFields : currentYFields;
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
  }, [dispatch, recordAction, getUndoableSnapshot]); // Stable deps only - state read from refs

  const handleRemoveFromLabel = useCallback((fieldId: string) => {
    // Record current state for undo
    recordAction(getUndoableSnapshot());
    
    dispatch({ type: 'REMOVE_LABEL_FIELD', payload: fieldId });
  }, [dispatch, recordAction, getUndoableSnapshot]);

  const handleRemoveFromTooltip = useCallback((fieldId: string) => {
    // Record current state for undo
    recordAction(getUndoableSnapshot());

    dispatch({ type: 'REMOVE_TOOLTIP_FIELD', payload: fieldId });
  }, [dispatch, recordAction, getUndoableSnapshot]);

  /**
   * Remove the field from the background zone
   * @param _fieldIds - Unused; included for signature consistency with other zones
   */
  const handleRemoveFromBackground = useCallback((_fieldIds: string[]) => {
    // Record current state for undo
    recordAction(getUndoableSnapshot());
    
    dispatch({ type: 'REMOVE_FACET_BACKGROUND_FIELD' });
  }, [dispatch, recordAction, getUndoableSnapshot]);

  /**
   * Handle drops on the table view's "Columns" zone. Copies the dragged
   * field(s) in (new UUIDs), deduped by columnName against the existing list,
   * inserted at the requested index. No flavour-ordering constraint.
   */
  const handleTableColumnsDrop = useCallback((
    field: Field | Field[],
    source: DragSource,
    index?: number,
  ) => {
    recordAction(getUndoableSnapshot());

    const fieldsToAdd = Array.isArray(field) ? field : [field];
    if (fieldsToAdd.length === 0) return;

    const currentFieldsToUse = fieldsToUseRef.current;
    const currentColumns = tableColumnFieldsRef.current;
    const existingColumnNames = new Set(currentColumns.map(f => f.columnName));

    const resolved = fieldsToAdd.map(f => {
      // From the available fields tree, resolve the canonical field by id.
      const sourceField = source === 'AVAILABLE_FIELDS'
        ? currentFieldsToUse.find(sf => sf.id === f.id)
        : f;
      if (!sourceField) return null;
      return { ...sourceField, id: uuidv4() };
    }).filter(Boolean) as Field[];

    // Dedupe against existing columns and within the dropped batch.
    const seenInBatch = new Set<string>();
    const toInsert = resolved.filter(f => {
      if (existingColumnNames.has(f.columnName) || seenInBatch.has(f.columnName)) return false;
      seenInBatch.add(f.columnName);
      return true;
    });
    if (toInsert.length === 0) return;

    const newColumns = [...currentColumns];
    if (index !== undefined) {
      newColumns.splice(index, 0, ...toInsert);
    } else {
      newColumns.push(...toInsert);
    }
    dispatch({ type: 'SET_TABLE_COLUMN_FIELDS', payload: newColumns });
  }, [dispatch, recordAction, getUndoableSnapshot]); // Stable deps only - state read from refs

  const handleRemoveFromTableColumns = useCallback((fieldId: string) => {
    recordAction(getUndoableSnapshot());
    const currentColumns = tableColumnFieldsRef.current;
    const newColumns = currentColumns.filter(f => f.id !== fieldId);
    if (newColumns.length === currentColumns.length) return;
    dispatch({ type: 'SET_TABLE_COLUMN_FIELDS', payload: newColumns });
  }, [dispatch, recordAction, getUndoableSnapshot]); // Stable deps only - state read from refs

  const handleReorderTableColumns = useCallback((fromIndex: number, toIndex: number) => {
    recordAction(getUndoableSnapshot());
    const currentColumns = tableColumnFieldsRef.current;
    const newColumns = [...currentColumns];
    const [moved] = newColumns.splice(fromIndex, 1);
    newColumns.splice(toIndex, 0, moved);
    dispatch({ type: 'SET_TABLE_COLUMN_FIELDS', payload: newColumns });
  }, [dispatch, recordAction, getUndoableSnapshot]); // Stable deps only - state read from refs

  /**
   * Atomically move a field between axes without triggering double query
   */
  const handleMoveFieldBetweenAxes = useCallback((fieldId: string, fromAxis: 'x' | 'y', toAxis: 'x' | 'y', insertIndex?: number) => {
    // Record current state for undo
    recordAction(getUndoableSnapshot());
    
    dispatch({
      type: 'MOVE_FIELD_BETWEEN_AXES',
      payload: { fieldId, fromAxis, toAxis, insertIndex }
    });
  }, [dispatch, recordAction, getUndoableSnapshot]);

  return {
    handleAxisDrop,
    handleRemoveFromAxis,
    handleRemoveMultipleFromAxis,
    handleReorderFields,
    handleMoveFieldBetweenAxes,
    handleFilterDrop,
    handleRemoveFromFilter,
    handleColorDrop,
    handleRemoveFromColor,
    handleSizeDrop,
    handleRemoveFromSize,
    handleShapeDrop,
    handleRemoveFromShape,
    handleLabelDrop,
    handleRemoveFromLabel,
    handleRemoveFromTooltip,
    handleRemoveFromBackground,
    handleTableColumnsDrop,
    handleRemoveFromTableColumns,
    handleReorderTableColumns,
  };
}
