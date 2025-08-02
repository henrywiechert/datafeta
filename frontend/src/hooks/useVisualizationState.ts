import { useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Field, DataType } from '../types';
import { apiService } from '../apiService';
import { useConnection } from '../contexts/ConnectionContext';
import { useVisualizationContext } from '../contexts/VisualizationContext';


export function useVisualizationState() {
    const { connectionDetails } = useConnection();
    const { state, dispatch } = useVisualizationContext();

    // --- Event Handlers ---

    const handleDropFromAvailableFields = useCallback((targetAxis: 'x' | 'y', fieldId: string, insertIndex?: number) => {
        const field = state.availableFields.find(f => f.id === fieldId);
        if (!field) return;

        const fieldToAdd = { ...field, id: uuidv4() };
        
        if (targetAxis === 'x') {
            const currentFields = state.xAxisFields;
            if (insertIndex !== undefined) {
                const newFields = [...currentFields];
                newFields.splice(insertIndex, 0, fieldToAdd);
                dispatch({ type: 'SET_X_AXIS_FIELDS', payload: newFields });
            } else {
                dispatch({ type: 'SET_X_AXIS_FIELDS', payload: [...currentFields, fieldToAdd] });
            }
        } else {
            const currentFields = state.yAxisFields;
            if (insertIndex !== undefined) {
                const newFields = [...currentFields];
                newFields.splice(insertIndex, 0, fieldToAdd);
                dispatch({ type: 'SET_Y_AXIS_FIELDS', payload: newFields });
            } else {
                dispatch({ type: 'SET_Y_AXIS_FIELDS', payload: [...currentFields, fieldToAdd] });
            }
        }
    }, [state.xAxisFields, state.yAxisFields, state.availableFields, dispatch]);



    const handleRemoveFromAxis = useCallback((fieldId: string) => {
        const newXFields = state.xAxisFields.filter(f => f.id !== fieldId);
        const newYFields = state.yAxisFields.filter(f => f.id !== fieldId);
        dispatch({ type: 'SET_X_AXIS_FIELDS', payload: newXFields });
        dispatch({ type: 'SET_Y_AXIS_FIELDS', payload: newYFields });
    }, [state.xAxisFields, state.yAxisFields, dispatch]);

    const handleFieldUpdate = useCallback((updatedField: Field) => {
        dispatch({ type: 'UPDATE_FIELD', payload: updatedField });
    }, [dispatch]);

    const handleReorderFields = useCallback((axis: 'x' | 'y', fromIndex: number, toIndex: number) => {
        const currentFields = axis === 'x' ? state.xAxisFields : state.yAxisFields;
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
    }, [state.xAxisFields, state.yAxisFields, dispatch]);

    const handleDatabaseSelect = useCallback((dbName: string) => {
        dispatch({ type: 'SET_SELECTED_DATABASE', payload: dbName });
        dispatch({ type: 'SET_SELECTED_TABLE', payload: '' });
        dispatch({ type: 'SET_TABLES', payload: [] });
        dispatch({ type: 'SET_AVAILABLE_FIELDS', payload: [] });
    }, [dispatch]);

    const handleTableSelect = useCallback((tableName: string) => {
        dispatch({ type: 'SET_SELECTED_TABLE', payload: tableName });
        // Clear existing fields when table changes
        dispatch({ type: 'SET_AVAILABLE_FIELDS', payload: [] });
    }, [dispatch]);

    // --- Data Fetching Logic ---

    const fetchDatabases = useCallback(async () => {
        dispatch({ type: 'SET_LOADING_METADATA', payload: true });
        dispatch({ type: 'SET_METADATA_ERROR', payload: null });
        try {
            const response = await apiService.listDatabases();
            dispatch({ type: 'SET_DATABASES', payload: response.databases || [] });
        } catch (err: any) { 
            if (err.message === 'Request was cancelled') {
                // Request was cancelled, don't set error
                dispatch({ type: 'SET_METADATA_ERROR', payload: null });
            } else {
                dispatch({ type: 'SET_METADATA_ERROR', payload: err.message });
            }
        }
        finally { 
            dispatch({ type: 'SET_LOADING_METADATA', payload: false });
        }
    }, [dispatch]);

    const fetchTables = useCallback(async (databaseName: string) => {
        const targetDatabase = databaseName;
        if (connectionDetails?.type === 'clickhouse' && !targetDatabase) return;
        
        dispatch({ type: 'SET_LOADING_METADATA', payload: true });
        dispatch({ type: 'SET_METADATA_ERROR', payload: null });
        try {
            const response = await apiService.listTables(targetDatabase);
            dispatch({ type: 'SET_TABLES', payload: response.tables || [] });
            if (connectionDetails?.type === 'csv' && response.tables?.length === 1) {
                dispatch({ type: 'SET_SELECTED_TABLE', payload: response.tables[0].name });
            }
        } catch (err: any) { 
            if (err.message === 'Request was cancelled') {
                // Request was cancelled, don't set error
                dispatch({ type: 'SET_METADATA_ERROR', payload: null });
            } else {
                dispatch({ type: 'SET_METADATA_ERROR', payload: err.message });
            }
        }
        finally { 
            dispatch({ type: 'SET_LOADING_METADATA', payload: false });
        }
    }, [connectionDetails?.type, dispatch]);

    const fetchColumns = useCallback(async () => {
        if (!state.selectedTable) return;
        if (connectionDetails?.type === 'clickhouse' && !state.selectedDatabase) return;
        
        dispatch({ type: 'SET_LOADING_METADATA', payload: true });
        dispatch({ type: 'SET_METADATA_ERROR', payload: null });
        try {
            const dbParam = connectionDetails?.type === 'clickhouse' ? state.selectedDatabase : undefined;
            const response = await apiService.listColumns(state.selectedTable, dbParam);
            const fields: Field[] = response.columns.map(col => {
                const dataType = mapBackendDataType(col.data_type);
                return {
                    id: `field-${col.name}`,
                    columnName: col.name,
                    type: 'dimension', // All fields start as dimensions (datetime fields must stay as dimensions)
                    flavour: 'discrete', // All fields default to discrete, can be changed via UI (except string dimensions)
                    dataType: dataType,
                };
            });
            dispatch({ type: 'SET_AVAILABLE_FIELDS', payload: fields });
        } catch (err: any) { 
            if (err.message === 'Request was cancelled') {
                // Request was cancelled, don't set error
                dispatch({ type: 'SET_METADATA_ERROR', payload: null });
            } else {
                dispatch({ type: 'SET_METADATA_ERROR', payload: err.message });
            }
        }
        finally { 
            dispatch({ type: 'SET_LOADING_METADATA', payload: false });
        }
    }, [state.selectedTable, state.selectedDatabase, connectionDetails?.type, dispatch]);

    // Helper function to map backend data types to our DataType enum
    const mapBackendDataType = (backendType: string): DataType => {
        const lowerType = backendType.toLowerCase();
        
        if (lowerType.includes('string') || lowerType.includes('varchar') || lowerType.includes('text') || lowerType.includes('char')) {
            return 'string';
        } else if (lowerType.includes('int') || lowerType.includes('bigint') || lowerType.includes('smallint')) {
            return 'integer';
        } else if (lowerType.includes('float') || lowerType.includes('double') || lowerType.includes('decimal') || lowerType.includes('numeric')) {
            return 'float';
        } else if (lowerType.includes('date') || lowerType.includes('time') || lowerType.includes('timestamp')) {
            return 'datetime';
        } else {
            // Default fallback
            return 'string';
        }
    };

    // --- Effects to trigger data fetching ---
    useEffect(() => {
        if (connectionDetails) {
            // Only reset and fetch if we don't already have data for this connection
            // This prevents refetching when switching tabs
            const shouldFetch = state.databases.length === 0 && 
                               state.tables.length === 0 && 
                               state.selectedDatabase === '' &&
                               !state.isLoadingMetadata;
            
            if (shouldFetch) {
                // Reset state when connection changes
                dispatch({ type: 'SET_DATABASES', payload: [] });
                dispatch({ type: 'SET_TABLES', payload: [] });
                dispatch({ type: 'SET_AVAILABLE_FIELDS', payload: [] });
                dispatch({ type: 'SET_SELECTED_DATABASE', payload: '' });
                dispatch({ type: 'SET_SELECTED_TABLE', payload: '' });
                dispatch({ type: 'SET_METADATA_ERROR', payload: null });
                
                if (connectionDetails.type === 'clickhouse') {
                    fetchDatabases();
                } else if (connectionDetails.type === 'csv') {
                    fetchTables('');
                }
            }
        }
    }, [connectionDetails, fetchDatabases, fetchTables, dispatch, state.databases.length, state.tables.length, state.selectedDatabase, state.isLoadingMetadata]);
    
    useEffect(() => {
        // Fetch columns when table is selected (either from initial load or user selection)
        if (state.selectedTable && !state.isLoadingMetadata) {
            // Only fetch if we don't have fields or if the fields list was just cleared (user changed table)
            if (state.availableFields.length === 0) {
                fetchColumns();
            }
        }
    }, [state.selectedTable, state.availableFields.length, state.isLoadingMetadata, fetchColumns]);

    useEffect(() => {
        // Fetch tables when database is selected (either from initial load or user selection)
        if (state.selectedDatabase && !state.isLoadingMetadata) {
            // Only fetch if we don't have tables or if the tables list was just cleared (user changed database)
            if (state.tables.length === 0) {
                fetchTables(state.selectedDatabase);
            }
        }
    }, [state.selectedDatabase, state.tables.length, state.isLoadingMetadata, fetchTables])

    // --- Return all state and handlers ---
    return {
        connectionDetails,
        xAxisFields: state.xAxisFields,
        yAxisFields: state.yAxisFields,
        availableFields: state.availableFields,
        databases: state.databases,
        tables: state.tables,
        selectedDatabase: state.selectedDatabase,
        selectedTable: state.selectedTable,
        isLoadingMetadata: state.isLoadingMetadata,
        metadataError: state.metadataError,
        handleFieldUpdate,
        handleDatabaseSelect,
        handleTableSelect,
        handleRemoveFromAxis,
        handleDropFromAvailableFields,
        handleReorderFields
    };
} 