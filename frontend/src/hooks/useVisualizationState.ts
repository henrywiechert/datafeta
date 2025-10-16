import { useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Field, DataType, FilterMetadata } from '../types';
import { apiService } from '../apiService';
import { useConnection } from '../contexts/ConnectionContext';
import { useVisualizationContext } from '../contexts/VisualizationContext';
import { useSheetContext } from '../contexts/SheetContext';
import { useDataSource } from '../contexts/DataSourceContext';


export function useVisualizationState() {
    const { connectionDetails } = useConnection();
    const { state, dispatch } = useVisualizationContext();
    const { updateActiveSheetState } = useSheetContext();
    const { 
        dataSource, 
        setSelectedDatabase, 
        setSelectedTable, 
        setAvailableFields,
        setDatabases,
        setTables,
        setIsLoadingMetadata,
        setMetadataError
    } = useDataSource();

    // Sync visualization state changes back to the active sheet
    // Note: We do NOT sync these because they are shared across all sheets:
    // - selectedDatabase, selectedTable (data source selection)
    // - availableFields (derived from selected table)
    useEffect(() => {
        updateActiveSheetState({
            xAxisFields: state.xAxisFields,
            yAxisFields: state.yAxisFields,
            filterFields: state.filterFields,
            filterConfigurations: state.filterConfigurations,
            appliedFilterConfigurations: state.appliedFilterConfigurations,
            colorField: state.colorField,
            colorScheme: state.colorScheme,
            sizeField: state.sizeField,
            sizeRange: state.sizeRange,
            manualSize: state.manualSize,
        });
    }, [
        state.xAxisFields,
        state.yAxisFields,
        state.filterFields,
        state.filterConfigurations,
        state.appliedFilterConfigurations,
        state.colorField,
        state.colorScheme,
        state.sizeField,
        state.sizeRange,
        state.manualSize,
        updateActiveSheetState,
    ]);

    // --- Event Handlers ---

    const handleDropFromAvailableFields = useCallback((targetAxis: 'x' | 'y', fieldId: string, insertIndex?: number) => {
        const field = dataSource.availableFields.find(f => f.id === fieldId);
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
    }, [state.xAxisFields, state.yAxisFields, dataSource.availableFields, dispatch]);



    const handleRemoveFromAxis = useCallback((fieldId: string) => {
        const newXFields = state.xAxisFields.filter(f => f.id !== fieldId);
        const newYFields = state.yAxisFields.filter(f => f.id !== fieldId);
        dispatch({ type: 'SET_X_AXIS_FIELDS', payload: newXFields });
        dispatch({ type: 'SET_Y_AXIS_FIELDS', payload: newYFields });
    }, [state.xAxisFields, state.yAxisFields, dispatch]);

    const handleFieldUpdate = useCallback((updatedField: Field) => {
        // Update field in the axis fields (via VisualizationContext)
        dispatch({ type: 'UPDATE_FIELD', payload: updatedField });
        
        // Also update field in availableFields (via DataSourceContext)
        const updatedAvailableFields = dataSource.availableFields.map((f) => 
            f.id === updatedField.id ? updatedField : f
        );
        if (updatedAvailableFields.some((f, i) => f !== dataSource.availableFields[i])) {
            setAvailableFields(updatedAvailableFields);
        }
    }, [dispatch, dataSource.availableFields, setAvailableFields]);

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
        setSelectedDatabase(dbName);
        setSelectedTable('');
        setTables([]);
        setAvailableFields([]);
    }, [setSelectedDatabase, setSelectedTable, setTables, setAvailableFields]);

    const handleTableSelect = useCallback((tableName: string) => {
        setSelectedTable(tableName);
        // Clear existing fields when table changes
        setAvailableFields([]);
    }, [setSelectedTable, setAvailableFields]);

    // --- Data Fetching Logic ---

    const fetchDatabases = useCallback(async () => {
        setIsLoadingMetadata(true);
        setMetadataError(null);
        try {
            const response = await apiService.listDatabases();
            setDatabases(response.databases || []);
        } catch (err: any) { 
            if (err.message === 'Request was cancelled') {
                // Request was cancelled, don't set error
                setMetadataError(null);
            } else {
                setMetadataError(err.message);
            }
        }
        finally { 
            setIsLoadingMetadata(false);
        }
    }, [setIsLoadingMetadata, setMetadataError, setDatabases]);

    const fetchTables = useCallback(async (databaseName: string) => {
        const targetDatabase = databaseName;
        if (connectionDetails?.type === 'clickhouse' && !targetDatabase) return;
        
        setIsLoadingMetadata(true);
        setMetadataError(null);
        try {
            const response = await apiService.listTables(targetDatabase);
            setTables(response.tables || []);
            if (connectionDetails?.type === 'csv' && response.tables?.length === 1) {
                setSelectedTable(response.tables[0].name);
            }
        } catch (err: any) { 
            if (err.message === 'Request was cancelled') {
                // Request was cancelled, don't set error
                setMetadataError(null);
            } else {
                setMetadataError(err.message);
            }
        }
        finally { 
            setIsLoadingMetadata(false);
        }
    }, [connectionDetails?.type, setIsLoadingMetadata, setMetadataError, setTables, setSelectedTable]);

    const fetchColumns = useCallback(async () => {
        if (!dataSource.selectedTable) return;
        if (connectionDetails?.type === 'clickhouse' && !dataSource.selectedDatabase) return;
        
        setIsLoadingMetadata(true);
        setMetadataError(null);
        try {
            const dbParam = connectionDetails?.type === 'clickhouse' ? dataSource.selectedDatabase : undefined;
            const response = await apiService.listColumns(dataSource.selectedTable, dbParam);
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
            setAvailableFields(fields);

            // Mark axis fields that are not present in new schema as invalid
            const availableNames = new Set(fields.map(f => f.columnName));
            const patchedX = state.xAxisFields.map(f => ({ ...f, isInvalid: !availableNames.has(f.columnName) } as any));
            const patchedY = state.yAxisFields.map(f => ({ ...f, isInvalid: !availableNames.has(f.columnName) } as any));
            dispatch({ type: 'SET_X_AXIS_FIELDS', payload: patchedX });
            dispatch({ type: 'SET_Y_AXIS_FIELDS', payload: patchedY });
        } catch (err: any) { 
            if (err.message === 'Request was cancelled') {
                // Request was cancelled, don't set error
                setMetadataError(null);
            } else {
                setMetadataError(err.message);
            }
        }
        finally { 
            setIsLoadingMetadata(false);
        }
    }, [dataSource.selectedTable, dataSource.selectedDatabase, state.xAxisFields, state.yAxisFields, connectionDetails?.type, setIsLoadingMetadata, setMetadataError, setAvailableFields, dispatch]);

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
        if (!dataSource.selectedTable) return;
        const dbParam = connectionDetails?.type === 'clickhouse' ? dataSource.selectedDatabase : undefined;

        // Determine filter type based on field characteristics
        const getFilterType = (): 'discrete' | 'continuous' | 'datetime' => {
            // If it's a datetime field WITH a part specified, treat as discrete
            if (field.dataType === 'datetime' && field.dateTimePart && field.dateTimeMode) {
                return 'discrete';
            }
            // If it's a full datetime field (no part), treat as datetime
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
                    dataSource.selectedTable,
                    dbParam,
                    field.dateTimePart,
                    field.dateTimeMode
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
                            dateTimePart: field.dateTimePart,
                            dateTimeMode: field.dateTimeMode,
                        }
                    }
                });
            } else if (filterType === 'continuous') {
                const range = await apiService.getFieldRange(
                    field.columnName,
                    dataSource.selectedTable,
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
                    dataSource.selectedTable,
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
    }, [dataSource.selectedTable, dataSource.selectedDatabase, connectionDetails?.type, dispatch]);

    // --- Effects to trigger data fetching ---
    useEffect(() => {
        if (!connectionDetails) return;
        // Always refetch metadata when connection changes, but do not touch axis fields here
        setMetadataError(null);
        if (connectionDetails.type === 'clickhouse') {
            fetchDatabases();
        } else if (connectionDetails.type === 'csv') {
            fetchTables('');
        }
        // Columns fetch will trigger once selectedTable is set (CSV auto-selection handled in fetchTables)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [connectionDetails, connectionDetails?.type]);
    
    useEffect(() => {
        // Fetch columns when table is selected (either from initial load or user selection)
        if (dataSource.selectedTable && !dataSource.isLoadingMetadata) {
            // Only fetch if we don't have fields or if the fields list was just cleared (user changed table)
            if (dataSource.availableFields.length === 0) {
                fetchColumns();
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dataSource.selectedTable, dataSource.availableFields.length, dataSource.isLoadingMetadata]);

    useEffect(() => {
        // Fetch tables when database is selected (either from initial load or user selection)
        if (dataSource.selectedDatabase && !dataSource.isLoadingMetadata) {
            // Only fetch if we don't have tables or if the tables list was just cleared (user changed database)
            if (dataSource.tables.length === 0) {
                fetchTables(dataSource.selectedDatabase);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dataSource.selectedDatabase, dataSource.tables.length, dataSource.isLoadingMetadata]);

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
        availableFields: dataSource.availableFields,
        databases: dataSource.databases,
        tables: dataSource.tables,
        selectedDatabase: dataSource.selectedDatabase,
        selectedTable: dataSource.selectedTable,
        isLoadingMetadata: dataSource.isLoadingMetadata,
        metadataError: dataSource.metadataError,
        handleFieldUpdate,
        handleDatabaseSelect,
        handleTableSelect,
        handleRemoveFromAxis,
        handleDropFromAvailableFields,
        handleReorderFields
    };
} 