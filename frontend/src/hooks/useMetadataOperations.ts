// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { useCallback, useEffect, useRef } from 'react';
import { Field, VirtualColumnDefinition, ForeignKeyRelationship, Sheet } from '../types';
import { apiService } from '../apiService';
import { buildValidColumnNames, validateAxisFields, markAllAxisFieldsInvalid } from '../utils/axisFieldValidation';
import { processColumnsResponse } from '../utils/fieldUtils';
import {
    switchDatabasePreserveTables,
    DatabaseSwitchError,
} from '../services/switchDatabasePreserveTables';
import { SchemaCheckResult } from '../utils/schemaValidation';

interface ConnectionDetails {
    type: 'clickhouse' | 'csv' | 'kaggle' | 'huggingface' | 'hive_parquet';
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
    customRelationships: ForeignKeyRelationship[] | null;
}

interface DataSourceSetters {
    setDatabases: (databases: any[]) => void;
    setTables: (tables: any[]) => void;
    setSelectedDatabase: (database: string) => void;
    setSelectedTable: (table: string) => void;
    setAvailableFields: (fields: Field[]) => void;
    setIsLoadingMetadata: (loading: boolean) => void;
    setMetadataError: (error: string | null) => void;
    setSuggestedJoinableTables: (tables: string[]) => void;
    setSuggestedUnionableTables: (tables: string[]) => void;
    setVirtualTable: (table: any) => void;
    setMeasureGroupFields: (fields: Field[]) => void;
    setUnionTables: (tables: Array<{ database: string; table_name: string }>) => void;
    setTablesForDatabase: (database: string, tables: any[]) => void;
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
    sheets?: Sheet[];
    sessionFilterFields?: Field[];
    onUpdateConnectionDatabase?: (database: string) => void;
}

export interface UseMetadataOperationsReturn {
    fetchDatabases: () => Promise<any[]>;
    fetchTables: (databaseName: string) => Promise<any[]>;
    fetchColumns: () => Promise<void>;
    fetchSuggestedJoins: () => Promise<void>;
    fetchSuggestedUnions: () => Promise<void>;
    fetchMergedColumns: () => Promise<void>;
    refreshMetadata: () => Promise<void>;
    switchDatabasePreserveTables: (newDatabase: string) => Promise<SchemaCheckResult>;
}

