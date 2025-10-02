import { useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Field, DataType, FilterMetadata } from '../types';
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
                
                // Set default type and flavour based on data type
                let type: 'dimension' | 'measure';
                let flavour: 'discrete' | 'continuous';
                let aggregation: 'sum' | 'avg' | 'min' | 'max' | 'count' | 'count_distinct' | undefined;
                
                if (dataType === 'string' || dataType === 'datetime') {
                    type = 'dimension';
                    flavour = 'discrete';
                    aggregation = undefined; // Dimensions don't have aggregation
                } else if (dataType === 'integer' || dataType === 'float') {
                    type = 'measure';
                    flavour = 'continuous';
                    aggregation = 'sum'; // Default aggregation for measures
                } else {
                    // Fallback
                    type = 'dimension';
                    flavour = 'discrete';
                    aggregation = undefined;
                }
                
                return {
                    id: `field-${col.name}`,
                    columnName: col.name,
                    type: type,
                    flavour: flavour,
                    dataType: dataType,
                    aggregation: aggregation,
                };
            });
            dispatch({ type: 'SET_AVAILABLE_FIELDS', payload: fields });

            // Mark axis fields that are not present in new schema as invalid
            const availableNames = new Set(fields.map(f => f.columnName));
            const patchedX = state.xAxisFields.map(f => ({ ...f, isInvalid: !availableNames.has(f.columnName) } as any));
            const patchedY = state.yAxisFields.map(f => ({ ...f, isInvalid: !availableNames.has(f.columnName) } as any));
            dispatch({ type: 'SET_X_AXIS_FIELDS', payload: patchedX });
            dispatch({ type: 'SET_Y_AXIS_FIELDS', payload: patchedY });
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

    // Fetch filter metadata for a field
    const fetchFilterMetadata = useCallback(async (field: Field) => {
        if (!state.selectedTable) return;
        const dbParam = connectionDetails?.type === 'clickhouse' ? state.selectedDatabase : undefined;

        // Determine filter type based on field characteristics
        const getFilterType = (): 'discrete' | 'continuous' | 'datetime' => {
            if (field.dataType === 'datetime') {
                return 'datetime';
            }
            return field.flavour === 'discrete' ? 'discrete' : 'continuous';
        };

        const filterType = getFilterType();

        // Set loading state
        const loadingMetadata: FilterMetadata = {
            fieldId: field.id,
            columnName: field.columnName,
            type: filterType,
            loading: true,
            ...(filterType === 'discrete' ? { availableValues: [] } :
                filterType === 'continuous' ? { min: 0, max: 0 } :
                { min: '', max: '' })
        } as FilterMetadata;

        dispatch({
            type: 'SET_FILTER_METADATA',
            payload: { fieldId: field.id, metadata: loadingMetadata }
        });

        try {
            if (filterType === 'discrete') {
                const values = await apiService.getDistinctValues(
                    field.columnName,
                    state.selectedTable,
                    dbParam
                );
                
                const metadata: FilterMetadata = {
                    fieldId: field.id,
                    columnName: field.columnName,
                    type: 'discrete',
                    loading: false,
                    availableValues: values,
                };

                dispatch({
                    type: 'SET_FILTER_METADATA',
                    payload: { fieldId: field.id, metadata }
                });

                // Initialize filter configuration with all values selected
                dispatch({
                    type: 'SET_FILTER_CONFIGURATION',
                    payload: {
                        fieldId: field.id,
                        config: {
                            fieldId: field.id,
                            columnName: field.columnName,
                            type: 'discrete',
                            selectedValues: values,
                        }
                    }
                });
            } else if (filterType === 'continuous') {
                const range = await apiService.getFieldRange(
                    field.columnName,
                    state.selectedTable,
                    dbParam
                );
                
                const metadata: FilterMetadata = {
                    fieldId: field.id,
                    columnName: field.columnName,
                    type: 'continuous',
                    loading: false,
                    min: range.min,
                    max: range.max,
                };

                dispatch({
                    type: 'SET_FILTER_METADATA',
                    payload: { fieldId: field.id, metadata }
                });

                // Initialize filter configuration with full range
                dispatch({
                    type: 'SET_FILTER_CONFIGURATION',
                    payload: {
                        fieldId: field.id,
                        config: {
                            fieldId: field.id,
                            columnName: field.columnName,
                            type: 'continuous',
                            min: range.min,
                            max: range.max,
                        }
                    }
                });
            } else if (filterType === 'datetime') {
                const range = await apiService.getDateTimeRange(
                    field.columnName,
                    state.selectedTable,
                    dbParam
                );
                
                const metadata: FilterMetadata = {
                    fieldId: field.id,
                    columnName: field.columnName,
                    type: 'datetime',
                    loading: false,
                    min: range.min,
                    max: range.max,
                };

                dispatch({
                    type: 'SET_FILTER_METADATA',
                    payload: { fieldId: field.id, metadata }
                });

                // Initialize filter configuration with full range
                dispatch({
                    type: 'SET_FILTER_CONFIGURATION',
                    payload: {
                        fieldId: field.id,
                        config: {
                            fieldId: field.id,
                            columnName: field.columnName,
                            type: 'datetime',
                            startDate: range.min,
                            endDate: range.max,
                        }
                    }
                });
            }
        } catch (err: any) {
            // Set error state
            const errorMetadata: FilterMetadata = {
                fieldId: field.id,
                columnName: field.columnName,
                type: filterType,
                loading: false,
                error: err.message,
                ...(filterType === 'discrete' ? { availableValues: [] } :
                    filterType === 'continuous' ? { min: 0, max: 0 } :
                    { min: '', max: '' })
            } as FilterMetadata;

            dispatch({
                type: 'SET_FILTER_METADATA',
                payload: { fieldId: field.id, metadata: errorMetadata }
            });
        }
    }, [state.selectedTable, state.selectedDatabase, connectionDetails?.type, dispatch]);

    // --- Effects to trigger data fetching ---
    useEffect(() => {
        if (!connectionDetails) return;
        // Always refetch metadata when connection changes, but do not touch axis fields here
        dispatch({ type: 'SET_METADATA_ERROR', payload: null });
        if (connectionDetails.type === 'clickhouse') {
            fetchDatabases();
        } else if (connectionDetails.type === 'csv') {
            fetchTables('');
        }
        // Columns fetch will trigger once selectedTable is set (CSV auto-selection handled in fetchTables)
    }, [connectionDetails?.type]);
    
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
    }, [state.selectedDatabase, state.tables.length, state.isLoadingMetadata, fetchTables]);

    // Fetch filter metadata when new filter fields are added
    useEffect(() => {
        state.filterFields.forEach(field => {
            // Only fetch if metadata doesn't exist for this field
            if (!state.filterMetadata[field.id]) {
                fetchFilterMetadata(field);
            }
        });
    }, [state.filterFields, state.filterMetadata, fetchFilterMetadata]);

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