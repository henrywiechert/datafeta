import { useEffect, useRef } from 'react';
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
        setVirtualTable,
        addVirtualColumn,
        updateVirtualColumn,
        removeVirtualColumn,
        setVirtualColumnFieldPreference,
    } = dataSourceContext;

    // Data source setters for sub-hooks
    const dataSourceSetters = {
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
    };

    // Initialize sub-hooks
    const virtualColumnHelpers = useVirtualColumns({
        availableFields: dataSource.availableFields,
        virtualColumns: dataSource.virtualColumns,
        virtualColumnFieldPreferences: dataSource.virtualColumnFieldPreferences,
        addVirtualColumn,
        updateVirtualColumn,
        removeVirtualColumn,
    });

    const fieldOperations = useFieldOperations({
        xAxisFields: state.xAxisFields,
        yAxisFields: state.yAxisFields,
        availableFieldsWithVirtual: virtualColumnHelpers.availableFieldsWithVirtual,
        availableFields: dataSource.availableFields,
        dispatch,
        dataSourceSetters: {
            setSelectedDatabase,
            setSelectedTable,
            setTables,
            setAvailableFields
        },
        setVirtualColumnPreference: setVirtualColumnFieldPreference,
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
        virtualColumns: dataSource.virtualColumns,
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
            independentDomains: state.independentDomains,
            tooltipFields: state.tooltipFields,
            fieldOverrides: state.fieldOverrides,
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
        state.independentDomains,
        state.tooltipFields,
        state.fieldOverrides,
        updateActiveSheetState,
    ]);

    const lastVirtualColumnsSignature = useRef<string | null>(null);
    useEffect(() => {
        const signature = JSON.stringify(
            (dataSource.virtualColumns || []).map(vc => `${vc.name}::${vc.expression}::${vc.output_type}`)
        );
        if (lastVirtualColumnsSignature.current === null) {
            lastVirtualColumnsSignature.current = signature;
            return;
        }
        if (lastVirtualColumnsSignature.current !== signature) {
            lastVirtualColumnsSignature.current = signature;
            dispatch({ type: 'FORCE_QUERY_REFRESH' });
        }
    }, [dataSource.virtualColumns, dispatch]);


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
        virtualColumns: dataSource.virtualColumns,
        
        // From virtualColumns hook
        availableFields: virtualColumnHelpers.availableFieldsWithVirtual,
        handleAddVirtualColumn: virtualColumnHelpers.handleAddVirtualColumn,
        handleUpdateVirtualColumn: virtualColumnHelpers.handleUpdateVirtualColumn,
        handleRemoveVirtualColumn: virtualColumnHelpers.handleRemoveVirtualColumn,
        
        // From fieldOperations hook
        handleFieldUpdate: fieldOperations.handleFieldUpdate,
        handleDatabaseSelect: fieldOperations.handleDatabaseSelect,
        handleTableSelect: fieldOperations.handleTableSelect,
        // Note: handleRemoveFromAxis, handleDropFromAvailableFields, handleReorderFields
        // are intentionally NOT exposed here - use useDragDrop instead for undo/redo support
        
        // From metadataOps hook
        fetchSuggestedJoins: metadataOps.fetchSuggestedJoins,
        fetchMergedColumns: metadataOps.fetchMergedColumns,
        
        // From filterMetadata hook
        refetchFilterValues: filterMetadata.refetchFilterValues,
    };
} 