import { useEffect, useMemo } from 'react';
import { useConnection } from '../contexts/ConnectionContext';
import { useVisualizationContext } from '../contexts/VisualizationContext';
import { useSheetContext } from '../contexts/SheetContext';
import { useDataSource } from '../contexts/DataSourceContext';
import { useVirtualColumns } from './useVirtualColumns';
import { useFieldOperations } from './useFieldOperations';
import { useMetadataOperations } from './useMetadataOperations';
import { useFilterMetadata } from './useFilterMetadata';


export function useVisualizationState() {
    const { connectionDetails } = useConnection();
    const { state, dispatch } = useVisualizationContext();
    const { updateActiveSheetState } = useSheetContext();
    const dataSourceContext = useDataSource();
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
    } = dataSourceContext;

    // Memoize data source setters to prevent recreation on every render
    // This prevents downstream hooks from recreating their callbacks unnecessarily
    const dataSourceSetters = useMemo(() => ({
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
    }), [
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
    ]);

    // Initialize sub-hooks
    const virtualColumns = useVirtualColumns({
        availableFields: dataSource.availableFields,
        virtualColumns: state.virtualColumns,
        virtualColumnFieldPreferences: state.virtualColumnFieldPreferences,
        dispatch
    });

    const fieldOperations = useFieldOperations({
        xAxisFields: state.xAxisFields,
        yAxisFields: state.yAxisFields,
        availableFieldsWithVirtual: virtualColumns.availableFieldsWithVirtual,
        availableFields: dataSource.availableFields,
        dispatch,
        dataSourceSetters: {
            setSelectedDatabase,
            setSelectedTable,
            setTables,
            setAvailableFields
        }
    });

    const metadataOps = useMetadataOperations({
        connectionDetails,
        dataSource,
        dataSourceSetters,
        xAxisFields: state.xAxisFields,
        yAxisFields: state.yAxisFields,
        dispatch
    });

    const filterMetadata = useFilterMetadata({
        filterFields: state.filterFields,
        filterMetadata: state.filterMetadata,
        filterConfigurations: state.filterConfigurations,
        virtualColumns: state.virtualColumns,
        virtualTable: dataSource.virtualTable || undefined,
        selectedTable: dataSource.selectedTable,
        selectedDatabase: dataSource.selectedDatabase,
        unionTables: dataSource.unionTables,
        connectionDetails,
        dispatch,
        availableFields: dataSource.availableFields
    });

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
            colorBias: state.colorBias,
            sizeField: state.sizeField,
            sizeRange: state.sizeRange,
            manualSize: state.manualSize,
            tooltipFields: state.tooltipFields,
            fieldOverrides: state.fieldOverrides,
            virtualColumns: state.virtualColumns,
            virtualColumnFieldPreferences: state.virtualColumnFieldPreferences,
        });
    }, [
        state.xAxisFields,
        state.yAxisFields,
        state.filterFields,
        state.filterConfigurations,
        state.appliedFilterConfigurations,
        state.colorField,
        state.colorScheme,
        state.colorBias,
        state.sizeField,
        state.sizeRange,
        state.manualSize,
        state.tooltipFields,
        state.fieldOverrides,
        state.virtualColumns,
        state.virtualColumnFieldPreferences,
        updateActiveSheetState,
    ]);


    // --- Return all state and handlers ---
    return {
        // From contexts
        connectionDetails,
        xAxisFields: state.xAxisFields,
        yAxisFields: state.yAxisFields,
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
        virtualColumns: state.virtualColumns,
        
        // From virtualColumns hook
        availableFields: virtualColumns.availableFieldsWithVirtual,
        handleAddVirtualColumn: virtualColumns.handleAddVirtualColumn,
        handleUpdateVirtualColumn: virtualColumns.handleUpdateVirtualColumn,
        handleRemoveVirtualColumn: virtualColumns.handleRemoveVirtualColumn,
        
        // From fieldOperations hook
        handleFieldUpdate: fieldOperations.handleFieldUpdate,
        handleDatabaseSelect: fieldOperations.handleDatabaseSelect,
        handleTableSelect: fieldOperations.handleTableSelect,
        handleRemoveFromAxis: fieldOperations.handleRemoveFromAxis,
        handleDropFromAvailableFields: fieldOperations.handleDropFromAvailableFields,
        handleReorderFields: fieldOperations.handleReorderFields,
        
        // From metadataOps hook
        fetchSuggestedJoins: metadataOps.fetchSuggestedJoins,
        fetchMergedColumns: metadataOps.fetchMergedColumns,
        
        // From filterMetadata hook
        refetchFilterValues: filterMetadata.refetchFilterValues,
    };
} 