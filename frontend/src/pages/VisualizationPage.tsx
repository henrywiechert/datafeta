// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { useRef, useCallback } from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import { Navigate } from 'react-router-dom';
import { Panel, Group as PanelGroup } from "react-resizable-panels";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { useVisualizationState } from '../hooks/useVisualizationState';
import { useVisualizationContext, VisualizationProvider } from '../contexts/VisualizationContext';
import { UndoRedoProvider } from '../contexts/UndoRedoContext';
import { useSheetContext } from '../contexts/SheetContext';
import { useDragDrop } from '../hooks/useDragDrop';
import { useConnection } from '../contexts/ConnectionContext';
import { useDataSource } from '../contexts/DataSourceContext';
import { useUndoRedo } from '../hooks/useUndoRedo';
import { useFilterController } from '../hooks/useFilterController';
import FieldsPanel from '../components/Visualization/FieldsPanel';
import ChartPanel from '../components/Visualization/ChartPanel';
import FilterPanel from '../components/Visualization/Filters/FilterPanel';
import FieldOverridesPanel from '../components/Visualization/Overrides/FieldOverridesPanel';
import OverlaysSection from '../components/Visualization/Overrides/OverlaysSection';
import MeasureGroupsPanel from '../components/Visualization/MeasureGroups';
import LoadingModal from '../components/LoadingModal';
import CollapseRail from '../components/Layout/CollapseRail';
import SplitHandle from '../components/Layout/SplitHandle';
import { usePanelSplit } from '../components/Layout/usePanelSplit';
import {
    CHART_PANEL_MIN_PX,
    DEFAULT_LEFT_PANEL_PERCENT,
    DEFAULT_MIDDLE_PANEL_PERCENT,
    SHELL_PANELS,
} from '../components/Layout/shellLayout';
import {
    COLLAPSE_RAIL_THICKNESS_PX,
    PANEL_HEADER_SURFACE,
    PANEL_RADIUS_PX,
    SHELL_GUTTER_PX,
} from '../components/Layout/layoutTokens';
import { T } from '../theme/tokens';
import AppInfoDisplay from '../components/AppInfoDisplay';
import DataSlicerIcon from '../components/icons/DataSlicerIcon';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import SchemaCheckDialog from '../components/SchemaCheckDialog';
import { schemaCheckBus } from '../services/schemaCheckBus';
import { hasCrossDatabaseUnion, isSchemaCheckReady, SchemaCheckResult, validateSheetSchema } from '../utils/schemaValidation';
import { DatabaseSwitchError } from '../services/switchDatabasePreserveTables';
import { apiService } from '../apiService';

import { Field, DragSource } from '../types';
import type { SheetPanelLayout } from '../types/sheet';

