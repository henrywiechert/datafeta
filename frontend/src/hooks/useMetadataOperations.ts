import { useCallback, useEffect, useRef } from 'react';
import { Field, VirtualColumnDefinition } from '../types';
import { apiService } from '../apiService';
import { buildValidColumnNames, validateAxisFields, markAllAxisFieldsInvalid } from '../utils/axisFieldValidation';
import { processColumnsResponse } from '../utils/fieldUtils';

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
    // measureGroupFields removed - now per-sheet in VisualizationContext
    joinedTables: string[];
    unionTables: Array<{database: string, table_name: string}>;
    virtualTable: any | null;
    fieldDisplayAliases: Record<string, string>;
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
    measureGroupFields: Field[]; // Now from VisualizationContext
    virtualColumns: VirtualColumnDefinition[]; // For axis field validation
    dispatch: React.Dispatch<any>;
}

export interface UseMetadataOperationsReturn {
    fetchDatabases: () => Promise<any[]>;
    fetchTables: (databaseName: string) => Promise<any[]>;
    fetchColumns: () => Promise<void>;
    fetchSuggestedJoins: () => Promise<void>;
    fetchSuggestedUnions: () => Promise<void>;
    fetchMergedColumns: () => Promise<void>;
    refreshMetadata: () => Promise<void>;
}

