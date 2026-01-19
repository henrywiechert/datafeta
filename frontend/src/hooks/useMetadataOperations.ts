import { useCallback, useEffect, useRef } from 'react';
import { Field, DataType } from '../types';
import { apiService } from '../apiService';
import { generateSyntheticFieldsForGroup } from '../utils/syntheticFields';

interface ConnectionDetails {
    type: 'clickhouse' | 'csv' | 'kaggle';
}

interface DataSourceState {
    databases: any[];
    tables: any[];
    selectedDatabase: string;
    selectedTable: string;
    availableFields: Field[];
    isLoadingMetadata: boolean;
    measureGroupFields: Field[];
    joinedTables: string[];
    unionTables: Array<{database: string, table_name: string}>;
    virtualTable: any | null;
}

interface DataSourceSetters {
    setDatabases: (databases: any[]) => void;
    setTables: (tables: any[]) => void;
    setSelectedTable: (table: string) => void;
    setAvailableFields: (fields: Field[]) => void;
    setIsLoadingMetadata: (loading: boolean) => void;
    setMetadataError: (error: string | null) => void;
    setSuggestedJoinableTables: (tables: string[]) => void;
    setSuggestedUnionableTables: (tables: string[]) => void;
    setVirtualTable: (table: any) => void;
    setMeasureGroupFields: (fields: Field[]) => void;
}

interface UseMetadataOperationsParams {
    connectionDetails: ConnectionDetails | null;
    dataSource: DataSourceState;
    dataSourceSetters: DataSourceSetters;
    xAxisFields: Field[];
    yAxisFields: Field[];
    dispatch: React.Dispatch<any>;
}

export interface UseMetadataOperationsReturn {
    fetchDatabases: () => Promise<void>;
    fetchTables: (databaseName: string) => Promise<void>;
    fetchColumns: () => Promise<void>;
    fetchSuggestedJoins: () => Promise<void>;
    fetchSuggestedUnions: () => Promise<void>;
    fetchMergedColumns: () => Promise<void>;
}