export function useMetadataOperations({
    connectionDetails,
    dataSource,
    dataSourceSetters,
    xAxisFields,
    yAxisFields,
    measureGroupFields,
    virtualColumns,
    dispatch,
    sheets = [],
    sessionFilterFields = [],
    onUpdateConnectionDatabase,
}: UseMetadataOperationsParams): UseMetadataOperationsReturn {

    const isSwitchingDatabaseRef = useRef(false);
    // Prevent auto-fetch effects from looping when a fetch fails (or returns empty)
    // while isLoadingMetadata is in the effect deps: loading false + empty list would
    // otherwise re-trigger forever (e.g. snapshot restore to a missing ClickHouse DB).
    const tablesFetchedForRef = useRef<string | null>(null);
    const columnsFetchedForRef = useRef<string | null>(null);
    const prevTablesLengthRef = useRef(dataSource.tables.length);
    const prevFieldsLengthRef = useRef(dataSource.availableFields.length);

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
            if (
                (
                    connectionDetails?.type === 'csv'
                    || connectionDetails?.type === 'kaggle'
                    || connectionDetails?.type === 'huggingface'
                )
                && tables.length === 1
            ) {
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
            // Mark this database as attempted so the auto-fetch effect does not loop
            // when isLoadingMetadata flips back to false with tables still empty.
            tablesFetchedForRef.current = targetDatabase;
            dataSourceSetters.setIsLoadingMetadata(false);
        }
    }, [connectionDetails?.type, dataSourceSetters]);

    const fetchColumns = useCallback(async () => {
        if (!dataSource.selectedTable) return;
        if (connectionDetails?.type === 'clickhouse' && !dataSource.selectedDatabase) return;
        
        const tableKey = dataSource.selectedTable;
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
            // Mark this table as attempted so the auto-fetch effect does not loop
            // when isLoadingMetadata flips back to false with fields still empty.
            columnsFetchedForRef.current = tableKey;
            dataSourceSetters.setIsLoadingMetadata(false);
        }
    }, [
        dataSource.selectedTable,
        dataSource.selectedDatabase,
        dataSource.fieldDisplayAliases,
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
                dataSource.joinedTables,  // Pass already-joined tables for transitive relationships
                dataSource.customRelationships  // Pass custom relationships if defined
            );
            dataSourceSetters.setSuggestedJoinableTables(response.suggested_tables || []);
        } catch (err: any) {
            console.warn('Could not fetch suggested joins:', err.message);
            dataSourceSetters.setSuggestedJoinableTables([]);
        }
    }, [dataSource.selectedTable, dataSource.selectedDatabase, dataSource.joinedTables, dataSource.customRelationships, connectionDetails?.type, dataSourceSetters]);

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
                false, // Don't auto-detect, use explicitly selected tables
                dataSource.customRelationships  // Pass custom relationships if defined
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
        dataSource.customRelationships,
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
        // Allow auto-fetch effects to retry after a manual refresh (e.g. missing DB fixed).
        tablesFetchedForRef.current = null;
        columnsFetchedForRef.current = null;

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
        tablesFetchedForRef.current = null;
        columnsFetchedForRef.current = null;
        
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
        } else if (
            connectionDetails.type === 'csv'
            || connectionDetails.type === 'kaggle'
            || connectionDetails.type === 'huggingface'
        ) {
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
        // REASON: only re-fetch when the connection itself changes; dataSource setters/state are intentionally omitted to avoid refetch loops on every metadata mutation.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [connectionDetails]);
    
    useEffect(() => {
        const prevFieldsLength = prevFieldsLengthRef.current;
        prevFieldsLengthRef.current = dataSource.availableFields.length;

        // Selection changed → allow a new auto-fetch attempt for the new table.
        if (
            columnsFetchedForRef.current !== null
            && columnsFetchedForRef.current !== dataSource.selectedTable
        ) {
            columnsFetchedForRef.current = null;
        }
        // Fields intentionally cleared (table re-select / snapshot restore) → allow refetch.
        if (prevFieldsLength > 0 && dataSource.availableFields.length === 0) {
            columnsFetchedForRef.current = null;
        }

        if (isManualRefreshRunningRef.current) return;

        // Fetch columns when table is selected (either from initial load or user selection)
        if (dataSource.selectedTable && !dataSource.isLoadingMetadata) {
            // Only fetch if we don't have fields or if the fields list was just cleared (user changed table)
            if (dataSource.availableFields.length === 0) {
                // Skip when joined or union tables are present — fetchMergedColumns handles those
                if (dataSource.joinedTables.length > 0 || dataSource.unionTables.length > 0) {
                    return;
                }
                // Already attempted for this table (failed or empty) — do not loop on loading flip.
                if (columnsFetchedForRef.current === dataSource.selectedTable) {
                    return;
                }
                fetchColumns();
            }
        }
        // REASON: fetchColumns and other dataSource setters are stable per render but identity changes; excluding them prevents re-fetch storms on unrelated state updates.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dataSource.selectedTable, dataSource.availableFields.length, dataSource.isLoadingMetadata]);

    useEffect(() => {
        const prevTablesLength = prevTablesLengthRef.current;
        prevTablesLengthRef.current = dataSource.tables.length;

        // Selection changed → allow a new auto-fetch attempt for the new database.
        if (
            tablesFetchedForRef.current !== null
            && tablesFetchedForRef.current !== dataSource.selectedDatabase
        ) {
            tablesFetchedForRef.current = null;
        }
        // Tables intentionally cleared (DB switch / snapshot restore) → allow refetch.
        if (prevTablesLength > 0 && dataSource.tables.length === 0) {
            tablesFetchedForRef.current = null;
        }

        if (isManualRefreshRunningRef.current) return;

        // Fetch tables when database is selected (either from initial load or user selection)
        if (dataSource.selectedDatabase && !dataSource.isLoadingMetadata) {
            // Only fetch if we don't have tables or if the tables list was just cleared (user changed database)
            if (dataSource.tables.length === 0) {
                // Already attempted for this database (failed or empty) — do not loop on loading flip.
                if (tablesFetchedForRef.current === dataSource.selectedDatabase) {
                    return;
                }
                fetchTables(dataSource.selectedDatabase);
            }
        }
        // REASON: fetchTables closes over connection state; including it would re-trigger fetch on every render via new closure identity.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dataSource.selectedDatabase, dataSource.tables.length, dataSource.isLoadingMetadata]);

    // Fetch suggested joins when table is selected or joined tables change (for ClickHouse and Kaggle)
    // This enables transitive relationships: when you join table B, you can then see tables that join to B
    // Also re-fetches when customRelationships change (manual FK mode)
    useEffect(() => {
        if (dataSource.selectedTable && (connectionDetails?.type === 'clickhouse' || connectionDetails?.type === 'kaggle')) {
            fetchSuggestedJoins();
        }
        // REASON: deliberately key on the inputs that change suggested-join results; fetchSuggestedJoins identity is unstable so excluding it prevents redundant fetches.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dataSource.selectedTable, dataSource.selectedDatabase, dataSource.joinedTables, dataSource.customRelationships, connectionDetails?.type]);

    // Fetch suggested unions when table is selected
    useEffect(() => {
        if (dataSource.selectedTable && dataSource.selectedDatabase && connectionDetails?.type === 'clickhouse') {
            fetchSuggestedUnions();
        }
        // REASON: as above — fetchSuggestedUnions excluded to keep this effect keyed only on the inputs that affect union suggestions.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dataSource.selectedTable, dataSource.selectedDatabase, connectionDetails?.type]);

    // Fetch merged columns when joined or union tables change, or custom relationships change
    useEffect(() => {
        if (dataSource.selectedTable) {
            fetchMergedColumns();
        }
        // REASON: fetchMergedColumns omitted — re-running on its identity change would loop because it dispatches into the same context this effect reads.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dataSource.selectedTable, dataSource.joinedTables, dataSource.unionTables, dataSource.customRelationships]);

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
        // REASON: dispatch is stable from useReducer but adding it triggers exhaustive-deps for the ref reads too; effect must only react to virtualTable changes.
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

    const switchDatabasePreserveTablesHandler = useCallback(async (newDatabase: string) => {
        if (connectionDetails?.type !== 'clickhouse') {
            throw new DatabaseSwitchError('Database switch is only supported for ClickHouse.');
        }
        if (isSwitchingDatabaseRef.current) {
            throw new DatabaseSwitchError('A database switch is already in progress.');
        }
        isSwitchingDatabaseRef.current = true;
        try {
            const result = await switchDatabasePreserveTables({
                oldDatabase: dataSource.selectedDatabase,
                newDatabase,
                selectedTable: dataSource.selectedTable,
                joinedTables: dataSource.joinedTables,
                unionTables: dataSource.unionTables,
                customRelationships: dataSource.customRelationships,
                fieldDisplayAliases: dataSource.fieldDisplayAliases,
                measureGroupFields,
                xAxisFields,
                yAxisFields,
                virtualColumns,
                sheets,
                sessionFilterFields,
                setSelectedDatabase: dataSourceSetters.setSelectedDatabase,
                setUnionTables: dataSourceSetters.setUnionTables,
                setTables: dataSourceSetters.setTables,
                setTablesForDatabase: dataSourceSetters.setTablesForDatabase,
                setAvailableFields: dataSourceSetters.setAvailableFields,
                setVirtualTable: dataSourceSetters.setVirtualTable,
                setIsLoadingMetadata: dataSourceSetters.setIsLoadingMetadata,
                setMetadataError: dataSourceSetters.setMetadataError,
                setMeasureGroupFields: dataSourceSetters.setMeasureGroupFields,
                patchAxisFields: (patchedX, patchedY) => {
                    dispatch({ type: 'SET_X_AXIS_FIELDS', payload: patchedX });
                    dispatch({ type: 'SET_Y_AXIS_FIELDS', payload: patchedY });
                },
                onUpdateConnectionDatabase,
            });
            dispatch({ type: 'FORCE_QUERY_REFRESH' });
            return result;
        } finally {
            isSwitchingDatabaseRef.current = false;
        }
    }, [
        connectionDetails?.type,
        dataSource.selectedDatabase,
        dataSource.selectedTable,
        dataSource.joinedTables,
        dataSource.unionTables,
        dataSource.customRelationships,
        dataSource.fieldDisplayAliases,
        measureGroupFields,
        xAxisFields,
        yAxisFields,
        virtualColumns,
        sheets,
        sessionFilterFields,
        dataSourceSetters,
        dispatch,
        onUpdateConnectionDatabase,
    ]);

    return {
        fetchDatabases,
        fetchTables,
        fetchColumns,
        fetchSuggestedJoins,
        fetchSuggestedUnions,
        fetchMergedColumns,
        refreshMetadata,
        switchDatabasePreserveTables: switchDatabasePreserveTablesHandler,
    };
}