// Inner component that uses both sheet and visualization contexts
const VisualizationPageContent = () => {
    const [fieldsSearch, setFieldsSearch] = React.useState('');
    
    // Per-sheet panel layout. This component is remounted on every sheet switch
    // (VisualizationProvider is keyed by sheet id), so the initial reads below
    // reflect the sheet we're switching INTO. Captured once via the useState
    // initializer so later re-renders don't fight react-resizable-panels.
    //
    // Collapse state is kept in local state as well as persisted, so toggling a
    // panel doesn't re-render ChartArea and its 160+ facet children through a
    // context update.
    const { activeSheet, updateActiveSheetPanelLayout } = useSheetContext();
    const savedPanelLayout = activeSheet?.panelLayout;
    const [initialLeftSize] = React.useState(() => savedPanelLayout?.leftPanelSize ?? DEFAULT_LEFT_PANEL_PERCENT);
    const [initialMiddleSize] = React.useState(() => savedPanelLayout?.middlePanelSize ?? DEFAULT_MIDDLE_PANEL_PERCENT);
    const [initialLeftCollapsed] = React.useState(() => savedPanelLayout?.leftPanelCollapsed ?? false);
    const [initialMiddleCollapsed] = React.useState(() => savedPanelLayout?.middlePanelCollapsed ?? false);
    const [leftPanelCollapsed, setLeftPanelCollapsed] = React.useState(initialLeftCollapsed);
    const [middlePanelCollapsed, setMiddlePanelCollapsed] = React.useState(initialMiddleCollapsed);
    // A panel that starts collapsed asks for 0%, which the library snaps to the
    // panel's `collapsedSize` (the rail width). That keeps the declared sizes
    // summing to 100 regardless of collapse state.
    const initialChartSize = Math.max(
        0,
        100
        - (initialLeftCollapsed ? 0 : initialLeftSize)
        - (initialMiddleCollapsed ? 0 : initialMiddleSize),
    );

    // Persist sizes and collapse state per-sheet, guarded against redundant
    // dispatches. A collapsed panel keeps its last expanded size on record so
    // expanding restores it (and so the ref can drive the expand itself).
    const lastLeftSizeRef = React.useRef<number>(savedPanelLayout?.leftPanelSize ?? DEFAULT_LEFT_PANEL_PERCENT);
    const lastMiddleSizeRef = React.useRef<number>(savedPanelLayout?.middlePanelSize ?? DEFAULT_MIDDLE_PANEL_PERCENT);
    const lastLeftCollapsedRef = React.useRef<boolean>(initialLeftCollapsed);
    const lastMiddleCollapsedRef = React.useRef<boolean>(initialMiddleCollapsed);
    const persistLeftPanelLayout = React.useCallback((collapsed: boolean, sizePercent: number) => {
        const rounded = Math.round(sizePercent);
        const layout: Partial<SheetPanelLayout> = {};
        if (collapsed !== lastLeftCollapsedRef.current) {
            lastLeftCollapsedRef.current = collapsed;
            layout.leftPanelCollapsed = collapsed;
        }
        if (!collapsed && rounded > 0 && rounded !== lastLeftSizeRef.current) {
            lastLeftSizeRef.current = rounded;
            layout.leftPanelSize = rounded;
        }
        if (Object.keys(layout).length > 0) {
            updateActiveSheetPanelLayout(layout);
        }
    }, [updateActiveSheetPanelLayout]);
    const persistMiddlePanelLayout = React.useCallback((collapsed: boolean, sizePercent: number) => {
        const rounded = Math.round(sizePercent);
        const layout: Partial<SheetPanelLayout> = {};
        if (collapsed !== lastMiddleCollapsedRef.current) {
            lastMiddleCollapsedRef.current = collapsed;
            layout.middlePanelCollapsed = collapsed;
        }
        if (!collapsed && rounded > 0 && rounded !== lastMiddleSizeRef.current) {
            lastMiddleSizeRef.current = rounded;
            layout.middlePanelSize = rounded;
        }
        if (Object.keys(layout).length > 0) {
            updateActiveSheetPanelLayout(layout);
        }
    }, [updateActiveSheetPanelLayout]);

    const {
        xAxisFields,
        yAxisFields,
        availableFields: dataSourceAvailableFields,
        databases,
        tables,
        selectedDatabase,
        selectedTable,
        isLoadingMetadata,
        metadataError,
        handleFieldUpdate,
        handleDatabaseSelect,
        handleTableSelect,
        refreshMetadata,
        refetchFilterValues,
        setValueListMode,
        switchDatabasePreserveTables,
        unionTables,
        virtualColumns,
        handleAddVirtualColumn,
        handleUpdateVirtualColumn,
        handleRemoveVirtualColumn
    } = useVisualizationState();

    // FieldsPanel is memoized and intentionally ignores callback prop changes.
    // Keep a stable refresh handler that always points to the latest implementation.
    const refreshMetadataRef = React.useRef(refreshMetadata);
    React.useEffect(() => {
        refreshMetadataRef.current = refreshMetadata;
    }, [refreshMetadata]);
    const handleRefreshMetadata = React.useCallback(() => {
        return refreshMetadataRef.current();
    }, []);

    // Add more files to the existing CSV/Parquet connection, then refresh table list.
    const handleAddFiles = React.useCallback(async (files: File[]) => {
        await apiService.addFiles(files);
        await refreshMetadataRef.current();
    }, []);

    // Access the enhanced context with loading states and cancellation
    const { state, dispatch, cancelOperation, getUndoableSnapshot } = useVisualizationContext();
    const { undo, completeUndo, redo, completeRedo } = useUndoRedo();
    const axisDropFieldIdsRef = React.useRef<string[] | null>(null);
    
    const { 
        showLoadingModal, 
        loadingOperationType, 
        loadingStartTime, 
        canCancelOperation,
    } = state;

    // Panel refs for imperative control
    const leftPanelRef = useRef<PanelImperativeHandle>(null);
    const middlePanelRef = useRef<PanelImperativeHandle>(null);

    // Split gesture adapters. One constraint declaration (SHELL_PANELS) drives
    // both these clamps and the Panel props below.
    const leftSplit = usePanelSplit(leftPanelRef, SHELL_PANELS.left);
    const middleSplit = usePanelSplit(middlePanelRef, SHELL_PANELS.middle);

    // Panel toggle handlers. Expanding resizes to the last expanded size rather
    // than calling `expand()`, so a panel that was already collapsed at mount
    // (restored from the sheet) still has somewhere to go. `collapse()` snaps to
    // the panel's collapsedSize, which is the rail width.
    const toggleLeftPanel = useCallback(() => {
        const panel = leftPanelRef.current;
        if (!panel) return;
        if (panel.isCollapsed()) {
            panel.resize(`${lastLeftSizeRef.current}%`);
        } else {
            panel.collapse();
        }
    }, []);

    const toggleMiddlePanel = useCallback(() => {
        const panel = middlePanelRef.current;
        if (!panel) return;
        if (panel.isCollapsed()) {
            panel.resize(`${lastMiddleSizeRef.current}%`);
        } else {
            panel.collapse();
        }
    }, []);

    // Use our custom drag-and-drop hook with virtual columns included
    const dragDropHandlers = useDragDrop(dataSourceAvailableFields, axisDropFieldIdsRef);
    const { 
        handleAxisDrop,
        handleRemoveFromAxis,
        handleRemoveMultipleFromAxis,
        handleReorderFields,
        handleMoveFieldBetweenAxes,
        handleFilterDrop,
        handleRemoveFromColor,
        handleRemoveFromSize,
        handleRemoveFromLabel,
        handleRemoveFromTooltip,
        handleRemoveFromBackground,
        handleTableColumnsDrop,
        handleRemoveFromTableColumns,
        handleReorderTableColumns,
    } = dragDropHandlers;    // Undo/Redo handlers
    const handleUndo = React.useCallback(() => {
        const previousState = undo();
        if (previousState) {
            // Save current state before undoing
            const currentState = getUndoableSnapshot();
            
            // Restore previous state
            dispatch({
                type: 'RESTORE_UNDOABLE_STATE',
                payload: {
                    ...previousState,
                    fieldOverrides: previousState.fieldOverrides || {},
                    bandThicknessScale: previousState.bandThicknessScale ?? state.bandThicknessScale,
                }
            });
            
            // Complete the undo operation
            completeUndo(currentState);
        }
    }, [undo, completeUndo, dispatch, getUndoableSnapshot, state.bandThicknessScale]);

    const handleRedo = React.useCallback(() => {
        const nextState = redo();
        if (nextState) {
            // Save current state before redoing
            const currentState = getUndoableSnapshot();
            
            // Restore next state
            dispatch({
                type: 'RESTORE_UNDOABLE_STATE',
                payload: {
                    ...nextState,
                    fieldOverrides: nextState.fieldOverrides || {},
                    bandThicknessScale: nextState.bandThicknessScale ?? state.bandThicknessScale,
                }
            });
            
            // Complete the redo operation
            completeRedo(currentState);
        }
    }, [redo, completeRedo, dispatch, getUndoableSnapshot, state.bandThicknessScale]);

    // Simplified axis-specific handlers that use the generic handler
    const handleXAxisDrop = (field: Field | Field[], source: DragSource, index?: number) => {
        handleAxisDrop('x', field, source, index);
    };

    const handleYAxisDrop = (field: Field | Field[], source: DragSource, index?: number) => {
        handleAxisDrop('y', field, source, index);
    };

    // Handle cancellation of long-running operations
    const handleCancelOperation = React.useCallback(() => {
        // Cancel API requests
        apiService.cancelAllRequests();
        
        // Update context state
        cancelOperation();
    }, [cancelOperation]);

    const { connectionDetails } = useConnection();
    const dataSourceContext = useDataSource();
    const { 
        suggestedJoinableTables, 
        joinedTables,
        tablesCache,
        loadedPartitions,
        isLoadingPartition,
        sessionFilterFields,
    } = dataSourceContext.dataSource;

    const filterController = useFilterController();

    const {
        toggleJoinedTable: toggleJoinedTableBase,
        addUnionTable: addUnionTableBase,
        removeUnionTable: removeUnionTableBase,
        setTablesForDatabase,
        setMetadataError
    } = dataSourceContext;
    // Wrap joined table toggle
    // Note: fetchMergedColumns will trigger automatically via useEffect in useMetadataOperations
    // and will dispatch TABLE_JOINS_UNIONS_MODIFIED when complete
    const toggleJoinedTable = React.useCallback((tableName: string) => {
        toggleJoinedTableBase(tableName);
    }, [toggleJoinedTableBase]);
    
    // Wrap union table operations
    // Note: fetchMergedColumns will trigger automatically via useEffect in useMetadataOperations
    // and will dispatch TABLE_JOINS_UNIONS_MODIFIED when complete
    const addUnionTable = React.useCallback((database: string, tableName: string) => {
        addUnionTableBase(database, tableName);
    }, [addUnionTableBase]);

    // Handle Hive Parquet partition loading
    const handleLoadPartition = React.useCallback(async (partitionName: string, setAsPrimary: boolean = true) => {
        await dataSourceContext.loadHivePartition(partitionName, setAsPrimary);
    }, [dataSourceContext]);
    
    const removeUnionTable = React.useCallback((database: string, tableName: string) => {
        removeUnionTableBase(database, tableName);
    }, [removeUnionTableBase]);

    const { state: sheetState } = useSheetContext();
    const [dbSwitchEnabled, setDbSwitchEnabled] = React.useState(false);
    const [schemaCheckResult, setSchemaCheckResult] = React.useState<SchemaCheckResult | null>(null);
    const [schemaCheckOpen, setSchemaCheckOpen] = React.useState(false);
    const [isSwitchingDatabase, setIsSwitchingDatabase] = React.useState(false);

    const showSchemaCheck = React.useCallback((result: SchemaCheckResult) => {
        if (result.allClear) return;
        setSchemaCheckResult(result);
        setSchemaCheckOpen(true);
    }, []);

    const dbSwitchDisabled = hasCrossDatabaseUnion(selectedDatabase, unionTables);
    const dbSwitchDisabledReason = dbSwitchDisabled
        ? 'Not supported for cross-database unions'
        : undefined;

    React.useEffect(() => {
        if (dbSwitchDisabled && dbSwitchEnabled) {
            setDbSwitchEnabled(false);
        }
    }, [dbSwitchDisabled, dbSwitchEnabled]);

    const handleDatabaseSwitch = React.useCallback(async (newDatabase: string) => {
        setIsSwitchingDatabase(true);
        try {
            const result = await switchDatabasePreserveTables(newDatabase);
            showSchemaCheck(result);
        } catch (err) {
            if (err instanceof DatabaseSwitchError) {
                setMetadataError(err.message);
            } else {
                const message = err instanceof Error ? err.message : 'Database switch failed';
                setMetadataError(message);
            }
        } finally {
            setIsSwitchingDatabase(false);
        }
    }, [switchDatabasePreserveTables, showSchemaCheck, setMetadataError]);

    const pendingLoadSchemaCheckRef = React.useRef<boolean | null>(null);
    if (pendingLoadSchemaCheckRef.current === null) {
        pendingLoadSchemaCheckRef.current = schemaCheckBus.consumePendingAfterLoad();
    }

    // Schema check after config load with swap-same-schema option.
    // Readiness is gated on the RAW dataSource fields, not dataSourceAvailableFields:
    // the latter also contains virtual columns, which a snapshot restores in the same
    // batch as the table — enough to pass a length check while every real column is
    // still in flight.
    const realAvailableFields = dataSourceContext.dataSource.availableFields;
    const virtualTable = dataSourceContext.dataSource.virtualTable;
    React.useEffect(() => {
        if (!pendingLoadSchemaCheckRef.current) return;
        if (!isSchemaCheckReady({
            selectedTable,
            realFieldCount: realAvailableFields.length,
            isLoadingMetadata,
            hasJoinsOrUnions: joinedTables.length > 0 || unionTables.length > 0,
            hasVirtualTable: !!virtualTable,
        })) return;

        pendingLoadSchemaCheckRef.current = false;

        (async () => {
            let tableNames: string[] = tables.map((t) => t.name);
            if (connectionDetails?.type === 'clickhouse' && selectedDatabase && tableNames.length === 0) {
                try {
                    const response = await apiService.listTables(selectedDatabase);
                    tableNames = (response.tables || []).map((t) => t.name);
                } catch {
                    tableNames = [];
                }
            }

            const result = validateSheetSchema(
                sheetState.sheets,
                dataSourceAvailableFields,
                joinedTables,
                tableNames,
                sessionFilterFields,
                virtualColumns,
            );
            showSchemaCheck(result);
        })();
    }, [
        selectedTable,
        selectedDatabase,
        dataSourceAvailableFields,
        realAvailableFields,
        isLoadingMetadata,
        virtualTable,
        unionTables,
        tables,
        connectionDetails?.type,
        sheetState.sheets,
        joinedTables,
        sessionFilterFields,
        virtualColumns,
        showSchemaCheck,
    ]);

    const handleRemoveFromMeasureGroup = React.useCallback((fieldIds: string[]) => {
        if (fieldIds.length === 0) return;
        // Reducer bumps queryVersion when members actually change
        dispatch({ type: 'REMOVE_MEASURE_GROUP_MEMBERS', payload: fieldIds });
    }, [dispatch]);
    
    // Handler to load tables for a specific database (for cross-database union)
    const handleLoadTablesForDatabase = React.useCallback(async (database: string) => {
        if (!database) return;
        // Skip only if we already have a non-empty table list cached.
        // Note: `[]` is truthy, so a plain truthiness check incorrectly prevents loading.
        const cached = tablesCache[database];
        if (Array.isArray(cached) && cached.length > 0) return;
        
        try {
            if (process.env.NODE_ENV !== 'production') {
                console.debug('[UNION] load tables for database', { database, cached });
            }
            setMetadataError(null);
            const response = await apiService.listTables(database);
            if (process.env.NODE_ENV !== 'production') {
                console.debug('[UNION] loaded tables', { database, count: response.tables?.length ?? 0 });
            }
            setTablesForDatabase(database, response.tables || []);
        } catch (err) {
            console.error(`Failed to load tables for database ${database}:`, err);
            // Mark as "loaded" (empty) so UI doesn't get stuck on "Loading…"
            setTablesForDatabase(database, []);
            const message =
                err instanceof Error
                    ? err.message
                    : `Failed to load tables for database ${database}`;
            setMetadataError(message);
        }
    }, [tablesCache, setTablesForDatabase, setMetadataError]);

    // Keyboard shortcuts for undo/redo and panel toggles
    React.useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            // Check for Ctrl (Windows/Linux) or Cmd (Mac)
            const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
            const modifierKey = isMac ? event.metaKey : event.ctrlKey;
            
            if (modifierKey && event.key === 'z' && !event.shiftKey) {
                // Undo: Ctrl+Z or Cmd+Z
                event.preventDefault();
                handleUndo();
            } else if (modifierKey && event.key === 'z' && event.shiftKey) {
                // Redo: Ctrl+Shift+Z or Cmd+Shift+Z
                event.preventDefault();
                handleRedo();
            } else if (modifierKey && event.key === 'b') {
                // Toggle left panel: Ctrl+B or Cmd+B
                event.preventDefault();
                toggleLeftPanel();
            } else if (modifierKey && event.key === 'j') {
                // Toggle middle panel: Ctrl+J or Cmd+J
                event.preventDefault();
                toggleMiddlePanel();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [handleUndo, handleRedo, toggleLeftPanel, toggleMiddlePanel]);

    // Route guard in App.tsx redirects when disconnected; keep a safety net here.
    if (!connectionDetails) {
        return <Navigate to="/" replace />;
    }

    return (
        <Box sx={{ 
            height: '100%', 
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden' 
        }}>
                {/*
                  Main layout. The group sits on the shell canvas with a gutter
                  all round, so each panel below reads as a card floating on it:
                  the gaps between cards are the SplitHandles, and this padding
                  is the matching gap at the window edge.
                */}
                <Box sx={{
                    flex: 1,
                    overflow: 'hidden',
                    minHeight: 0,
                    backgroundColor: T.surfaceShell,
                    p: `${SHELL_GUTTER_PX}px`,
                }}>
                    <PanelGroup orientation="horizontal">
                    {/* Left Panel - Fields with metadata selector */}
                    <Panel
                        panelRef={leftPanelRef}
                        defaultSize={initialLeftCollapsed ? '0%' : `${initialLeftSize}%`}
                        minSize={`${SHELL_PANELS.left.minPx}px`}
                        maxSize={`${SHELL_PANELS.left.maxPercent}%`}
                        collapsible
                        collapsedSize={`${COLLAPSE_RAIL_THICKNESS_PX}px`}
                        // The panel element is not a scroll container: its
                        // content decides what scrolls. Without this the
                        // library's default overflow:auto adds a second
                        // scrollbar outside the one the content already has.
                        style={{ overflow: 'hidden' }}
                        onResize={(size) => {
                            const collapsed = size.inPixels <= COLLAPSE_RAIL_THICKNESS_PX + 1;
                            setLeftPanelCollapsed(collapsed);
                            persistLeftPanelLayout(collapsed, size.asPercentage);
                        }}
                    >
                        {leftPanelCollapsed ? (
                            <CollapseRail label="Fields" onExpand={toggleLeftPanel} side="left" />
                        ) : (
                            /*
                              A well rather than a card, like the Properties
                              column below: it holds two cards — the brand
                              header and the Fields panel — so the canvas shows
                              between them and neither card nests inside the
                              other. No padding, unlike Properties, so the
                              Fields card keeps its edge-to-edge position in the
                              column and the vertical gap is the only new space.
                            */
                            <Box sx={{
                                height: '100%',
                                display: 'flex',
                                flexDirection: 'column',
                                minHeight: 0,
                                gap: `${SHELL_GUTTER_PX}px`,
                            }}>
                                {/*
                                  The brand card. No bottom divider: the canvas
                                  gap below is the boundary now, the same reason
                                  SplitHandle's `gap` variant draws no line.
                                */}
                                <Box
                                    sx={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        px: 1.5,
                                        py: 0.5,
                                        backgroundColor: PANEL_HEADER_SURFACE,
                                        borderRadius: `${PANEL_RADIUS_PX}px`,
                                        overflow: 'hidden',
                                        flexShrink: 0,
                                    }}
                                >
                                    <Box
                                        component="a"
                                        href="/"
                                        onClick={(e: React.MouseEvent) => { e.preventDefault(); window.location.href = '/'; }}
                                        sx={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 0.75,
                                            fontSize: '0.9rem',
                                            fontWeight: 700,
                                            letterSpacing: '0.02em',
                                            color: 'text.primary',
                                            textDecoration: 'none',
                                            cursor: 'pointer',
                                            '&:hover': { opacity: 0.8 },
                                        }}
                                        title="Back to Data Source Selection"
                                    >
                                        <DataSlicerIcon sx={{ fontSize: '1.6rem' }} />
                                        DataSlicer
                                    </Box>
                                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                        <Tooltip title="Open User Manual">
                                            <IconButton
                                                size="small"
                                                onClick={() => window.open('/help/', '_blank', 'noopener,noreferrer')}
                                                sx={{ color: 'text.secondary' }}
                                            >
                                                <HelpOutlineIcon fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                        <AppInfoDisplay />
                                    </Box>
                                </Box>
                                {/* The Fields card. `overflow: hidden` clips the
                                    panel's own Data Source header to the radius. */}
                                <Box sx={{
                                    flex: 1,
                                    minHeight: 0,
                                    backgroundColor: T.surfaceRaised,
                                    borderRadius: `${PANEL_RADIUS_PX}px`,
                                    overflow: 'hidden',
                                }}>
                                    <FieldsPanel
                                    availableFields={dataSourceAvailableFields}
                                    fieldsSearch={fieldsSearch}
                                    onFieldsSearchChange={setFieldsSearch}
                                    onFieldUpdate={handleFieldUpdate}
                                    onRemoveFromAxis={handleRemoveFromAxis}
                                    onRemoveMultipleFromAxis={handleRemoveMultipleFromAxis}
                                    onRemoveFromFilter={(ids) => ids.forEach(filterController.removeFilter)}
                                    onRemoveFromColor={handleRemoveFromColor}
                                    onRemoveFromSize={handleRemoveFromSize}
                                    onRemoveFromLabel={(ids) => ids.forEach(handleRemoveFromLabel)}
                                    onRemoveFromTooltip={(ids) => ids.forEach(handleRemoveFromTooltip)}
                                    onRemoveFromMeasureGroup={handleRemoveFromMeasureGroup}
                                    onRemoveFromBackground={handleRemoveFromBackground}
                                    onRemoveFromShape={dragDropHandlers.handleRemoveFromShape}
                                    connectionType={connectionDetails?.type || ''}
                                    selectedDatabase={selectedDatabase}
                                    selectedTable={selectedTable}
                                    databases={databases}
                                    tables={tables}
                                    isLoadingMetadata={isLoadingMetadata}
                                    metadataError={metadataError}
                                    onDatabaseSelect={handleDatabaseSelect}
                                    onTableSelect={handleTableSelect}
                                    onRefreshMetadata={handleRefreshMetadata}
                                    suggestedJoinableTables={suggestedJoinableTables}
                                    joinedTables={joinedTables}
                                    onToggleJoinedTable={toggleJoinedTable}
                                    unionTables={unionTables}
                                    onAddUnionTable={addUnionTable}
                                    onRemoveUnionTable={removeUnionTable}
                                    tablesCache={tablesCache}
                                    onLoadTablesForDatabase={handleLoadTablesForDatabase}
                                    loadedPartitions={loadedPartitions}
                                    isLoadingPartition={isLoadingPartition}
                                    onLoadPartition={handleLoadPartition}
                                    onAddFiles={handleAddFiles}
                                    dbSwitchEnabled={dbSwitchEnabled}
                                    onDbSwitchEnabledChange={setDbSwitchEnabled}
                                    onDatabaseSwitch={handleDatabaseSwitch}
                                    dbSwitchDisabled={dbSwitchDisabled}
                                    dbSwitchDisabledReason={dbSwitchDisabledReason}
                                    isSwitchingDatabase={isSwitchingDatabase}
                                    virtualColumns={virtualColumns}
                                    onAddVirtualColumn={handleAddVirtualColumn}
                                    onUpdateVirtualColumn={handleUpdateVirtualColumn}
                                    onRemoveVirtualColumn={handleRemoveVirtualColumn}
                                />
                                </Box>
                            </Box>
                        )}
                    </Panel>

                    <SplitHandle
                        inGroup
                        variant="gap"
                        orientation="vertical"
                        panelSide="before"
                        ariaLabel="Resize Fields panel"
                        getBounds={leftSplit.getBounds}
                        onCommitPx={leftSplit.onCommitPx}
                        onToggle={toggleLeftPanel}
                    />

                    {/* Middle Panel - Property sections stacked vertically */}
                    <Panel
                        panelRef={middlePanelRef}
                        defaultSize={initialMiddleCollapsed ? '0%' : `${initialMiddleSize}%`}
                        minSize={`${SHELL_PANELS.middle.minPx}px`}
                        maxSize={`${SHELL_PANELS.middle.maxPercent}%`}
                        collapsible
                        collapsedSize={`${COLLAPSE_RAIL_THICKNESS_PX}px`}
                        style={{ overflow: 'hidden' }}
                        onResize={(size) => {
                            const collapsed = size.inPixels <= COLLAPSE_RAIL_THICKNESS_PX + 1;
                            setMiddlePanelCollapsed(collapsed);
                            persistMiddlePanelLayout(collapsed, size.asPercentage);
                        }}
                    >
                        {middlePanelCollapsed ? (
                          <CollapseRail label="Properties" onExpand={toggleMiddlePanel} side="left" />
                        ) : (
                          <Box sx={{
                              height: '100%',
                              // No CssBaseline in this app, so box-sizing is
                              // content-box: any padding added here would be
                              // added to the 100% and overflow the panel.
                              boxSizing: 'border-box',
                              display: 'flex',
                              flexDirection: 'column',
                              overflow: 'auto',
                              // A well rather than a card: the sections inside are
                              // the cards, so stacking one card inside another is
                              // avoided. See PropertySection.module.css.
                              //
                              // Deliberately unpadded, like the Fields well. A
                              // gutter here would sit *inside* the 4px handle
                              // that already separates the columns, so this
                              // column's cards would inset 8px from their
                              // neighbours while every other gap in the shell is
                              // 4px — and their top edges would drop 4px below
                              // the brand and chart cards. The vertical `gap`
                              // between the sections is the only spacing the
                              // well supplies.
                              backgroundColor: T.surfaceShell,
                              gap: `${SHELL_GUTTER_PX}px`,
                          }}>
                              <FilterPanel
                                  filterFields={filterController.effective.fields}
                                  filterConfigurations={filterController.effective.configurations}
                                  filterMetadata={filterController.effective.metadata}
                                  onDrop={handleFilterDrop}
                                  onRemove={filterController.removeFilter}
                                  onConfigChange={filterController.updateFilterConfig}
                                  onApplyFilters={filterController.applyFilters}
                                  hasPendingApply={filterController.hasPendingApply}
                                  onRefetchValues={refetchFilterValues}
                                  onValueListModeChange={setValueListMode}
                                  onMarkAsGlobal={filterController.markAsSession}
                                  onUnmarkGlobal={filterController.markAsSheet}
                                  globalFilterIds={filterController.effective.sessionFilterIds}
                                  disabledFilterIds={filterController.effective.disabledFilterIds}
                                  onToggleFilterDisabled={filterController.toggleFilterDisabled}
                              />
                              <FieldOverridesPanel />
                              <OverlaysSection />
                              <MeasureGroupsPanel />
                          </Box>
                        )}
                    </Panel>

                    <SplitHandle
                        inGroup
                        variant="gap"
                        orientation="vertical"
                        panelSide="before"
                        ariaLabel="Resize Properties panel"
                        getBounds={middleSplit.getBounds}
                        onCommitPx={middleSplit.onCommitPx}
                        onToggle={toggleMiddlePanel}
                    />

                    {/* Main Content - Chart */}
                    <Panel
                        defaultSize={`${initialChartSize}%`}
                        minSize={`${CHART_PANEL_MIN_PX}px`}
                        style={{ overflow: 'hidden' }}
                    >
                        <Box sx={{ height: '100%', minHeight: 0, overflow: 'hidden' }}>
                        <ChartPanel
                            xAxisFields={xAxisFields}
                            yAxisFields={yAxisFields}
                            onXAxisDrop={handleXAxisDrop}
                            onYAxisDrop={handleYAxisDrop}
                            onFieldUpdate={handleFieldUpdate}
                            onRemoveField={handleRemoveFromAxis}
                            onReorderFields={handleReorderFields}
                            onMoveFieldBetweenAxes={handleMoveFieldBetweenAxes}
                            showTableRows={state.showTableRows}
                            tableColumnFields={state.tableColumnFields}
                            onTableColumnsDrop={handleTableColumnsDrop}
                            onRemoveTableColumn={handleRemoveFromTableColumns}
                            onReorderTableColumns={handleReorderTableColumns}
                            axisDropFieldIdsRef={axisDropFieldIdsRef}
                        />
                        </Box>
                    </Panel>
                </PanelGroup>
            </Box>

            <SchemaCheckDialog
                open={schemaCheckOpen}
                result={schemaCheckResult}
                onClose={() => setSchemaCheckOpen(false)}
            />

            {/* Loading Modal for long-running operations */}
            <LoadingModal
                open={showLoadingModal}
                operationType={loadingOperationType}
                canCancel={canCancelOperation}
                startTime={loadingStartTime}
                onCancel={handleCancelOperation}
                activeOperations={state.activeOperations}
                modalPrimaryOperation={state.modalPrimaryOperation}
                operationStartTimes={state.operationStartTimes}
            />
        </Box>
    );
};

// Main component - wraps content with VisualizationProvider and UndoRedoProvider
// UndoRedoProvider lives outside the keyed subtree so undo/redo stacks survive sheet switches.
// SheetProvider is now at App level
const VisualizationPage = () => {
    const { activeSheet } = useSheetContext();

    return (
        <UndoRedoProvider sheetId={activeSheet?.id || ''}>
            <VisualizationProvider 
                key={activeSheet?.id} 
                initialState={activeSheet?.visualizationState}
            >
                <VisualizationPageContent />
            </VisualizationProvider>
        </UndoRedoProvider>
    );
};

export default VisualizationPage;