export function useMetadataOperations({
    connectionDetails,
    dataSource,
    dataSourceSetters,
    xAxisFields,
    yAxisFields,
    dispatch
}: UseMetadataOperationsParams): UseMetadataOperationsReturn {

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

    const fetchDatabases = useCallback(async () => {
        dataSourceSetters.setIsLoadingMetadata(true);
        dataSourceSetters.setMetadataError(null);
        try {
            const response = await apiService.listDatabases();
            dataSourceSetters.setDatabases(response.databases || []);
        } catch (err: any) { 
            if (err.message === 'Request was cancelled') {
                // Request was cancelled, don't set error
                dataSourceSetters.setMetadataError(null);
            } else {
                dataSourceSetters.setMetadataError(err.message);
            }
        }
        finally { 
            dataSourceSetters.setIsLoadingMetadata(false);
        }
    }, [dataSourceSetters]);

    const fetchTables = useCallback(async (databaseName: string) => {
        const targetDatabase = databaseName;
        if (connectionDetails?.type === 'clickhouse' && !targetDatabase) return;
        
        dataSourceSetters.setIsLoadingMetadata(true);
        dataSourceSetters.setMetadataError(null);
        try {
            const response = await apiService.listTables(targetDatabase);
            dataSourceSetters.setTables(response.tables || []);
            if ((connectionDetails?.type === 'csv' || connectionDetails?.type === 'kaggle') && response.tables?.length === 1) {
                dataSourceSetters.setSelectedTable(response.tables[0].name);
                // Dispatch to VisualizationContext to increment queryVersion for CSV/Kaggle auto-selection
                dispatch({ type: 'SET_SELECTED_TABLE', payload: response.tables[0].name });
            }
        } catch (err: any) { 
            if (err.message === 'Request was cancelled') {
                // Request was cancelled, don't set error
                dataSourceSetters.setMetadataError(null);
            } else {
                dataSourceSetters.setMetadataError(err.message);
            }
        }
        finally { 
            dataSourceSetters.setIsLoadingMetadata(false);
        }
    }, [connectionDetails?.type, dataSourceSetters, dispatch]);

    const fetchColumns = useCallback(async () => {
        if (!dataSource.selectedTable) return;
        if (connectionDetails?.type === 'clickhouse' && !dataSource.selectedDatabase) return;
        
        dataSourceSetters.setIsLoadingMetadata(true);
        dataSourceSetters.setMetadataError(null);
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
            
            const measureNameSet = new Set(
                fields.filter(field => field.type === 'measure').map(field => field.columnName)
            );
            const nextMeasureGroupFields = (dataSource.measureGroupFields || [])
                .filter((field) => measureNameSet.has(field.columnName));

            const syntheticFields = generateSyntheticFieldsForGroup(
                fields,
                nextMeasureGroupFields.map(field => field.columnName)
            );

            dataSourceSetters.setMeasureGroupFields(nextMeasureGroupFields);
            dataSourceSetters.setAvailableFields([...fields, ...syntheticFields]);

            // Mark axis fields that are not present in new schema as invalid
            const availableNames = new Set(fields.map(f => f.columnName));
            const patchedX = xAxisFields.map(f => ({ ...f, isInvalid: !availableNames.has(f.columnName) }));
            const patchedY = yAxisFields.map(f => ({ ...f, isInvalid: !availableNames.has(f.columnName) }));
            dispatch({ type: 'SET_X_AXIS_FIELDS', payload: patchedX });
            dispatch({ type: 'SET_Y_AXIS_FIELDS', payload: patchedY });
            
            // Note: FORCE_QUERY_REFRESH is handled by the snapshot detection effect
            // which waits for BOTH availableFields AND selectedTable to be set.
            // Dispatching here would fire too early (before selectedTable is restored).
        } catch (err: any) { 
            if (err.message === 'Request was cancelled') {
                // Request was cancelled, don't set error
                dataSourceSetters.setMetadataError(null);
            } else {
                dataSourceSetters.setMetadataError(err.message);
            }
        }
        finally { 
            dataSourceSetters.setIsLoadingMetadata(false);
        }
    }, [
        dataSource.selectedTable,
        dataSource.selectedDatabase,
        dataSource.measureGroupFields,
        xAxisFields,
        yAxisFields,
        connectionDetails?.type,
        dataSourceSetters,
        dispatch
    ]);

    // Fetch suggested joinable tables for the selected primary table
    const fetchSuggestedJoins = useCallback(async () => {
        if (!dataSource.selectedTable) return;
        // Support JOIN for both ClickHouse and Kaggle
        if (connectionDetails?.type !== 'clickhouse' && connectionDetails?.type !== 'kaggle') return;
        
        // For Kaggle, use 'kaggle' as database name
        const database = connectionDetails?.type === 'kaggle' ? 'kaggle' : dataSource.selectedDatabase;
        if (!database) return;
        
        try {
            const response = await apiService.getSuggestedJoins(
                database,
                dataSource.selectedTable,
                dataSource.joinedTables  // Pass already-joined tables for transitive relationships
            );
            dataSourceSetters.setSuggestedJoinableTables(response.suggested_tables || []);
        } catch (err: any) {
            console.warn('Could not fetch suggested joins:', err.message);
            dataSourceSetters.setSuggestedJoinableTables([]);
        }
    }, [dataSource.selectedTable, dataSource.selectedDatabase, dataSource.joinedTables, connectionDetails?.type, dataSourceSetters]);

    // DEPRECATED: Auto-suggestion removed in favor of manual cross-database table selection
    // Kept as no-op for backward compatibility
    const fetchSuggestedUnions = useCallback(async () => {
        // No longer fetches suggestions - cross-database UNION uses manual selection
        dataSourceSetters.setSuggestedUnionableTables([]);
    }, [dataSourceSetters]);

    // Fetch merged columns when joined tables change
    const fetchMergedColumns = useCallback(async () => {
        if (!dataSource.selectedTable) return;
        if (connectionDetails?.type === 'clickhouse' && !dataSource.selectedDatabase) return;
        
        // If no joined or union tables, fetch regular columns
        if (dataSource.joinedTables.length === 0 && dataSource.unionTables.length === 0) {
            await fetchColumns();
            dataSourceSetters.setVirtualTable(null);
            return;
        }
        
        dataSourceSetters.setIsLoadingMetadata(true);
        dataSourceSetters.setMetadataError(null);
        
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
                
                const measureNameSet = new Set(
                    fields.filter(field => field.type === 'measure').map(field => field.columnName)
                );
                const nextMeasureGroupFields = (dataSource.measureGroupFields || [])
                    .filter((field) => measureNameSet.has(field.columnName));

                const syntheticFields = generateSyntheticFieldsForGroup(
                    fields,
                    nextMeasureGroupFields.map(field => field.columnName)
                );

                dataSourceSetters.setMeasureGroupFields(nextMeasureGroupFields);
                dataSourceSetters.setAvailableFields([...fields, ...syntheticFields]);
                dataSourceSetters.setVirtualTable(response.virtual_table);
                dataSourceSetters.setIsLoadingMetadata(false);
                
                // Don't dispatch here - let the useEffect below handle it after virtualTable is set
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
            
            const measureNameSet = new Set(
                fields.filter(field => field.type === 'measure').map(field => field.columnName)
            );
            const nextMeasureGroupFields = (dataSource.measureGroupFields || [])
                .filter((field) => measureNameSet.has(field.columnName));

            const syntheticFields = generateSyntheticFieldsForGroup(
                fields,
                nextMeasureGroupFields.map(field => field.columnName)
            );

            dataSourceSetters.setMeasureGroupFields(nextMeasureGroupFields);
            dataSourceSetters.setAvailableFields([...fields, ...syntheticFields]);
            dataSourceSetters.setVirtualTable(response.virtual_table);

            // Mark axis fields that are not present in new schema as invalid
            const availableNames = new Set(fields.map(f => f.columnName));
            const patchedX = xAxisFields.map(f => ({ ...f, isInvalid: !availableNames.has(f.columnName) }));
            const patchedY = yAxisFields.map(f => ({ ...f, isInvalid: !availableNames.has(f.columnName) }));
            dispatch({ type: 'SET_X_AXIS_FIELDS', payload: patchedX });
            dispatch({ type: 'SET_Y_AXIS_FIELDS', payload: patchedY });
            
            // Don't dispatch here - let the useEffect below handle it after virtualTable is set
        } catch (err: any) {
            if (err.message === 'Request was cancelled') {
                dataSourceSetters.setMetadataError(null);
            } else {
                dataSourceSetters.setMetadataError(err.message);
            }
        }
        finally { 
            dataSourceSetters.setIsLoadingMetadata(false);
        }
    }, [
        dataSource.selectedTable, 
        dataSource.selectedDatabase, 
        dataSource.joinedTables,
        dataSource.unionTables,
        dataSource.measureGroupFields,
        xAxisFields, 
        yAxisFields, 
        connectionDetails?.type, 
        dataSourceSetters,
        dispatch,
        fetchColumns
    ]);

    // --- Effects to trigger data fetching ---
    // Track if we've already initialized for this connection to avoid re-clearing
    // when multiple hook instances run (e.g., due to nested VisualizationProvider)
    const connectionInitializedRef = useRef<string | null>(null);
    
    useEffect(() => {
        if (!connectionDetails) return;
        
        // Create a connection identifier to track initialization
        const connectionId = `${connectionDetails.type}-${Date.now()}`;
        
        // Skip if we've already initialized for a connection and selectedTable is set
        // This prevents clearing selectedTable that was set by snapshot restore
        if (connectionInitializedRef.current && dataSource.selectedTable) {
            return;
        }
        
        // Skip if DataSourceContext already has metadata loaded (e.g., sheet switch remount)
        // The DataSourceContext persists across sheet switches, so if we have fields loaded,
        // we don't need to re-fetch them just because VisualizationProvider remounted
        if (dataSource.selectedTable && dataSource.availableFields.length > 0) {
            connectionInitializedRef.current = connectionId;
            return;
        }
        
        connectionInitializedRef.current = connectionId;
        
        // Clear existing metadata and fetch new data when connection changes
        // This ensures we get fresh data after reconnecting to a different server
        if (connectionDetails.type === 'clickhouse') {
            // Clear old metadata first
            dataSourceSetters.setDatabases([]);
            dataSourceSetters.setTables([]);
            dataSourceSetters.setAvailableFields([]);
            // Only clear selectedTable if it's not already set (snapshot restore case)
            if (!dataSource.selectedTable) {
                dataSourceSetters.setSelectedTable('');
            }
            // Clear selected database via dispatch
            dispatch({ type: 'SET_SELECTED_DATABASE', payload: '' });
            // Fetch new databases
            if (!dataSource.isLoadingMetadata) {
                dataSourceSetters.setMetadataError(null);
                fetchDatabases();
            }
        } else if (connectionDetails.type === 'csv' || connectionDetails.type === 'kaggle') {
            // Clear old metadata first
            dataSourceSetters.setTables([]);
            dataSourceSetters.setAvailableFields([]);
            // Only clear selectedTable if it's not already set (snapshot restore case)
            if (!dataSource.selectedTable) {
                dataSourceSetters.setSelectedTable('');
            }
            // Fetch new tables
            if (!dataSource.isLoadingMetadata) {
                dataSourceSetters.setMetadataError(null);
                fetchTables('');
            }
        }
        // Columns fetch will trigger once selectedTable is set (CSV/Kaggle auto-selection handled in fetchTables)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [connectionDetails]);
    
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

    // Fetch suggested joins when table is selected or joined tables change (for ClickHouse and Kaggle)
    // This enables transitive relationships: when you join table B, you can then see tables that join to B
    useEffect(() => {
        if (dataSource.selectedTable && (connectionDetails?.type === 'clickhouse' || connectionDetails?.type === 'kaggle')) {
            fetchSuggestedJoins();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dataSource.selectedTable, dataSource.selectedDatabase, dataSource.joinedTables, connectionDetails?.type]);

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

    // --- Effect to handle snapshot loading with pre-populated axis fields ---
    // When VisualizationProvider mounts with initialState containing axis fields,
    // and metadata is already loaded (e.g., user connected on DataSourcePage first),
    // we need to force a query refresh since fetchColumns won't be called again.
    // 
    // Key insight: We only want to trigger this for snapshot-loaded fields, not when
    // user adds fields interactively. We detect this by checking if fields were present
    // on the FIRST render of this hook instance.
    const initialAxisFieldsRef = useRef<{ x: number; y: number } | null>(null);
    const hasTriggeredInitialQueryRef = useRef(false);
    
    // Capture initial field counts on first render only
    if (initialAxisFieldsRef.current === null) {
        initialAxisFieldsRef.current = {
            x: xAxisFields.length,
            y: yAxisFields.length
        };
    }
    
    useEffect(() => {
        // Only trigger once per mount
        if (hasTriggeredInitialQueryRef.current) return;
        
        // Only trigger if fields were present on initial render (snapshot load)
        const hadInitialFields = initialAxisFieldsRef.current && 
            (initialAxisFieldsRef.current.x > 0 || initialAxisFieldsRef.current.y > 0);
        if (!hadInitialFields) return;
        
        // Check conditions for snapshot-loaded state
        const hasMetadata = dataSource.selectedTable && dataSource.availableFields.length > 0;
        const isConnected = !!connectionDetails;
        
        if (hasMetadata && isConnected) {
            hasTriggeredInitialQueryRef.current = true;
            dispatch({ type: 'FORCE_QUERY_REFRESH' });
        }
    }, [dataSource.selectedTable, dataSource.availableFields.length, connectionDetails, dispatch]);

    // Dispatch TABLE_JOINS_UNIONS_MODIFIED when virtualTable changes
    // This ensures virtualTable is updated in context before query executes
    // Also dispatches when virtualTable becomes null (union tables removed)
    const prevVirtualTableRef = useRef<any>(dataSource.virtualTable);
    useEffect(() => {
        // Skip initial mount
        if (prevVirtualTableRef.current === undefined && dataSource.virtualTable === null) {
            prevVirtualTableRef.current = dataSource.virtualTable;
            return;
        }
        
        // Dispatch whenever virtualTable changes (including to/from null)
        if (prevVirtualTableRef.current !== dataSource.virtualTable) {
            prevVirtualTableRef.current = dataSource.virtualTable;
            dispatch({ type: 'TABLE_JOINS_UNIONS_MODIFIED' });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dataSource.virtualTable]);

    return {
        fetchDatabases,
        fetchTables,
        fetchColumns,
        fetchSuggestedJoins,
        fetchSuggestedUnions,
        fetchMergedColumns,
    };
}

