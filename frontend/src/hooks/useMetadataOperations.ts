import { useCallback, useEffect, useRef } from 'react';
import { Field, DataType } from '../types';
import { apiService } from '../apiService';
import { generateSyntheticFields } from '../utils/syntheticFields';

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
            if (connectionDetails?.type === 'csv' && response.tables?.length === 1) {
                dataSourceSetters.setSelectedTable(response.tables[0].name);
                // Dispatch to VisualizationContext to increment queryVersion for CSV auto-selection
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
            
            // Generate and append synthetic fields (MeasureNames/MeasureValues)
            const syntheticFields = generateSyntheticFields(fields);
            const fieldsWithSynthetic = [...fields, ...syntheticFields];
            dataSourceSetters.setAvailableFields(fieldsWithSynthetic);

            // Mark axis fields that are not present in new schema as invalid
            const availableNames = new Set(fields.map(f => f.columnName));
            const patchedX = xAxisFields.map(f => ({ ...f, isInvalid: !availableNames.has(f.columnName) } as any));
            const patchedY = yAxisFields.map(f => ({ ...f, isInvalid: !availableNames.has(f.columnName) } as any));
            dispatch({ type: 'SET_X_AXIS_FIELDS', payload: patchedX });
            dispatch({ type: 'SET_Y_AXIS_FIELDS', payload: patchedY });
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
    }, [dataSource.selectedTable, dataSource.selectedDatabase, xAxisFields, yAxisFields, connectionDetails?.type, dataSourceSetters, dispatch]);

    // Fetch suggested joinable tables for the selected primary table
    const fetchSuggestedJoins = useCallback(async () => {
        if (!dataSource.selectedTable || !dataSource.selectedDatabase) return;
        if (connectionDetails?.type !== 'clickhouse') return; // Only for database sources
        
        try {
            const response = await apiService.getSuggestedJoins(
                dataSource.selectedDatabase,
                dataSource.selectedTable
            );
            dataSourceSetters.setSuggestedJoinableTables(response.suggested_tables || []);
        } catch (err: any) {
            console.warn('Could not fetch suggested joins:', err.message);
            dataSourceSetters.setSuggestedJoinableTables([]);
        }
    }, [dataSource.selectedTable, dataSource.selectedDatabase, connectionDetails?.type, dataSourceSetters]);

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
                
                // Generate and append synthetic fields (MeasureNames/MeasureValues)
                const syntheticFields = generateSyntheticFields(fields);
                const fieldsWithSynthetic = [...fields, ...syntheticFields];
                dataSourceSetters.setAvailableFields(fieldsWithSynthetic);
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
            
            // Generate and append synthetic fields (MeasureNames/MeasureValues)
            const syntheticFields = generateSyntheticFields(fields);
            const fieldsWithSynthetic = [...fields, ...syntheticFields];
            dataSourceSetters.setAvailableFields(fieldsWithSynthetic);
            dataSourceSetters.setVirtualTable(response.virtual_table);

            // Mark axis fields that are not present in new schema as invalid
            const availableNames = new Set(fields.map(f => f.columnName));
            const patchedX = xAxisFields.map(f => ({ ...f, isInvalid: !availableNames.has(f.columnName) } as any));
            const patchedY = yAxisFields.map(f => ({ ...f, isInvalid: !availableNames.has(f.columnName) } as any));
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
        xAxisFields, 
        yAxisFields, 
        connectionDetails?.type, 
        dataSourceSetters,
        dispatch,
        fetchColumns
    ]);

    // --- Effects to trigger data fetching ---
    useEffect(() => {
        if (!connectionDetails) return;
        
        // Clear existing metadata and fetch new data when connection changes
        // This ensures we get fresh data after reconnecting to a different server
        if (connectionDetails.type === 'clickhouse') {
            // Clear old metadata first
            dataSourceSetters.setDatabases([]);
            dataSourceSetters.setTables([]);
            dataSourceSetters.setAvailableFields([]);
            dataSourceSetters.setSelectedTable('');
            // Clear selected database via dispatch
            dispatch({ type: 'SET_SELECTED_DATABASE', payload: '' });
            // Fetch new databases
            if (!dataSource.isLoadingMetadata) {
                dataSourceSetters.setMetadataError(null);
                fetchDatabases();
            }
        } else if (connectionDetails.type === 'csv') {
            // Clear old metadata first
            dataSourceSetters.setTables([]);
            dataSourceSetters.setAvailableFields([]);
            dataSourceSetters.setSelectedTable('');
            // Fetch new tables
            if (!dataSource.isLoadingMetadata) {
                dataSourceSetters.setMetadataError(null);
                fetchTables('');
            }
        }
        // Columns fetch will trigger once selectedTable is set (CSV auto-selection handled in fetchTables)
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
            console.log('📋 virtualTable updated, dispatching TABLE_JOINS_UNIONS_MODIFIED:', dataSource.virtualTable);
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

