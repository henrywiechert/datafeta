// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useMemo, useRef } from 'react';
import { useConnection } from '../contexts/ConnectionContext';
import { useVisualizationContext } from '../contexts/VisualizationContext';
import { useSheetContext } from '../contexts/SheetContext';
import { useDataSource } from '../contexts/DataSourceContext';
import { FilterConfig, VisualizationStateSnapshot } from '../types';
import { useVirtualColumns } from './useVirtualColumns';
import { useFieldOperations } from './useFieldOperations';
import { useMetadataOperations } from './useMetadataOperations';
import { useFilterMetadata } from './useFilterMetadata';
import { useFilterConfigWriter } from './useFilterConfigWriter';
import { useRelevantValueLists } from './useRelevantValueLists';
import {
    mergeFilterConfigurations,
    mergeFilterFields,
    mergeFilterMetadata,
} from '../utils/effectiveFilters';
import { getSessionFilterIds } from '../utils/scopedFilters';


export function useVisualizationState() {
    const { connectionDetails, updateConnectionDatabase } = useConnection();
    const { state, dispatch } = useVisualizationContext();
    const { updateActiveSheetState, state: sheetState } = useSheetContext();
    const dataSourceContext = useDataSource();
    const { 
        dataSource, 
        setSelectedDatabase, 
        setSelectedTable, 
        setAvailableFields,
        setDatabases,
        setTables,
        setTablesForDatabase,
        setIsLoadingMetadata,
        setMetadataError,
        setSuggestedJoinableTables,
        setSuggestedUnionableTables,
        setVirtualTable,
        setMeasureGroupFields,
        setUnionTables,
        addVirtualColumn,
        updateVirtualColumn,
        removeVirtualColumn,
        setVirtualColumnFieldPreference,
        setSessionFilterMetadata,
    } = dataSourceContext;
    const writeFilterConfig = useFilterConfigWriter();

    // Data source setters for sub-hooks
    const dataSourceSetters = {
        setSelectedDatabase,
        setSelectedTable,
        setAvailableFields,
        setDatabases,
        setTables,
        setTablesForDatabase,
        setUnionTables,
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
        dispatch,
        sheets: sheetState.sheets,
        sessionFilterFields: dataSource.sessionFilterFields,
        onUpdateConnectionDatabase: updateConnectionDatabase,
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

    const sessionFilterIds = useMemo(
        () => new Set(dataSource.sessionFilterFields.map((f) => f.id)),
        [dataSource.sessionFilterFields],
    );

    const relevantValueLists = useRelevantValueLists({
        filterFields: allFilterFields,
        sheetConfigurations: state.filterConfigurations,
        sessionConfigurations: dataSource.sessionFilterConfigurations,
        disabledFilterIds: state.disabledFilterIds,
        sessionFilterIds,
        // The All/Relevant toggle is picker view state, not a filter edit — no undo entry.
        updateFilterConfig: writeFilterConfig,
        refetchFilterValues: filterMetadata.refetchFilterValues,
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

    // Sync visualization state changes back to the active sheet.
    // Debounced so a burst of reducer ticks (typing in a filter, dragging
    // a chip) becomes a single SheetContext update — otherwise every tick
    // rebuilds state.sheets and re-renders every useSheetContext consumer.
    // Flushed on unmount so a sheet switch never loses pending edits.
    const isTestEnv = process.env.NODE_ENV === 'test';
    const pendingSnapshotRef = useRef<Partial<VisualizationStateSnapshot> | null>(null);
    useEffect(() => {
        // Never persist session-scoped (global) filters into a sheet's stored
        // local state. A filter that was just promoted to global has already
        // been removed from the sheet stores; persisting a snapshot that still
        // contains it (e.g. a pre-promotion render flushed on cleanup) would
        // resurrect it as a sheet-level filter, leaving it live in both scopes.
        const sessionIds = getSessionFilterIds(dataSource.sessionFilterFields);
        const sheetFilterFields = state.filterFields.filter(f => !sessionIds.has(f.id));
        const stripSession = (configs: Record<string, FilterConfig>) => {
            if (sessionIds.size === 0) return configs;
            const next: Record<string, FilterConfig> = {};
            for (const [id, config] of Object.entries(configs)) {
                if (!sessionIds.has(id)) next[id] = config;
            }
            return next;
        };
        const snapshot: Partial<VisualizationStateSnapshot> = {
            xAxisFields: state.xAxisFields,
            yAxisFields: state.yAxisFields,
            filterFields: sheetFilterFields,
            filterConfigurations: stripSession(state.filterConfigurations),
            appliedFilterConfigurations: stripSession(state.appliedFilterConfigurations),
            disabledFilterIds: state.disabledFilterIds,
            colorField: state.colorField,
            colorScheme: state.colorScheme,
            colorBias: state.colorBias,
            colorReversed: state.colorReversed,
            manualColor: state.manualColor,
            sizeField: state.sizeField,
            sizeRange: state.sizeRange,
            manualSize: state.manualSize,
            labelFields: state.labelFields,
            labelsEnabled: state.labelsEnabled,
            labelSamplingStrategy: state.labelSamplingStrategy,
            labelSamplingThreshold: state.labelSamplingThreshold,
            labelSampleEvery: state.labelSampleEvery,
            shapeField: state.shapeField,
            manualShape: state.manualShape,
            bandThicknessScale: state.bandThicknessScale,
            independentDomains: state.independentDomains,
            tooltipFields: state.tooltipFields,
            labelFontSize: state.labelFontSize,
            fieldOverrides: state.fieldOverrides,
            globalChartType: state.globalChartType,
            chartTypeParams: state.chartTypeParams,
            selectedChartType: state.globalChartType ?? 'auto',
            optimizationSettings: state.optimizationSettings,
            measureGroupFields: state.measureGroupFields,
            axisLabelStyles: state.axisLabelStyles,
            facetLabelStyles: state.facetLabelStyles,
            chartCaption: state.chartCaption,
            showChartCaption: state.showChartCaption,
        };
        pendingSnapshotRef.current = snapshot;
        if (isTestEnv) {
            updateActiveSheetState(snapshot);
            pendingSnapshotRef.current = null;
            return;
        }
        const timer = window.setTimeout(() => {
            if (pendingSnapshotRef.current) {
                updateActiveSheetState(pendingSnapshotRef.current);
                pendingSnapshotRef.current = null;
            }
        }, 300);
        return () => {
            window.clearTimeout(timer);
            if (pendingSnapshotRef.current) {
                updateActiveSheetState(pendingSnapshotRef.current);
                pendingSnapshotRef.current = null;
            }
        };
    }, [
        state.xAxisFields,
        state.yAxisFields,
        state.filterFields,
        state.filterConfigurations,
        state.appliedFilterConfigurations,
        state.disabledFilterIds,
        dataSource.sessionFilterFields,
        state.colorField,
        state.colorScheme,
        state.colorBias,
        state.colorReversed,
        state.manualColor,
        state.sizeField,
        state.sizeRange,
        state.manualSize,
        state.labelFields,
        state.labelsEnabled,
        state.labelSamplingStrategy,
        state.labelSamplingThreshold,
        state.labelSampleEvery,
        state.shapeField,
        state.manualShape,
        state.bandThicknessScale,
        state.independentDomains,
        state.tooltipFields,
        state.labelFontSize,
        state.fieldOverrides,
        state.globalChartType,
        state.chartTypeParams,
        state.optimizationSettings,
        state.measureGroupFields,
        state.axisLabelStyles,
        state.facetLabelStyles,
        state.chartCaption,
        state.showChartCaption,
        updateActiveSheetState,
        isTestEnv,
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
        switchDatabasePreserveTables: metadataOps.switchDatabasePreserveTables,
        unionTables: dataSource.unionTables,
        
        // From filterMetadata / relevant value-list hooks
        refetchFilterValues: relevantValueLists.refetchWithValueListContext,
        setValueListMode: relevantValueLists.setValueListMode,
    };
} 