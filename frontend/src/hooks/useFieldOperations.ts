import { useCallback } from 'react';
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
    handleFieldUpdate: (updatedField: Field) => void;
    handleReorderFields: (axis: 'x' | 'y', fromIndex: number, toIndex: number) => void;
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

    const handleDropFromAvailableFields = useCallback((targetAxis: 'x' | 'y', fieldId: string, insertIndex?: number) => {
        const field = availableFieldsWithVirtual.find(f => f.id === fieldId);
        if (!field) return;

        const fieldToAdd = { ...field, id: uuidv4() };
        
        if (targetAxis === 'x') {
            const currentFields = xAxisFields;
            if (insertIndex !== undefined) {
                const newFields = [...currentFields];
                newFields.splice(insertIndex, 0, fieldToAdd);
                dispatch({ type: 'SET_X_AXIS_FIELDS', payload: newFields });
            } else {
                dispatch({ type: 'SET_X_AXIS_FIELDS', payload: [...currentFields, fieldToAdd] });
            }
        } else {
            const currentFields = yAxisFields;
            if (insertIndex !== undefined) {
                const newFields = [...currentFields];
                newFields.splice(insertIndex, 0, fieldToAdd);
                dispatch({ type: 'SET_Y_AXIS_FIELDS', payload: newFields });
            } else {
                dispatch({ type: 'SET_Y_AXIS_FIELDS', payload: [...currentFields, fieldToAdd] });
            }
        }
    }, [xAxisFields, yAxisFields, availableFieldsWithVirtual, dispatch]);

    const handleRemoveFromAxis = useCallback((fieldId: string) => {
        const newXFields = xAxisFields.filter(f => f.id !== fieldId);
        const newYFields = yAxisFields.filter(f => f.id !== fieldId);
        dispatch({ type: 'SET_X_AXIS_FIELDS', payload: newXFields });
        dispatch({ type: 'SET_Y_AXIS_FIELDS', payload: newYFields });
    }, [xAxisFields, yAxisFields, dispatch]);

    const handleFieldUpdate = useCallback((updatedField: Field) => {
        // Update field in the axis fields (via VisualizationContext)
        dispatch({ type: 'UPDATE_FIELD', payload: updatedField });
        
        // Check if this is a virtual column field
        // @ts-ignore - is_virtual is added dynamically
        const isVirtual = updatedField.is_virtual === true;
        
        if (isVirtual) {
            // For virtual columns, update the field preferences in state
            dispatch({
                type: 'UPDATE_VIRTUAL_COLUMN_FIELD_PREFERENCE',
                payload: {
                    columnName: updatedField.columnName,
                    preference: {
                        type: updatedField.type,
                        flavour: updatedField.flavour,
                        aggregation: updatedField.aggregation,
                    },
                },
            });
        } else {
            // For regular fields, update in availableFields (via DataSourceContext)
            const updatedAvailableFields = availableFields.map((f) => 
                f.id === updatedField.id ? updatedField : f
            );
            if (updatedAvailableFields.some((f, i) => f !== availableFields[i])) {
                dataSourceSetters.setAvailableFields(updatedAvailableFields);
            }
        }
    }, [dispatch, availableFields, dataSourceSetters]);

    const handleReorderFields = useCallback((axis: 'x' | 'y', fromIndex: number, toIndex: number) => {
        const currentFields = axis === 'x' ? xAxisFields : yAxisFields;
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
    }, [xAxisFields, yAxisFields, dispatch]);

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
        handleFieldUpdate,
        handleReorderFields,
        handleDatabaseSelect,
        handleTableSelect,
    };
}

