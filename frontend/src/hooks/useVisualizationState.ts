import { useEffect, useMemo, useRef } from 'react';
import { useConnection } from '../contexts/ConnectionContext';
import { useVisualizationContext } from '../contexts/VisualizationContext';
import { useSheetContext } from '../contexts/SheetContext';
import { useDataSource } from '../contexts/DataSourceContext';
import { useVirtualColumns } from './useVirtualColumns';
import { useFieldOperations } from './useFieldOperations';
import { useMetadataOperations } from './useMetadataOperations';
import { useFilterMetadata } from './useFilterMetadata';
import {
    mergeFilterConfigurations,
    mergeFilterFields,
    mergeFilterMetadata,
} from '../utils/effectiveFilters';


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
        setMeasureGroupFields,
        addVirtualColumn,
        updateVirtualColumn,
        removeVirtualColumn,
        setVirtualColumnFieldPreference,
        setSessionFilterMetadata,
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
        setVirtualTable,
        setMeasureGroupFields
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
        measureGroupFields: state.measureGroupFields,
        virtualColumns: dataSource.virtualColumns,
        dispatch
    });

    // Merge sheet + session filter state so useFilterMetadata auto-fetches
    // metadata for session-scoped filters (e.g. restored from snapshots with no metadata).
    const allFilterFields = useMemo(
        () => mergeFilterFields(dataSource.sessionFilterFields, state.filterFields),
        [dataSource.sessionFilterFields, state.filterFields]
    );

    const allFilterMetadata = useMemo(
        () => mergeFilterMetadata(state.filterMetadata, dataSource.sessionFilterMetadata),
        [state.filterMetadata, dataSource.sessionFilterMetadata]
    );

    const allFilterConfigurations = useMemo(
        () => mergeFilterConfigurations(state.filterConfigurations, dataSource.sessionFilterConfigurations),
        [state.filterConfigurations, dataSource.sessionFilterConfigurations]
    );

    const filterMetadata = useFilterMetadata({
        filterFields: allFilterFields,
        filterMetadata: allFilterMetadata,
        filterConfigurations: allFilterConfigurations,
        virtualColumns: dataSource.virtualColumns,
        virtualTable: dataSource.virtualTable || undefined,
        selectedTable: dataSource.selectedTable,
        selectedDatabase: dataSource.selectedDatabase,
        unionTables: dataSource.unionTables,
        connectionDetails,
        dispatch
    });

    // Persist fetched metadata for session filters into DataSourceContext
    // so it survives sheet switches (vis state is reset per sheet).
    useEffect(() => {
        dataSource.sessionFilterFields.forEach(field => {
            const visMeta = state.filterMetadata[field.id];
            const sessionMeta = dataSource.sessionFilterMetadata[field.id];
            if (visMeta && !visMeta.loading && !visMeta.error &&
                (!sessionMeta || sessionMeta.loading)) {
                setSessionFilterMetadata(field.id, visMeta);
            }
        });
    }, [dataSource.sessionFilterFields, dataSource.sessionFilterMetadata, state.filterMetadata, setSessionFilterMetadata]);

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
            disabledFilterIds: state.disabledFilterIds,
            colorField: state.colorField,
            colorScheme: state.colorScheme,
            colorBias: state.colorBias,
            manualColor: state.manualColor,
            sizeField: state.sizeField,
            sizeRange: state.sizeRange,
            manualSize: state.manualSize,
            shapeField: state.shapeField,
            manualShape: state.manualShape,
            bandThicknessScale: state.bandThicknessScale,
            independentDomains: state.independentDomains,
            tooltipFields: state.tooltipFields,
            fieldOverrides: state.fieldOverrides,
            globalChartType: state.globalChartType,
            distributionVariant: state.distributionVariant,
            tableCellMode: state.tableCellMode,
            tablePage: state.tablePage,
            selectedChartType: state.globalChartType ?? 'auto',
            optimizationSettings: state.optimizationSettings,
            measureGroupFields: state.measureGroupFields,
            axisLabelStyles: state.axisLabelStyles,
            facetLabelStyles: state.facetLabelStyles,
            chartCaption: state.chartCaption,
        });
    }, [
        state.xAxisFields,
        state.yAxisFields,
        state.filterFields,
        state.filterConfigurations,
        state.appliedFilterConfigurations,
        state.disabledFilterIds,
        state.colorField,
        state.colorScheme,
        state.colorBias,
        state.manualColor,
        state.sizeField,
        state.sizeRange,
        state.manualSize,
        state.shapeField,
        state.manualShape,
        state.bandThicknessScale,
        state.independentDomains,
        state.tooltipFields,
        state.fieldOverrides,
        state.globalChartType,
        state.distributionVariant,
        state.tableCellMode,
        state.tablePage,
        state.optimizationSettings,
        state.measureGroupFields,
        state.axisLabelStyles,
        state.facetLabelStyles,
        state.chartCaption,
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
        refreshMetadata: metadataOps.refreshMetadata,
        
        // From filterMetadata hook
        refetchFilterValues: filterMetadata.refetchFilterValues,
    };
} 