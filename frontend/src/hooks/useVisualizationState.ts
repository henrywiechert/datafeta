import { useCallback, useEffect, useMemo } from 'react';
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
        setMetadataError,
        setSuggestedJoinableTables,
        setSuggestedUnionableTables,
        setVirtualTable
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
            virtualColumns: state.virtualColumns,
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
        state.virtualColumns,
        updateActiveSheetState,
    ]);

    // --- Merge virtual columns into available fields ---
    const availableFieldsWithVirtual = useMemo(() => {
        const virtualFields: Field[] = state.virtualColumns.map((vc, index) => {
            // Map output type to data type
            let dataType: DataType;
            if (vc.output_type === 'numeric') {
                dataType = 'float'; // Use float for numeric virtual columns
            } else if (vc.output_type === 'datetime') {
                dataType = 'datetime';
            } else {
                dataType = 'string'; // Default to string for text
            }
            
            // Default type and flavour based on output type (same logic as regular fields)
            let type: 'dimension' | 'measure';
            let flavour: 'discrete' | 'continuous';
            let aggregation: 'sum' | 'avg' | 'min' | 'max' | 'count' | 'count_distinct' | undefined;
            
            if (vc.output_type === 'text' || vc.output_type === 'datetime') {
                type = 'dimension';
                flavour = 'discrete';
                aggregation = undefined;
            } else if (vc.output_type === 'numeric') {
                // Default numeric virtual columns to dimension (can be changed to measure in UI)
                type = 'dimension';
                flavour = 'discrete';
                aggregation = undefined;
            } else {
                type = 'dimension';
                flavour = 'discrete';
                aggregation = undefined;
            }
            
            return {
                id: `virtual_${vc.name}_${index}`,
                columnName: vc.name,
                type: type,
                flavour: flavour,
                dataType: dataType,
                aggregation: aggregation,
                // Add a marker that this is a virtual column
                // @ts-ignore - We'll add is_virtual to Field type if needed
                is_virtual: true,
            };
        });
        
        return [...dataSource.availableFields, ...virtualFields];
    }, [dataSource.availableFields, state.virtualColumns]);

    // --- Event Handlers ---

    const handleDropFromAvailableFields = useCallback((targetAxis: 'x' | 'y', fieldId: string, insertIndex?: number) => {
        const field = availableFieldsWithVirtual.find(f => f.id === fieldId);
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
    }, [state.xAxisFields, state.yAxisFields, availableFieldsWithVirtual, dispatch]);



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
        // Fetch suggested joins for the new table (will be called after table is set)
        // The useEffect below will trigger fetchSuggestedJoins
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

    // Fetch suggested joinable tables for the selected primary table
    const fetchSuggestedJoins = useCallback(async () => {
        if (!dataSource.selectedTable || !dataSource.selectedDatabase) return;
        if (connectionDetails?.type !== 'clickhouse') return; // Only for database sources
        
        try {
            const response = await apiService.getSuggestedJoins(
                dataSource.selectedDatabase,
                dataSource.selectedTable
            );
            setSuggestedJoinableTables(response.suggested_tables || []);
        } catch (err: any) {
            console.warn('Could not fetch suggested joins:', err.message);
            setSuggestedJoinableTables([]);
        }
    }, [dataSource.selectedTable, dataSource.selectedDatabase, connectionDetails?.type, setSuggestedJoinableTables]);

    // Fetch suggested unions when table is selected
    const fetchSuggestedUnions = useCallback(async () => {
        if (!dataSource.selectedTable || !dataSource.selectedDatabase) return;
        if (connectionDetails?.type !== 'clickhouse') return; // Only for database sources
        
        try {
            const response = await apiService.getSuggestedUnions(
                dataSource.selectedDatabase,
                dataSource.selectedTable
            );
            setSuggestedUnionableTables(response.suggested_tables || []);
        } catch (err: any) {
            console.warn('Could not fetch suggested unions:', err.message);
            setSuggestedUnionableTables([]);
        }
    }, [dataSource.selectedTable, dataSource.selectedDatabase, connectionDetails?.type, setSuggestedUnionableTables]);

    // Fetch merged columns when joined tables change
    const fetchMergedColumns = useCallback(async () => {
        if (!dataSource.selectedTable) return;
        if (connectionDetails?.type === 'clickhouse' && !dataSource.selectedDatabase) return;
        
        // If no joined or union tables, fetch regular columns
        if (dataSource.joinedTables.length === 0 && dataSource.unionTables.length === 0) {
            await fetchColumns();
            setVirtualTable(null);
            return;
        }
        
        setIsLoadingMetadata(true);
        setMetadataError(null);
        
        try {
            // UNION mode - fetch columns with _source_table virtual column
            if (dataSource.unionTables.length > 0) {
                const response = await apiService.getMergedColumns(
                    dataSource.selectedDatabase,
                    dataSource.selectedTable,
                    undefined, // No joined tables
                    dataSource.unionTables, // Union tables
                    false // Don't auto-detect
                );
                
                // Convert columns to Field objects (includes _source_table)
                const fields: Field[] = response.columns.map(col => {
                    const dataType = mapBackendDataType(col.data_type);
                    
                    let type: 'dimension' | 'measure';
                    let flavour: 'discrete' | 'continuous';
                    let aggregation: 'sum' | 'avg' | 'min' | 'max' | 'count' | 'count_distinct' | undefined;
                    
                    if (dataType === 'string' || dataType === 'datetime') {
                        type = 'dimension';
                        flavour = 'discrete';
                        aggregation = undefined;
                    } else if (dataType === 'integer' || dataType === 'float') {
                        type = 'measure';
                        flavour = 'continuous';
                        aggregation = 'sum';
                    } else {
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
                        tableName: col.table_name || undefined,
                        aggregation: aggregation,
                        axis: undefined
                    };
                });
                
                setAvailableFields(fields);
                setVirtualTable(response.virtual_table);
                setIsLoadingMetadata(false);
                return;
            }
            
            // JOIN mode - fetch merged columns with table prefixes
            const response = await apiService.getMergedColumns(
                dataSource.selectedDatabase,
                dataSource.selectedTable,
                dataSource.joinedTables,
                undefined, // No union tables
                false // Don't auto-detect, use explicitly selected tables
            );
            
            // Convert merged columns to Field objects
            const fields: Field[] = response.columns.map(col => {
                const dataType = mapBackendDataType(col.data_type);
                
                let type: 'dimension' | 'measure';
                let flavour: 'discrete' | 'continuous';
                let aggregation: 'sum' | 'avg' | 'min' | 'max' | 'count' | 'count_distinct' | undefined;
                
                if (dataType === 'string' || dataType === 'datetime') {
                    type = 'dimension';
                    flavour = 'discrete';
                    aggregation = undefined;
                } else if (dataType === 'integer' || dataType === 'float') {
                    type = 'measure';
                    flavour = 'continuous';
                    aggregation = 'sum';
                } else {
                    type = 'dimension';
                    flavour = 'discrete';
                    aggregation = undefined;
                }
                
                return {
                    id: `field-${col.name}`,
                    columnName: col.name, // Includes table prefix like 'customers.name'
                    type: type,
                    flavour: flavour,
                    dataType: dataType,
                    aggregation: aggregation,
                };
            });
            
            setAvailableFields(fields);
            setVirtualTable(response.virtual_table);

            // Mark axis fields that are not present in new schema as invalid
            const availableNames = new Set(fields.map(f => f.columnName));
            const patchedX = state.xAxisFields.map(f => ({ ...f, isInvalid: !availableNames.has(f.columnName) } as any));
            const patchedY = state.yAxisFields.map(f => ({ ...f, isInvalid: !availableNames.has(f.columnName) } as any));
            dispatch({ type: 'SET_X_AXIS_FIELDS', payload: patchedX });
            dispatch({ type: 'SET_Y_AXIS_FIELDS', payload: patchedY });
        } catch (err: any) {
            if (err.message === 'Request was cancelled') {
                setMetadataError(null);
            } else {
                setMetadataError(err.message);
            }
        }
        finally { 
            setIsLoadingMetadata(false);
        }
    }, [
        dataSource.selectedTable, 
        dataSource.selectedDatabase, 
        dataSource.joinedTables,
        dataSource.unionTables,
        state.xAxisFields, 
        state.yAxisFields, 
        connectionDetails?.type, 
        setIsLoadingMetadata, 
        setMetadataError, 
        setAvailableFields,
        setVirtualTable,
        dispatch,
        fetchColumns
    ]);

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
            if (field.dataType === 'datetime') {
                // Distinct datetime parts → discrete filter (e.g., select hours 8, 9, 14, 15)
                if (field.dateTimePart && field.dateTimeMode === 'distinct') {
                    return 'discrete';
                }
                // Full datetime OR timeline parts → datetime range filter
                // Timeline parts use range filtering because they can have thousands of values
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
                // First, get the count of distinct values
                const count = await apiService.getDistinctValuesCount(
                    field.columnName,
                    dataSource.selectedTable,
                    dbParam,
                    undefined, // no regex filter initially
                    field.dateTimePart,
                    field.dateTimeMode,
                    dataSource.unionTables,  // Pass union tables for _source_table handling
                    state.virtualColumns  // Pass virtual columns for expression support
                );
                
                let values: any[];
                let isPartial = false;
                let warningMessage: string | undefined;
                
                if (count <= 5000) {
                    // Fetch all values
                    values = await apiService.getDistinctValues(
                        field.columnName,
                        dataSource.selectedTable,
                        dbParam,
                        field.dateTimePart,
                        field.dateTimeMode,
                        undefined, // no regex filter
                        undefined, // no limit
                        undefined, // no random sampling
                        dataSource.unionTables,  // Pass union tables
                        state.virtualColumns  // Pass virtual columns
                    );
                } else {
                    // Too many values - fetch only 100 random samples
                    values = await apiService.getDistinctValues(
                        field.columnName,
                        dataSource.selectedTable,
                        dbParam,
                        field.dateTimePart,
                        field.dateTimeMode,
                        undefined, // no regex filter
                        100, // limit to 100
                        true, // use random sampling
                        dataSource.unionTables,  // Pass union tables
                        state.virtualColumns  // Pass virtual columns
                    );
                    isPartial = true;
                    warningMessage = `This field has ${count.toLocaleString()} unique values. Showing 100 random samples. Use Query Regex to filter.`;
                }
                
                const metadata: FilterMetadata = {
                    fieldId: field.id,
                    columnName: field.columnName,
                    type: 'discrete',
                    loading: false,
                    availableValues: values,
                    totalCount: count,
                    originalTotalCount: count, // Store the original count for later reference
                    isPartial,
                    warningMessage,
                };

                dispatch({
                    type: 'SET_FILTER_METADATA',
                    payload: { fieldId: field.id, metadata }
                });

                // Initialize filter configuration with all fetched values selected
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
    }, [dataSource.selectedTable, dataSource.selectedDatabase, dataSource.unionTables, connectionDetails?.type, dispatch]);

    // --- Effects to trigger data fetching ---
    useEffect(() => {
        if (!connectionDetails) return;
        
        // Only fetch if we don't already have the data
        // This prevents duplicate fetches when switching sheets (VisualizationProvider remounts)
        if (connectionDetails.type === 'clickhouse') {
            // Only fetch databases if we don't have any yet
            if (dataSource.databases.length === 0 && !dataSource.isLoadingMetadata) {
                setMetadataError(null);
                fetchDatabases();
            }
        } else if (connectionDetails.type === 'csv') {
            // Only fetch tables if we don't have any yet
            if (dataSource.tables.length === 0 && !dataSource.isLoadingMetadata) {
                setMetadataError(null);
                fetchTables('');
            }
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

    // Fetch suggested joins when table is selected
    useEffect(() => {
        if (dataSource.selectedTable && dataSource.selectedDatabase && connectionDetails?.type === 'clickhouse') {
            fetchSuggestedJoins();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dataSource.selectedTable, dataSource.selectedDatabase, connectionDetails?.type]);

    // Fetch suggested unions when table is selected
    useEffect(() => {
        if (dataSource.selectedTable && dataSource.selectedDatabase && connectionDetails?.type === 'clickhouse') {
            fetchSuggestedUnions();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dataSource.selectedTable, dataSource.selectedDatabase, connectionDetails?.type]);

    // Fetch merged columns when joined or union tables change
    useEffect(() => {
        if (dataSource.selectedTable) {
            fetchMergedColumns();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dataSource.selectedTable, dataSource.joinedTables, dataSource.unionTables]);

    // Fetch filter metadata when new filter fields are added
    useEffect(() => {
        state.filterFields.forEach(field => {
            // Only fetch if metadata doesn't exist for this field
            if (!state.filterMetadata[field.id]) {
                fetchFilterMetadata(field);
            }
        });
    }, [state.filterFields, state.filterMetadata, fetchFilterMetadata]);

    // Refetch filter values with a regex pattern (for large discrete filters)
    const refetchFilterValues = useCallback(async (fieldId: string, regexPattern?: string) => {
        const field = state.filterFields.find(f => f.id === fieldId);
        if (!field || !dataSource.selectedTable) return;
        
        const dbParam = connectionDetails?.type === 'clickhouse' ? dataSource.selectedDatabase : undefined;
        
        // Set loading state
        const currentMetadata = state.filterMetadata[fieldId];
        if (currentMetadata && currentMetadata.type === 'discrete') {
            dispatch({
                type: 'SET_FILTER_METADATA',
                payload: {
                    fieldId,
                    metadata: { ...currentMetadata, loading: true }
                }
            });
        }
        
        try {
            // Get count with regex filter
            const count = await apiService.getDistinctValuesCount(
                field.columnName,
                dataSource.selectedTable,
                dbParam,
                regexPattern,
                field.dateTimePart,
                field.dateTimeMode,
                dataSource.unionTables,  // Pass union tables for _source_table handling
                state.virtualColumns  // Pass virtual columns for expression support
            );
            
            let values: any[];
            let isPartial = false;
            let warningMessage: string | undefined;
            let appliedRegexQuery: string | undefined = regexPattern;
            
            // Preserve the original total count (without regex filter) to determine if field is inherently large
            const originalTotalCount = currentMetadata && currentMetadata.type === 'discrete' 
                ? (currentMetadata.originalTotalCount || currentMetadata.totalCount)
                : count;
            
            if (count <= 5000) {
                // Fetch all values with the regex filter
                values = await apiService.getDistinctValues(
                    field.columnName,
                    dataSource.selectedTable,
                    dbParam,
                    field.dateTimePart,
                    field.dateTimeMode,
                    regexPattern,
                    undefined, // no limit
                    undefined, // no random sampling
                    dataSource.unionTables,  // Pass union tables
                    state.virtualColumns  // Pass virtual columns
                );
                
                // Keep isPartial=true if this field originally had >5000 values
                // This ensures the Query Regex field stays visible even if filter returns 0-5000 results
                isPartial = (originalTotalCount || 0) > 5000;
                
                if (regexPattern) {
                    if (count === 0) {
                        warningMessage = `No values match your query pattern. Try a different pattern.`;
                    } else {
                        warningMessage = `Filtered to ${count.toLocaleString()} values matching your query.`;
                    }
                }
            } else {
                // Still too many - fetch 100 random values matching the regex query
                values = await apiService.getDistinctValues(
                    field.columnName,
                    dataSource.selectedTable,
                    dbParam,
                    field.dateTimePart,
                    field.dateTimeMode,
                    regexPattern,
                    100, // Limit to 100 random samples
                    true, // use random sampling
                    dataSource.unionTables,  // Pass union tables
                    state.virtualColumns  // Pass virtual columns
                );
                isPartial = true;
                warningMessage = `Query matches ${count.toLocaleString()} values (still too many). Showing 100 random samples matching your pattern. Refine further to see all values.`;
            }
            
            const metadata: FilterMetadata = {
                fieldId: field.id,
                columnName: field.columnName,
                type: 'discrete',
                loading: false,
                availableValues: values,
                totalCount: count,
                originalTotalCount, // Preserve the original total
                isPartial,
                warningMessage,
                appliedRegexQuery,
            };
            
            dispatch({
                type: 'SET_FILTER_METADATA',
                payload: { fieldId, metadata }
            });
            
            // Update selected values:
            // - If count is 0: clear selections
            // - If count <=5000 (and >0): select all new values
            // - If count >5000: keep existing selections (partial results)
            if (count === 0) {
                // Clear selections when no results
                dispatch({
                    type: 'SET_FILTER_CONFIGURATION',
                    payload: {
                        fieldId,
                        config: {
                            fieldId: field.id,
                            columnName: field.columnName,
                            type: 'discrete',
                            selectedValues: [],
                            dateTimePart: field.dateTimePart,
                            dateTimeMode: field.dateTimeMode,
                        }
                    }
                });
            } else if (count <= 5000) {
                // Select all matching values when we have a manageable number
                dispatch({
                    type: 'SET_FILTER_CONFIGURATION',
                    payload: {
                        fieldId,
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
            }
            // If count > 5000, don't update selectedValues (keep existing 100 selected)
        } catch (err: any) {
            // Set error state
            const errorMetadata: FilterMetadata = {
                fieldId: field.id,
                columnName: field.columnName,
                type: 'discrete',
                loading: false,
                error: err.message,
                availableValues: [],
            };
            
            dispatch({
                type: 'SET_FILTER_METADATA',
                payload: { fieldId, metadata: errorMetadata }
            });
        }
    }, [state.filterFields, state.filterMetadata, dataSource.selectedTable, dataSource.selectedDatabase, dataSource.unionTables, connectionDetails?.type, dispatch]);

    // --- Virtual Column Handlers ---
    
    const handleAddVirtualColumn = useCallback((column: import('../types').VirtualColumnDefinition) => {
        dispatch({ type: 'ADD_VIRTUAL_COLUMN', payload: column });
    }, [dispatch]);

    const handleUpdateVirtualColumn = useCallback((index: number, column: import('../types').VirtualColumnDefinition) => {
        dispatch({ type: 'UPDATE_VIRTUAL_COLUMN', payload: { index, column } });
    }, [dispatch]);

    const handleRemoveVirtualColumn = useCallback((index: number) => {
        dispatch({ type: 'REMOVE_VIRTUAL_COLUMN', payload: index });
    }, [dispatch]);

    // --- Return all state and handlers ---
    return {
        connectionDetails,
        xAxisFields: state.xAxisFields,
        yAxisFields: state.yAxisFields,
        availableFields: availableFieldsWithVirtual,
        databases: dataSource.databases,
        tables: dataSource.tables,
        selectedDatabase: dataSource.selectedDatabase,
        selectedTable: dataSource.selectedTable,
        isLoadingMetadata: dataSource.isLoadingMetadata,
        metadataError: dataSource.metadataError,
        // Multi-table support
        joinedTables: dataSource.joinedTables,
        suggestedJoinableTables: dataSource.suggestedJoinableTables,
        virtualTable: dataSource.virtualTable,
        fetchSuggestedJoins,
        fetchMergedColumns,
        handleFieldUpdate,
        handleDatabaseSelect,
        handleTableSelect,
        handleRemoveFromAxis,
        handleDropFromAvailableFields,
        handleReorderFields,
        refetchFilterValues,
        // Virtual columns
        virtualColumns: state.virtualColumns,
        handleAddVirtualColumn,
        handleUpdateVirtualColumn,
        handleRemoveVirtualColumn,
    };
} 