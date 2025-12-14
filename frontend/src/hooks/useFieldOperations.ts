import { useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Field } from '../types';

interface DataSourceSetters {
    setSelectedDatabase: (db: string) => void;
    setSelectedTable: (table: string) => void;
    setTables: (tables: any[]) => void;
    setAvailableFields: (fields: Field[]) => void;
}

interface UseFieldOperationsParams {
    xAxisFields: Field[];
    yAxisFields: Field[];
    availableFieldsWithVirtual: Field[];
    availableFields: Field[];
    dispatch: React.Dispatch<any>;
    dataSourceSetters: DataSourceSetters;
}

export interface UseFieldOperationsReturn {
    handleDropFromAvailableFields: (targetAxis: 'x' | 'y', fieldId: string, insertIndex?: number) => void;
    handleRemoveFromAxis: (fieldId: string) => void;
    handleRemoveMultipleFromAxis: (fieldIds: string[]) => void;
    handleFieldUpdate: (updatedField: Field | Field[]) => void; // Now accepts single or array
    handleReorderFields: (axis: 'x' | 'y', fromIndex: number, toIndex: number) => void;
    handleMoveFieldBetweenAxes: (fieldId: string, fromAxis: 'x' | 'y', toAxis: 'x' | 'y', insertIndex?: number) => void;
    handleDatabaseSelect: (dbName: string) => void;
    handleTableSelect: (tableName: string) => void;
}

