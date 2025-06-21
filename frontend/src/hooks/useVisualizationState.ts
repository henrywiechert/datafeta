import { useState, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Field, Database, Table, Column } from '../types';
import { apiService } from '../apiService';
import { useConnection } from '../contexts/ConnectionContext';
import { FieldDragItem } from '../components/Visualization/FieldChip';

export function useVisualizationState() {
    const { connectionDetails } = useConnection();

    // DND state
    const [xAxisFields, setXAxisFields] = useState<Field[]>([]);
    const [yAxisFields, setYAxisFields] = useState<Field[]>([]);

    // Metadata state
    const [availableFields, setAvailableFields] = useState<Field[]>([]);
    const [databases, setDatabases] = useState<Database[]>([]);
    const [tables, setTables] = useState<Table[]>([]);
    const [selectedDatabase, setSelectedDatabase] = useState<string>('');
    const [selectedTable, setSelectedTable] = useState<string>('');
    const [isLoadingMetadata, setIsLoadingMetadata] = useState<boolean>(false);
    const [metadataError, setMetadataError] = useState<string | null>(null);

    // --- Event Handlers ---

    const handleRemoveFromAxis = useCallback((item: FieldDragItem) => {
        if (item.source === 'X_AXIS') {
            setXAxisFields(prev => prev.filter(f => f.id !== item.field.id));
        } else if (item.source === 'Y_AXIS') {
            setYAxisFields(prev => prev.filter(f => f.id !== item.field.id));
        }
    }, []);

    const handleDrop = useCallback((targetAxis: 'x' | 'y', item: FieldDragItem) => {
        const { field, source } = item;

        // Rule: If dropping on the same axis it came from, do nothing.
        if ((targetAxis === 'x' && source === 'X_AXIS') || (targetAxis === 'y' && source === 'Y_AXIS')) {
            return;
        }

        // Action: Remove field from its original axis if it was moved from another axis
        handleRemoveFromAxis(item);
        
        // Action: Add the field to the target axis
        const fieldToAdd = source === 'AVAILABLE_FIELDS' ? { ...field, id: uuidv4() } : field;
        if (targetAxis === 'x') {
            setXAxisFields(prev => [...prev, fieldToAdd]);
        } else {
            setYAxisFields(prev => [...prev, fieldToAdd]);
        }
    }, [handleRemoveFromAxis]);

    const handleFieldUpdate = useCallback((updatedField: Field) => {
        // Check if the field is on the X axis
        setXAxisFields(prevFields => 
            prevFields.map(f => f.id === updatedField.id ? updatedField : f)
        );
        // Check if the field is on the Y axis
        setYAxisFields(prevFields =>
            prevFields.map(f => f.id === updatedField.id ? updatedField : f)
        );
        // Check if the field is in the available list
        setAvailableFields(prevFields =>
            prevFields.map(f => f.id === updatedField.id ? updatedField : f)
        );
    }, []);

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
        xAxisFields,
        yAxisFields,
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
        handleTableSelect,
        handleRemoveFromAxis
    };
} 