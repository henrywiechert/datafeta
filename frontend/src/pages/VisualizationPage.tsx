// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { useRef, useCallback } from 'react';
import { Box } from '@mui/material';
import { Navigate } from 'react-router-dom';
import { Panel, Group as PanelGroup } from "react-resizable-panels";
import type { GroupImperativeHandle, PanelImperativeHandle } from "react-resizable-panels";
import { useVisualizationState } from '../hooks/useVisualizationState';
import { useVisualizationContext, VisualizationProvider } from '../contexts/VisualizationContext';
import { UndoRedoProvider } from '../contexts/UndoRedoContext';
import { useSheetContext } from '../contexts/SheetContext';
import { useDragDrop } from '../hooks/useDragDrop';
import { useConnection } from '../contexts/ConnectionContext';
import { useDataSource } from '../contexts/DataSourceContext';
import { useUndoRedo } from '../hooks/useUndoRedo';
import { useFilterController } from '../hooks/useFilterController';
import FieldsPanel, { CompactMetadataSelector } from '../components/Visualization/FieldsPanel';
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
    PANEL_RADIUS_PX,
    SHELL_GUTTER_PX,
} from '../components/Layout/layoutTokens';
import { T } from '../theme/tokens';
import AppBrandHeader from '../components/AppBrandHeader';
import SchemaCheckDialog from '../components/SchemaCheckDialog';
import { schemaCheckBus } from '../services/schemaCheckBus';
import { isSchemaCheckReady, SchemaCheckResult, validateSheetSchema } from '../utils/schemaValidation';
import { DatabaseSwitchError } from '../services/switchDatabasePreserveTables';
import { apiService } from '../apiService';

import { Field, DragSource, RemovableDragSource } from '../types';
import type { RemoveFromZone } from '../hooks/useFieldsPanelDrag';
import type { SheetPanelLayout } from '../types/sheet';
import { FieldAssignProvider } from '../contexts/FieldAssignContext';
import { useAssignToShelf } from '../hooks/useAssignToShelf';
import { useTabletUi } from '../hooks/useTabletUi';

interface VisualizationPageProps {
  fileMenu?: React.ReactNode;
}

/**
 * Whether a shell panel is collapsed, asked of the library rather than read
 * off the measured width. When the window resizes (browser zoom included), the
 * library re-snaps a collapsed panel to its rail width, but the first
 * `onResize` still measures the panel at its old percentage of the new width —
 * 35px for a 28px rail on a zoom-out. Judged by pixels, that frame read as
 * expanded and recorded ~2% as the size to expand back to, which then snapped
 * straight back to the rail on every expand.
 */
function isPanelCollapsed(
    panelRef: React.RefObject<PanelImperativeHandle>,
    inPixels: number,
    isTablet: boolean,
): boolean {
    const panel = panelRef.current;
    if (panel) return panel.isCollapsed();
    return inPixels <= (isTablet ? 1 : COLLAPSE_RAIL_THICKNESS_PX + 1);
}

/**
 * Expands a collapsed panel to its remembered size, or to the default if that
 * size is too small to clear the collapse threshold — sheets saved before
 * `isPanelCollapsed` can carry such a size, and the panel would otherwise
 * never open.
 */
function expandPanel(panel: PanelImperativeHandle, lastSizePercent: number, defaultPercent: number) {
    panel.resize(`${lastSizePercent}%`);
    if (panel.isCollapsed()) {
        panel.resize(`${defaultPercent}%`);
    }
}

/** How the panel shortcuts (Cmd/Ctrl+B, Cmd/Ctrl+J) are spelled in tooltips. */
const SHORTCUT_MODIFIER = typeof navigator !== 'undefined'
    && navigator.platform.toUpperCase().indexOf('MAC') >= 0 ? '⌘' : 'Ctrl+';

/** Shell panel ids, so layouts can be read and written by panel. */
const FIELDS_PANEL_ID = 'shell-panel-fields';
const PROPERTIES_PANEL_ID = 'shell-panel-properties';
const CHART_PANEL_ID = 'shell-panel-chart';