export function useFieldOperations({
    xAxisFields,
    yAxisFields,
    availableFieldsWithVirtual,
    availableFields,
    dispatch,
    dataSourceSetters
}: UseFieldOperationsParams): UseFieldOperationsReturn {
    // Use refs to access current values without causing callback recreation
    const availableFieldsRef = useRef(availableFields);
    availableFieldsRef.current = availableFields;
    
    const xAxisFieldsRef = useRef(xAxisFields);
    xAxisFieldsRef.current = xAxisFields;
    
    const yAxisFieldsRef = useRef(yAxisFields);
    yAxisFieldsRef.current = yAxisFields;
    
    const availableFieldsWithVirtualRef = useRef(availableFieldsWithVirtual);
    availableFieldsWithVirtualRef.current = availableFieldsWithVirtual;

    const handleDropFromAvailableFields = useCallback((targetAxis: 'x' | 'y', fieldId: string | string[], insertIndex?: number) => {
        // Always work with arrays (single field = array of length 1)
        const fieldIds = Array.isArray(fieldId) ? fieldId : [fieldId];
        
        // Map field IDs to actual field objects with new UUIDs
        const fieldsToAdd = fieldIds.map(id => {
            const field = availableFieldsWithVirtualRef.current.find(f => f.id === id);
            if (!field) return null;
            return { ...field, id: uuidv4() };
        }).filter(Boolean) as Field[];

        if (fieldsToAdd.length === 0) return;
        
        // Get current fields for target axis
        const currentFields = targetAxis === 'x' ? xAxisFieldsRef.current : yAxisFieldsRef.current;
        
        // Insert fields at specified index or append to end
        const newFields = [...currentFields];
        if (insertIndex !== undefined) {
            newFields.splice(insertIndex, 0, ...fieldsToAdd);
        } else {
            newFields.push(...fieldsToAdd);
        }
        
        // Update target axis
        dispatch({ 
            type: targetAxis === 'x' ? 'SET_X_AXIS_FIELDS' : 'SET_Y_AXIS_FIELDS', 
            payload: newFields 
        });
    }, [dispatch]);

    const handleRemoveFromAxis = useCallback((fieldId: string) => {
        const newXFields = xAxisFieldsRef.current.filter(f => f.id !== fieldId);
        const newYFields = yAxisFieldsRef.current.filter(f => f.id !== fieldId);
        dispatch({ type: 'SET_X_AXIS_FIELDS', payload: newXFields });
        dispatch({ type: 'SET_Y_AXIS_FIELDS', payload: newYFields });
    }, [dispatch]);
    
    // Batch removal for multiple fields to avoid race conditions
    const handleRemoveMultipleFromAxis = useCallback((fieldIds: string[]) => {
        const fieldIdSet = new Set(fieldIds);
        const newXFields = xAxisFieldsRef.current.filter(f => !fieldIdSet.has(f.id));
        const newYFields = yAxisFieldsRef.current.filter(f => !fieldIdSet.has(f.id));
        dispatch({ type: 'SET_X_AXIS_FIELDS', payload: newXFields });
        dispatch({ type: 'SET_Y_AXIS_FIELDS', payload: newYFields });
    }, [dispatch]);

    // Helper function for batch update logic (used by handleFieldUpdate)
    const batchUpdateFields = useCallback((updatedFields: Field[]) => {
        // Update fields in axes (via VisualizationContext)
        updatedFields.forEach(field => {
            dispatch({ type: 'UPDATE_FIELD', payload: field });
        });
        
        // Build a map for quick lookup
        const updatedFieldsMap = new Map(updatedFields.map(f => [f.id, f]));
        
        // Check if any are virtual columns
        const virtualFields = updatedFields.filter(f => (f as any).is_virtual === true);
        const regularFields = updatedFields.filter(f => !(f as any).is_virtual);
        
        // Update virtual column preferences
        virtualFields.forEach(field => {
            dispatch({
                type: 'UPDATE_VIRTUAL_COLUMN_FIELD_PREFERENCE',
                payload: {
                    columnName: field.columnName,
                    preference: {
                        type: field.type,
                        flavour: field.flavour,
                        aggregation: field.aggregation,
                    },
                },
            });
        });
        
        // Update regular fields in availableFields in one batch
        if (regularFields.length > 0) {
            const currentAvailableFields = availableFieldsRef.current;
            const updatedAvailableFields = currentAvailableFields.map((f) => 
                updatedFieldsMap.has(f.id) ? updatedFieldsMap.get(f.id)! : f
            );
            if (updatedAvailableFields.some((f, i) => f !== currentAvailableFields[i])) {
                dataSourceSetters.setAvailableFields(updatedAvailableFields);
            }
        }
    }, [dispatch, dataSourceSetters]);

    const handleFieldUpdate = useCallback((updatedField: Field | Field[]) => {
        // Normalize to array for consistent handling
        const fieldsToUpdate = Array.isArray(updatedField) ? updatedField : [updatedField];
        
        // If only one field, use the simple path for performance
        if (fieldsToUpdate.length === 1) {
            const field = fieldsToUpdate[0];
            
            // Update field in the axis fields (via VisualizationContext)
            dispatch({ type: 'UPDATE_FIELD', payload: field });
            
            // Check if this is a virtual column field
            // @ts-ignore - is_virtual is added dynamically
            const isVirtual = field.is_virtual === true;
            
            if (isVirtual) {
                dispatch({
                    type: 'UPDATE_VIRTUAL_COLUMN_FIELD_PREFERENCE',
                    payload: {
                        columnName: field.columnName,
                        preference: {
                            type: field.type,
                            flavour: field.flavour,
                            aggregation: field.aggregation,
                        },
                    },
                });
            } else {
                const currentAvailableFields = availableFieldsRef.current;
                const updatedAvailableFields = currentAvailableFields.map((f) => 
                    f.id === field.id ? field : f
                );
                if (updatedAvailableFields.some((f, i) => f !== currentAvailableFields[i])) {
                    dataSourceSetters.setAvailableFields(updatedAvailableFields);
                }
            }
        } else {
            // Multiple fields - use batch update logic
            batchUpdateFields(fieldsToUpdate);
        }
    }, [dispatch, dataSourceSetters, batchUpdateFields]);

    const handleReorderFields = useCallback((axis: 'x' | 'y', fromIndex: number, toIndex: number) => {
        const currentFields = axis === 'x' ? xAxisFieldsRef.current : yAxisFieldsRef.current;
        const newFields = [...currentFields];
        
        // Remove the field from its current position
        const [movedField] = newFields.splice(fromIndex, 1);
        // Insert it at the new position
        newFields.splice(toIndex, 0, movedField);
        
        if (axis === 'x') {
            dispatch({ type: 'SET_X_AXIS_FIELDS', payload: newFields });
        } else {
            dispatch({ type: 'SET_Y_AXIS_FIELDS', payload: newFields });
        }
    }, [dispatch]);

    const handleMoveFieldBetweenAxes = useCallback((fieldId: string, fromAxis: 'x' | 'y', toAxis: 'x' | 'y', insertIndex?: number) => {
        // Use atomic action to move field between axes without triggering double query
        dispatch({ 
            type: 'MOVE_FIELD_BETWEEN_AXES', 
            payload: { fieldId, fromAxis, toAxis, insertIndex } 
        });
    }, [dispatch]);

    const handleDatabaseSelect = useCallback((dbName: string) => {
        dataSourceSetters.setSelectedDatabase(dbName);
        dataSourceSetters.setSelectedTable('');
        dataSourceSetters.setTables([]);
        dataSourceSetters.setAvailableFields([]);
        // Dispatch to VisualizationContext to increment queryVersion
        dispatch({ type: 'SET_SELECTED_DATABASE', payload: dbName });
        dispatch({ type: 'SET_SELECTED_TABLE', payload: '' });
    }, [dataSourceSetters, dispatch]);

    const handleTableSelect = useCallback((tableName: string) => {
        dataSourceSetters.setSelectedTable(tableName);
        // Clear existing fields when table changes
        dataSourceSetters.setAvailableFields([]);
        // Dispatch to VisualizationContext to increment queryVersion
        dispatch({ type: 'SET_SELECTED_TABLE', payload: tableName });
        // Fetch suggested joins for the new table (will be called after table is set)
        // The useEffect below will trigger fetchSuggestedJoins
    }, [dataSourceSetters, dispatch]);

    return {
        handleDropFromAvailableFields,
        handleRemoveFromAxis,
        handleRemoveMultipleFromAxis,
        handleFieldUpdate,
        handleReorderFields,
        handleMoveFieldBetweenAxes,
        handleDatabaseSelect,
        handleTableSelect,
    };
}
