// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { useRef, useCallback } from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import { Link } from 'react-router-dom';
import { Panel, PanelGroup, ImperativePanelHandle } from "react-resizable-panels";
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
import CollapsedPanelStrip from '../components/Layout/CollapsedPanelStrip';
import PanelResizeHandleWithToggle from '../components/Layout/PanelResizeHandleWithToggle';
import AppInfoDisplay from '../components/AppInfoDisplay';
import DataSlicerIcon from '../components/icons/DataSlicerIcon';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import SchemaCheckDialog from '../components/SchemaCheckDialog';
import { schemaCheckBus } from '../services/schemaCheckBus';
import { hasCrossDatabaseUnion, SchemaCheckResult, validateSheetSchema } from '../utils/schemaValidation';
import { DatabaseSwitchError } from '../services/switchDatabasePreserveTables';
import { apiService } from '../apiService';

import { Field, DragSource } from '../types';

// Inner component that uses both sheet and visualization contexts
const VisualizationPageContent = () => {
    const [fieldsSearch, setFieldsSearch] = React.useState('');
    
    // Panel collapse state - kept LOCAL to avoid re-rendering the entire chart grid
    // when panels are toggled. This was previously in VisualizationContext but caused
    // unnecessary re-renders of ChartArea and its 160+ facet children.
    const [leftPanelCollapsed, setLeftPanelCollapsed] = React.useState(false);
    const [middlePanelCollapsed, setMiddlePanelCollapsed] = React.useState(false);
    
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
    
    const { 
        showLoadingModal, 
        loadingOperationType, 
        loadingStartTime, 
        canCancelOperation,
    } = state;

    // Panel refs for imperative control
    const leftPanelRef = useRef<ImperativePanelHandle>(null);
    const middlePanelRef = useRef<ImperativePanelHandle>(null);

    // Panel toggle handlers - use local state to avoid re-rendering chart grid
    const toggleLeftPanel = useCallback(() => {
        setLeftPanelCollapsed(prev => {
            if (prev) {
                leftPanelRef.current?.expand();
            } else {
                leftPanelRef.current?.collapse();
            }
            return !prev;
        });
    }, []);

    const toggleMiddlePanel = useCallback(() => {
        setMiddlePanelCollapsed(prev => {
            if (prev) {
                middlePanelRef.current?.expand();
            } else {
                middlePanelRef.current?.collapse();
            }
            return !prev;
        });
    }, []);

    // Use our custom drag-and-drop hook with virtual columns included
    const dragDropHandlers = useDragDrop(dataSourceAvailableFields);
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
        measureGroupFields,
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
        setMetadataError,
        setMeasureGroupFields
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

    // Schema check after config load with swap-same-schema option
    React.useEffect(() => {
        if (!pendingLoadSchemaCheckRef.current) return;
        if (!selectedTable || dataSourceAvailableFields.length === 0) return;

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
        const idSet = new Set(fieldIds);
        const remaining = measureGroupFields.filter((field) => !idSet.has(field.id));
        if (remaining.length !== measureGroupFields.length) {
            setMeasureGroupFields(remaining);
            dispatch({ type: 'FORCE_QUERY_REFRESH' });
        }
    }, [measureGroupFields, setMeasureGroupFields, dispatch]);
    
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

    if (!connectionDetails) {
        return (
            <Box sx={{ p: 4, textAlign: 'center' }}>
                <h2>Visualization</h2>
                <p>
                    Please connect to a data source first on the{' '}
                    <Link to="/datasources" style={{ textDecoration: 'underline', color: 'primary.main' }}>
                        Data Sources
                    </Link>
                    {' '}page.
                </p>
            </Box>
        );
    }

    return (
        <Box sx={{ 
            height: '100%', 
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden' 
        }}>
                {/* Main Layout with react-resizable-panels */}
                <Box sx={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
                    <PanelGroup direction="horizontal">
                    {/* Left Panel - Fields with metadata selector */}
                    <Panel 
                        ref={leftPanelRef}
                        defaultSize={20} 
                        minSize={10}
                        maxSize={35}
                        collapsible
                        collapsedSize={0}
                        onCollapse={() => setLeftPanelCollapsed(true)}
                        onExpand={() => setLeftPanelCollapsed(false)}
                    >
                        {leftPanelCollapsed ? (
                            <CollapsedPanelStrip 
                                label="Fields" 
                                onExpand={toggleLeftPanel}
                                tooltipPlacement="right"
                            />
                        ) : (
                            <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                                <Box
                                    sx={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        px: 1.5,
                                        py: 0.5,
                                        borderBottom: 1,
                                        borderColor: 'divider',
                                        backgroundColor: '#e3f2fd',
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
                                <Box sx={{ flex: 1, minHeight: 0 }}>
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

                    <PanelResizeHandleWithToggle onDoubleClick={toggleLeftPanel} />

                    {/* Middle Panel - Property sections stacked vertically */}
                    <Panel 
                        ref={middlePanelRef}
                        defaultSize={15} 
                        minSize={10}
                        maxSize={30}
                        collapsible
                        collapsedSize={0}
                        // Allow true collapse-to-zero. When expanded, clamp to 140px so controls don't get forced offscreen.
                        style={{ minWidth: middlePanelCollapsed ? 0 : 140 }}
                        onCollapse={() => setMiddlePanelCollapsed(true)}
                        onExpand={() => setMiddlePanelCollapsed(false)}
                    >
                        {middlePanelCollapsed ? null : (
                          <Box sx={{ 
                              height: '100%', 
                              display: 'flex', 
                              flexDirection: 'column',
                              overflow: 'auto',
                              backgroundColor: '#fafafa',
                          }}>
                              <FilterPanel
                                  filterFields={filterController.effective.fields}
                                  filterConfigurations={filterController.effective.configurations}
                                  filterMetadata={filterController.effective.metadata}
                                  onDrop={handleFilterDrop}
                                  onRemove={filterController.removeFilter}
                                  onConfigChange={filterController.updateFilterConfig}
                                  onApplyFilters={filterController.applyFilters}
                                  onRefetchValues={refetchFilterValues}
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

                    <PanelResizeHandleWithToggle onDoubleClick={toggleMiddlePanel} />

                    {/* Main Content - Chart */}
                    <Panel defaultSize={65} minSize={40}>
                        <ChartPanel
                            xAxisFields={xAxisFields}
                            yAxisFields={yAxisFields}
                            onXAxisDrop={handleXAxisDrop}
                            onYAxisDrop={handleYAxisDrop}
                            onFieldUpdate={handleFieldUpdate}
                            onRemoveField={handleRemoveFromAxis}
                            onReorderFields={handleReorderFields}
                            onMoveFieldBetweenAxes={handleMoveFieldBetweenAxes}
                        />
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