/**
 * Runs a collapse or expand of one side panel so that only the chart gives or
 * takes the space.
 *
 * The library's imperative `collapse()`/`resize()` trade space with the
 * panel *after* the target. For Fields that is Properties, so collapsing Fields
 * reopened a collapsed Properties panel, and expanding Fields could squeeze or
 * collapse an open one. The library still decides the target's new size
 * (collapsed width, min/max snapping); this puts every other panel back and
 * settles the difference on the chart.
 */
function resizeAgainstChart(
    group: GroupImperativeHandle | null,
    panelId: string,
    apply: () => void,
) {
    const before = group?.getLayout() ?? {};
    apply();
    if (!group || before[panelId] === undefined || before[CHART_PANEL_ID] === undefined) return;
    const size = group.getLayout()[panelId];
    group.setLayout({
        ...before,
        [panelId]: size,
        [CHART_PANEL_ID]: before[CHART_PANEL_ID] + before[panelId] - size,
    });
}

// Inner component that uses both sheet and visualization contexts
const VisualizationPageContent = ({ fileMenu }: VisualizationPageProps) => {
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
    const panelGroupRef = useRef<GroupImperativeHandle>(null);
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
        resizeAgainstChart(panelGroupRef.current, FIELDS_PANEL_ID, () => {
            if (panel.isCollapsed()) {
                expandPanel(panel, lastLeftSizeRef.current, DEFAULT_LEFT_PANEL_PERCENT);
            } else {
                panel.collapse();
            }
        });
    }, []);

    const toggleMiddlePanel = useCallback(() => {
        const panel = middlePanelRef.current;
        if (!panel) return;
        resizeAgainstChart(panelGroupRef.current, PROPERTIES_PANEL_ID, () => {
            if (panel.isCollapsed()) {
                expandPanel(panel, lastMiddleSizeRef.current, DEFAULT_MIDDLE_PANEL_PERCENT);
            } else {
                panel.collapse();
            }
        });
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
    } = dragDropHandlers;
    // A multi-chip drag out of an axis is removed in one batched update.
    const removeFromAxes = (fieldIds: string[]) => {
        if (fieldIds.length > 1) {
            handleRemoveMultipleFromAxis(fieldIds);
        } else {
            fieldIds.forEach(handleRemoveFromAxis);
        }
    };

    const { isTablet } = useTabletUi();
    const assignToShelf = useAssignToShelf(dragDropHandlers);
    const fieldAssignApi = React.useMemo(() => ({ assignToShelf }), [assignToShelf]);

    // Undo/Redo handlers
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
        addUnionTables,
        removeUnionTables,
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
    const [schemaCheckResult, setSchemaCheckResult] = React.useState<SchemaCheckResult | null>(null);
    const [schemaCheckOpen, setSchemaCheckOpen] = React.useState(false);
    const [isSwitchingDatabase, setIsSwitchingDatabase] = React.useState(false);

    const showSchemaCheck = React.useCallback((result: SchemaCheckResult) => {
        if (result.allClear) return;
        setSchemaCheckResult(result);
        setSchemaCheckOpen(true);
    }, []);

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

    // Dragging chips out of a zone onto the Fields panel removes them there.
    // The Record covers every removable drag source, so a new zone is a type
    // error until its removal is wired up here.
    const zoneRemovers: Record<RemovableDragSource, (fieldIds: string[]) => void> = {
        X_AXIS: removeFromAxes,
        Y_AXIS: removeFromAxes,
        FILTER_ZONE: (ids) => ids.forEach(filterController.removeFilter),
        COLOR_ZONE: handleRemoveFromColor,
        BACKGROUND_ZONE: handleRemoveFromBackground,
        SIZE_ZONE: handleRemoveFromSize,
        SHAPE_ZONE: dragDropHandlers.handleRemoveFromShape,
        LINE_STYLE_ZONE: dragDropHandlers.handleRemoveFromLineStyle,
        LABEL_ZONE: (ids) => ids.forEach(handleRemoveFromLabel),
        TOOLTIP_ZONE: (ids) => ids.forEach(handleRemoveFromTooltip),
        TABLE_ZONE: handleRemoveFromTableColumns,
        MEASURE_GROUP: handleRemoveFromMeasureGroup,
    };
    // FieldsPanel's memo ignores callback props, so it keeps the first handler
    // it receives; a stable callback reading the latest removers stays current.
    const zoneRemoversRef = useRef(zoneRemovers);
    zoneRemoversRef.current = zoneRemovers;
    const handleRemoveFromZone = useCallback<RemoveFromZone>((source, fieldIds) => {
        const removers = zoneRemoversRef.current;
        if (Object.prototype.hasOwnProperty.call(removers, source)) {
            removers[source as RemovableDragSource](fieldIds);
        }
    }, []);
    
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

    const sidePanelsVisible = !leftPanelCollapsed || !middlePanelCollapsed;
    const toggleSidePanels = React.useCallback(() => {
        if (sidePanelsVisible) {
            if (!leftPanelCollapsed) toggleLeftPanel();
            if (!middlePanelCollapsed) toggleMiddlePanel();
        } else {
            if (leftPanelCollapsed) toggleLeftPanel();
            if (middlePanelCollapsed) toggleMiddlePanel();
        }
    }, [
        sidePanelsVisible,
        leftPanelCollapsed,
        middlePanelCollapsed,
        toggleLeftPanel,
        toggleMiddlePanel,
    ]);

    // Route guard in App.tsx redirects when disconnected; keep a safety net here.
    if (!connectionDetails) {
        return <Navigate to="/" replace />;
    }

    return (
        <FieldAssignProvider value={fieldAssignApi}>
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
                    <PanelGroup orientation="horizontal" groupRef={panelGroupRef}>
                    {/* Left Panel - Fields with metadata selector */}
                    <Panel
                        id={FIELDS_PANEL_ID}
                        panelRef={leftPanelRef}
                        defaultSize={initialLeftCollapsed ? '0%' : `${initialLeftSize}%`}
                        minSize={`${SHELL_PANELS.left.minPx}px`}
                        maxSize={`${SHELL_PANELS.left.maxPercent}%`}
                        collapsible
                        collapsedSize={isTablet ? '0px' : `${COLLAPSE_RAIL_THICKNESS_PX}px`}
                        // The panel element is not a scroll container: its
                        // content decides what scrolls. Without this the
                        // library's default overflow:auto adds a second
                        // scrollbar outside the one the content already has.
                        style={{ overflow: 'hidden' }}
                        onResize={(size) => {
                            const collapsed = isPanelCollapsed(leftPanelRef, size.inPixels, isTablet);
                            setLeftPanelCollapsed(collapsed);
                            persistLeftPanelLayout(collapsed, size.asPercentage);
                        }}
                    >
                        {leftPanelCollapsed ? (
                            isTablet ? null : (
                            <CollapseRail label="Fields" onExpand={toggleLeftPanel} side="left" />
                            )
                        ) : (
                            /*
                              A well rather than a card, like the Properties
                              column below: it holds three cards — the brand
                              header, Data Source and Fields — so the canvas
                              shows between them and none of them nests inside
                              another. No padding, unlike Properties, so the
                              cards keep their edge-to-edge position in the
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
                                <AppBrandHeader fileMenu={fileMenu} />
                                {/*
                                  The Data Source card. Its own card rather than
                                  a band inside the Fields card below, matching
                                  the Properties well, where each independently
                                  collapsible section is a card: the canvas gap
                                  is the separation, so the selector no longer
                                  needs the surface tint and hairline it used to
                                  draw. `flexShrink: 0` keeps it at its natural
                                  height and leaves the rest of the column to
                                  Fields — the same split the two had inside one
                                  card.
                                */}
                                <Box sx={{
                                    flexShrink: 0,
                                    backgroundColor: T.surfaceRaised,
                                    borderRadius: `${PANEL_RADIUS_PX}px`,
                                    overflow: 'hidden',
                                }}>
                                    <CompactMetadataSelector
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
                                        availableFields={dataSourceAvailableFields}
                                        suggestedJoinableTables={suggestedJoinableTables}
                                        joinedTables={joinedTables}
                                        onToggleJoinedTable={toggleJoinedTable}
                                        unionTables={unionTables}
                                        onAddUnionTable={addUnionTable}
                                        onRemoveUnionTable={removeUnionTable}
                                        onAddUnionTables={addUnionTables}
                                        onRemoveUnionTables={removeUnionTables}
                                        tablesCache={tablesCache}
                                        onLoadTablesForDatabase={handleLoadTablesForDatabase}
                                        loadedPartitions={loadedPartitions}
                                        isLoadingPartition={isLoadingPartition}
                                        onLoadPartition={handleLoadPartition}
                                        onAddFiles={handleAddFiles}
                                        onDatabaseSwitch={handleDatabaseSwitch}
                                        isSwitchingDatabase={isSwitchingDatabase}
                                    />
                                </Box>
                                {/* The Fields card. `overflow: hidden` clips its
                                    own header to the radius. */}
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
                                    onRemoveFromZone={handleRemoveFromZone}
                                    selectedDatabase={selectedDatabase}
                                    selectedTable={selectedTable}
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
                        collapseLabel={leftPanelCollapsed ? undefined : `Hide Fields (${SHORTCUT_MODIFIER}B)`}
                    />

                    {/* Middle Panel - Property sections stacked vertically */}
                    <Panel
                        id={PROPERTIES_PANEL_ID}
                        panelRef={middlePanelRef}
                        defaultSize={initialMiddleCollapsed ? '0%' : `${initialMiddleSize}%`}
                        minSize={`${SHELL_PANELS.middle.minPx}px`}
                        maxSize={`${SHELL_PANELS.middle.maxPercent}%`}
                        collapsible
                        collapsedSize={isTablet ? '0px' : `${COLLAPSE_RAIL_THICKNESS_PX}px`}
                        style={{ overflow: 'hidden' }}
                        onResize={(size) => {
                            const collapsed = isPanelCollapsed(middlePanelRef, size.inPixels, isTablet);
                            setMiddlePanelCollapsed(collapsed);
                            persistMiddlePanelLayout(collapsed, size.asPercentage);
                        }}
                    >
                        {middlePanelCollapsed ? (
                          isTablet ? null : (
                          <CollapseRail label="Properties" onExpand={toggleMiddlePanel} side="left" />
                          )
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
                        collapseLabel={middlePanelCollapsed ? undefined : `Hide Properties (${SHORTCUT_MODIFIER}J)`}
                    />

                    {/* Main Content - Chart */}
                    <Panel
                        id={CHART_PANEL_ID}
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
                            onRemoveMultipleFields={handleRemoveMultipleFromAxis}
                            onReorderFields={handleReorderFields}
                            onMoveFieldBetweenAxes={handleMoveFieldBetweenAxes}
                            showTableRows={state.showTableRows}
                            tableColumnFields={state.tableColumnFields}
                            onTableColumnsDrop={handleTableColumnsDrop}
                            onRemoveTableColumn={handleRemoveFromTableColumns}
                            onReorderTableColumns={handleReorderTableColumns}
                            axisDropFieldIdsRef={axisDropFieldIdsRef}
                            sidePanelsVisible={sidePanelsVisible}
                            onToggleSidePanels={isTablet ? toggleSidePanels : undefined}
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
        </FieldAssignProvider>
    );
};

// Main component - wraps content with VisualizationProvider and UndoRedoProvider
// UndoRedoProvider lives outside the keyed subtree so undo/redo stacks survive sheet switches.
// SheetProvider is now at App level
const VisualizationPage = ({ fileMenu }: VisualizationPageProps) => {
    const { activeSheet } = useSheetContext();

    return (
        <UndoRedoProvider sheetId={activeSheet?.id || ''}>
            <VisualizationProvider 
                key={activeSheet?.id} 
                initialState={activeSheet?.visualizationState}
            >
                <VisualizationPageContent fileMenu={fileMenu} />
            </VisualizationProvider>
        </UndoRedoProvider>
    );
};

export default VisualizationPage;