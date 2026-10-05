// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useMemo, useRef } from 'react';
import { useConnection } from '../contexts/ConnectionContext';
import { useVisualizationContext } from '../contexts/VisualizationContext';
import { useSheetContext } from '../contexts/SheetContext';
import { SHEET_SNAPSHOT_KEYS } from '../contexts/VisualizationContext/persistedKeys';
import { buildSheetSnapshot } from '../contexts/VisualizationContext/sheetSnapshot';
import { useDataSource } from '../contexts/DataSourceContext';
import { VisualizationStateSnapshot } from '../types';
import { useVirtualColumns } from './useVirtualColumns';
import { useFieldOperations } from './useFieldOperations';
import { useMetadataOperations } from './useMetadataOperations';
import { useFilterMetadata } from './useFilterMetadata';
import { useFilterConfigWriter } from './useFilterConfigWriter';
import { useFilterStoreDispatch } from './useFilterStoreDispatch';
import { useRelevantValueLists } from './useRelevantValueLists';
import {
    mergeFilterConfigurations,
    mergeFilterFields,
    mergeFilterMetadata,
} from '../utils/effectiveFilters';


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
        setUnionTables,
        addVirtualColumn,
        updateVirtualColumn,
        removeVirtualColumn,
        setVirtualColumnFieldPreference,
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

    // Metadata and config fetched for a session (global) filter has to land in the
    // session store — the merge gives it precedence, so a write into the sheet
    // reducer would never reach the panel.
    const filterStoreDispatch = useFilterStoreDispatch();

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
        dispatch: filterStoreDispatch
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

    // Sync visualization state changes back to the active sheet.
    // Debounced so a burst of reducer ticks (typing in a filter, dragging
    // a chip) becomes a single SheetContext update — otherwise every tick
    // rebuilds state.sheets and re-renders every useSheetContext consumer.
    // Flushed on unmount so a sheet switch never loses pending edits.
    const isTestEnv = process.env.NODE_ENV === 'test';
    const pendingSnapshotRef = useRef<Partial<VisualizationStateSnapshot> | null>(null);
    const sheetSnapshotDeps = [
        ...SHEET_SNAPSHOT_KEYS.map((key) => state[key]),
        sessionFilterIds,
        updateActiveSheetState,
        isTestEnv,
    ];
    useEffect(() => {
        const snapshot = buildSheetSnapshot(state, sessionFilterIds);
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
    // REASON: deps are derived from SHEET_SNAPSHOT_KEYS so every persisted key
    // triggers a sync without listing it here; `state` itself changes on every
    // reducer tick and is read only through those keys.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, sheetSnapshotDeps);

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