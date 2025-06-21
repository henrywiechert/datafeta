import { useState, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Field, Database, Table, Column } from '../types';
import { apiService } from '../apiService';
import { useConnection } from '../contexts/ConnectionContext';

export function useVisualizationState() {
    const { connectionDetails } = useConnection();

    // DND state
    const [xAxisField, setXAxisField] = useState<Field | null>(null);
    const [yAxisField, setYAxisField] = useState<Field | null>(null);

    // Metadata state
    const [availableFields, setAvailableFields] = useState<Field[]>([]);
    const [databases, setDatabases] = useState<Database[]>([]);
    const [tables, setTables] = useState<Table[]>([]);
    const [selectedDatabase, setSelectedDatabase] = useState<string>('');
    const [selectedTable, setSelectedTable] = useState<string>('');
    const [isLoadingMetadata, setIsLoadingMetadata] = useState<boolean>(false);
    const [metadataError, setMetadataError] = useState<string | null>(null);

    // --- Event Handlers ---

    const handleDrop = useCallback((axis: 'x' | 'y', item: Field) => {
        const newField = { ...item, id: uuidv4() };
        if (axis === 'x') {
            setXAxisField(newField);
        } else {
            setYAxisField(newField);
        }
    }, []);

    const handleFieldUpdate = useCallback((updatedField: Field) => {
        if (xAxisField?.id === updatedField.id) setXAxisField(updatedField);
        else if (yAxisField?.id === updatedField.id) setYAxisField(updatedField);
        else setAvailableFields(prev => prev.map(f => f.id === updatedField.id ? updatedField : f));
    }, [xAxisField, yAxisField]);

    const handleDatabaseSelect = useCallback((dbName: string) => {
        setSelectedDatabase(dbName);
        setSelectedTable('');
        setTables([]);
        setAvailableFields([]);
    }, []);

    const handleTableSelect = useCallback((tableName: string) => {
        setSelectedTable(tableName);
    }, []);

    // --- Data Fetching Logic ---

    const fetchDatabases = useCallback(async () => {
        setIsLoadingMetadata(true);
        setMetadataError(null);
        try {
            const response = await apiService.listDatabases();
            setDatabases(response.databases || []);
        } catch (err: any) { setMetadataError(err.message); }
        finally { setIsLoadingMetadata(false); }
    }, []);

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
        } catch (err: any) { setMetadataError(err.message); }
        finally { setIsLoadingMetadata(false); }
    }, [connectionDetails?.type]);

    const fetchColumns = useCallback(async () => {
        if (!selectedTable) return;
        if (connectionDetails?.type === 'clickhouse' && !selectedDatabase) return;
        
        setIsLoadingMetadata(true);
        setMetadataError(null);
        try {
            const dbParam = connectionDetails?.type === 'clickhouse' ? selectedDatabase : undefined;
            const response = await apiService.listColumns(selectedTable, dbParam);
            const fields: Field[] = response.columns.map(col => ({
                id: `field-${col.name}`,
                columnName: col.name,
                type: 'dimension',
                flavour: 'discrete',
            }));
            setAvailableFields(fields);
        } catch (err: any) { setMetadataError(err.message); }
        finally { setIsLoadingMetadata(false); }
    }, [selectedTable, selectedDatabase, connectionDetails?.type]);

    // --- Effects to trigger data fetching ---
    useEffect(() => {
        if (connectionDetails) {
            setDatabases([]);
            setTables([]);
            setAvailableFields([]);
            setSelectedDatabase('');
            setSelectedTable('');
            setMetadataError(null);
            if (connectionDetails.type === 'clickhouse') fetchDatabases();
            else if (connectionDetails.type === 'csv') fetchTables('');
        }
    }, [connectionDetails, fetchDatabases, fetchTables]);
    
    useEffect(() => {
        if (selectedTable) fetchColumns();
    }, [selectedTable, fetchColumns]);

    useEffect(() => {
        if(selectedDatabase) fetchTables(selectedDatabase)
    }, [selectedDatabase, fetchTables])

    // --- Return all state and handlers ---
    return {
        connectionDetails,
        xAxisField,
        yAxisField,
        availableFields,
        databases,
        tables,
        selectedDatabase,
        selectedTable,
        isLoadingMetadata,
        metadataError,
        handleDrop,
        handleFieldUpdate,
        handleDatabaseSelect,
        handleTableSelect
    };
} 