export function useMetadataOperations({
    connectionDetails,
    dataSource,
    dataSourceSetters,
    xAxisFields,
    yAxisFields,
    measureGroupFields,
    virtualColumns,
    dispatch
}: UseMetadataOperationsParams): UseMetadataOperationsReturn {

    const fetchDatabases = useCallback(async (): Promise<any[]> => {
        dataSourceSetters.setIsLoadingMetadata(true);
        dataSourceSetters.setMetadataError(null);
        try {
            const response = await apiService.listDatabases();
            const databases = response.databases || [];
            dataSourceSetters.setDatabases(databases);
            return databases;
        } catch (err: any) { 
            if (err.message === 'Request was cancelled') {
                // Request was cancelled, don't set error
                dataSourceSetters.setMetadataError(null);
            } else {
                dataSourceSetters.setMetadataError(err.message);
            }
            return [];
        }
        finally { 
            dataSourceSetters.setIsLoadingMetadata(false);
        }
    }, [dataSourceSetters]);

    const fetchTables = useCallback(async (databaseName: string): Promise<any[]> => {
        const targetDatabase = databaseName;
        if (connectionDetails?.type === 'clickhouse' && !targetDatabase) return [];
        
        dataSourceSetters.setIsLoadingMetadata(true);
        dataSourceSetters.setMetadataError(null);
        try {
            const response = await apiService.listTables(targetDatabase);
            const tables = response.tables || [];
            dataSourceSetters.setTables(tables);
            if ((connectionDetails?.type === 'csv' || connectionDetails?.type === 'kaggle') && tables.length === 1) {
                dataSourceSetters.setSelectedTable(tables[0].name);
                // Note: Query refresh is triggered by the effect that watches selectedTable
                // and availableFields changes in the snapshot loading effect below
            }
            return tables;
        } catch (err: any) { 
            if (err.message === 'Request was cancelled') {
                // Request was cancelled, don't set error
                dataSourceSetters.setMetadataError(null);
            } else {
                dataSourceSetters.setMetadataError(err.message);
            }
            return [];
        }
        finally { 
            dataSourceSetters.setIsLoadingMetadata(false);
        }
    }, [connectionDetails?.type, dataSourceSetters]);

    const fetchColumns = useCallback(async () => {
        if (!dataSource.selectedTable) return;
        if (connectionDetails?.type === 'clickhouse' && !dataSource.selectedDatabase) return;
        
        dataSourceSetters.setIsLoadingMetadata(true);
        dataSourceSetters.setMetadataError(null);
        try {
            const dbParam = connectionDetails?.type === 'clickhouse' ? dataSource.selectedDatabase : undefined;
            const response = await apiService.listColumns(dataSource.selectedTable, dbParam);
            
            // Process columns into fields with synthetic fields
            const { allFields, nextMeasureGroupFields } = processColumnsResponse(
                response.columns,
                measureGroupFields,
                { fieldDisplayAliases: dataSource.fieldDisplayAliases }
            );

            // Update state
            dispatch({ type: 'SET_MEASURE_GROUP_FIELDS', payload: nextMeasureGroupFields });
            dataSourceSetters.setAvailableFields(allFields);

            // Mark axis fields that are not present in new schema as invalid
            // Include both real columns AND virtual columns in the valid names
            const validNames = buildValidColumnNames(allFields, virtualColumns);
            const { patchedX, patchedY } = validateAxisFields(xAxisFields, yAxisFields, validNames);
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
        measureGroupFields,
        xAxisFields,
        yAxisFields,
        virtualColumns,
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
                
                // Process columns into fields (include tableName for UNION mode)
                const { allFields, nextMeasureGroupFields } = processColumnsResponse(
                    response.columns,
                    measureGroupFields,
                    { includeTableName: true }
                );

                // Update state
                dispatch({ type: 'SET_MEASURE_GROUP_FIELDS', payload: nextMeasureGroupFields });
                dataSourceSetters.setAvailableFields(allFields);
                dataSourceSetters.setVirtualTable(response.virtual_table);
                
                // Mark axis fields that are not present in new schema as invalid
                const validNames = buildValidColumnNames(allFields, virtualColumns);
                const { patchedX, patchedY } = validateAxisFields(xAxisFields, yAxisFields, validNames);
                dispatch({ type: 'SET_X_AXIS_FIELDS', payload: patchedX });
                dispatch({ type: 'SET_Y_AXIS_FIELDS', payload: patchedY });
                
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
            
            // Process columns into fields
            const { allFields, nextMeasureGroupFields } = processColumnsResponse(
                response.columns,
                measureGroupFields
            );

            // Update state
            dispatch({ type: 'SET_MEASURE_GROUP_FIELDS', payload: nextMeasureGroupFields });
            dataSourceSetters.setAvailableFields(allFields);
            dataSourceSetters.setVirtualTable(response.virtual_table);

            // Mark axis fields that are not present in new schema as invalid
            const validNames = buildValidColumnNames(allFields, virtualColumns);
            const { patchedX, patchedY } = validateAxisFields(xAxisFields, yAxisFields, validNames);
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
        measureGroupFields,
        xAxisFields, 
        yAxisFields, 
        virtualColumns,
        connectionDetails?.type, 
        dataSourceSetters,
        dispatch,
        fetchColumns
    ]);

    const isManualRefreshRunningRef = useRef(false);
    const refreshMetadata = useCallback(async () => {
        if (isManualRefreshRunningRef.current) return;
        isManualRefreshRunningRef.current = true;

        try {
            // 1) Refresh top-level metadata lists.
            if (connectionDetails?.type === 'clickhouse') {
                await fetchDatabases();
            }

            const refreshedTables = await fetchTables(dataSource.selectedDatabase || '');

            // 2) Refresh selected table metadata when selection still exists.
            const selectedTable = dataSource.selectedTable;
            const selectedTableStillExists = !!selectedTable
                && refreshedTables.some((table: any) => table?.name === selectedTable);

            if (!selectedTableStillExists) return;

            if (dataSource.joinedTables.length > 0 || dataSource.unionTables.length > 0) {
                await fetchMergedColumns();
            } else {
                await fetchColumns();
            }
        } finally {
            isManualRefreshRunningRef.current = false;
        }
    }, [
        connectionDetails?.type,
        dataSource.selectedDatabase,
        dataSource.selectedTable,
        dataSource.joinedTables.length,
        dataSource.unionTables.length,
        fetchDatabases,
        fetchTables,
        fetchMergedColumns,
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
            // Clear old metadata first via DataSourceContext setters
            dataSourceSetters.setDatabases([]);
            dataSourceSetters.setTables([]);
            dataSourceSetters.setAvailableFields([]);
            // Only clear selectedTable if it's not already set (snapshot restore case)
            if (!dataSource.selectedTable) {
                dataSourceSetters.setSelectedTable('');
            }
            // Note: selectedDatabase is now managed via DataSourceContext setters
            // The UI component that allows database selection will call setSelectedDatabase
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

    // Mark all axis fields as invalid when table is cleared
    // This handles the case when user removes the table while fields are still on axes
    const prevSelectedTableRef = useRef<string>(dataSource.selectedTable);
    useEffect(() => {
        const prevTable = prevSelectedTableRef.current;
        const currentTable = dataSource.selectedTable;
        prevSelectedTableRef.current = currentTable;
        
        // Only act when table changes from non-empty to empty
        // AND there are fields on the axes that need to be marked invalid
        if (prevTable && !currentTable && (xAxisFields.length > 0 || yAxisFields.length > 0)) {
            const { patchedX, patchedY } = markAllAxisFieldsInvalid(xAxisFields, yAxisFields);
            dispatch({ type: 'SET_X_AXIS_FIELDS', payload: patchedX });
            dispatch({ type: 'SET_Y_AXIS_FIELDS', payload: patchedY });
        }
    }, [dataSource.selectedTable, xAxisFields, yAxisFields, dispatch]);

    return {
        fetchDatabases,
        fetchTables,
        fetchColumns,
        fetchSuggestedJoins,
        fetchSuggestedUnions,
        fetchMergedColumns,
        refreshMetadata,
    };
}

