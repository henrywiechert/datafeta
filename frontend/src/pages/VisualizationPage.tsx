import React, { useRef, useCallback, useMemo } from 'react';
import { Box } from '@mui/material';
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
import { useGlobalFilters } from '../hooks/useGlobalFilters';
import FieldsPanel from '../components/Visualization/FieldsPanel';
import ChartPanel from '../components/Visualization/ChartPanel';
import FilterPanel from '../components/Visualization/Filters/FilterPanel';
import FieldOverridesPanel from '../components/Visualization/Overrides/FieldOverridesPanel';
import MeasureGroupsPanel from '../components/Visualization/MeasureGroups';
import LoadingModal from '../components/LoadingModal';
import CollapsedPanelStrip from '../components/Layout/CollapsedPanelStrip';
import PanelResizeHandleWithToggle from '../components/Layout/PanelResizeHandleWithToggle';
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

    // Access the enhanced context with loading states and cancellation
    const { state, dispatch, cancelOperation, getUndoableSnapshot } = useVisualizationContext();
    const { recordAction, undo, completeUndo, redo, completeRedo, clearHistory } = useUndoRedo();
    
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
    const { 
        handleAxisDrop,
        handleRemoveFromAxis,
        handleRemoveMultipleFromAxis,
        handleReorderFields,
        handleMoveFieldBetweenAxes,
        handleFilterDrop,
        handleRemoveFromFilter: handleRemoveLocalFilter,
        handleRemoveFromColor,
        handleRemoveFromSize,
        handleRemoveFromLabel,
        handleRemoveFromTooltip,
        handleRemoveFromBackground,
    } = useDragDrop(dataSourceAvailableFields);    // Undo/Redo handlers
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
        unionTables,
        tablesCache,
        measureGroupFields,
        loadedPartitions,
        isLoadingPartition,
        hivePartitionFiles,
    } = dataSourceContext.dataSource;
    
    // Global filters hook for session-scoped filters
    const {
        isGlobalFilter,
        markFilterAsGlobal,
        unmarkGlobalFilter,
        removeGlobalFilter,
        getMergedFilterFields,
        getMergedFilterConfigurations,
        getMergedFilterMetadata,
        sessionFilterFields,
    } = useGlobalFilters();
    
    // Wrapper for filter removal that routes to the correct context based on scope
    const handleRemoveFromFilter = React.useCallback((fieldId: string) => {
        if (isGlobalFilter(fieldId)) {
            // Global filter: remove from DataSourceContext (removes from all sheets)
            removeGlobalFilter(fieldId);
        } else {
            // Local filter: remove from current sheet's VisualizationContext
            handleRemoveLocalFilter(fieldId);
        }
    }, [isGlobalFilter, removeGlobalFilter, handleRemoveLocalFilter]);
    
    // Merge session (global) and local filters for display
    const mergedFilterFields = useMemo(() => getMergedFilterFields(), [getMergedFilterFields]);
    const mergedFilterConfigurations = useMemo(() => getMergedFilterConfigurations(), [getMergedFilterConfigurations]);
    const mergedFilterMetadata = useMemo(() => getMergedFilterMetadata(), [getMergedFilterMetadata]);
    
    // Set of global filter IDs for quick lookup
    const globalFilterIds = useMemo(
        () => new Set(sessionFilterFields.map(f => f.id)),
        [sessionFilterFields]
    );
    const {
        toggleJoinedTable: toggleJoinedTableBase,
        addUnionTable: addUnionTableBase,
        removeUnionTable: removeUnionTableBase,
        setTablesForDatabase,
        setMetadataError,
        setMeasureGroupFields
    } = dataSourceContext;
    const { state: sheetState } = useSheetContext();

    // Handle applying filters (both local and session filters)
    const handleApplyFilters = React.useCallback(() => {
        // Record current state for undo
        recordAction(getUndoableSnapshot());
        
        // Apply the current filter configurations to the query
        dispatch({ type: 'APPLY_FILTERS' });
        
        // Also apply session (global) filters
        dataSourceContext.applySessionFilters();
    }, [dispatch, recordAction, getUndoableSnapshot, dataSourceContext]);
    
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

    // Clear undo history when switching sheets
    React.useEffect(() => {
        clearHistory();
    }, [sheetState.activeSheetId, clearHistory]);

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
                            <FieldsPanel
                                    availableFields={dataSourceAvailableFields}
                                    fieldsSearch={fieldsSearch}
                                    onFieldsSearchChange={setFieldsSearch}
                                    onFieldUpdate={handleFieldUpdate}
                                    onRemoveFromAxis={handleRemoveFromAxis}
                                    onRemoveMultipleFromAxis={handleRemoveMultipleFromAxis}
                                    onRemoveFromFilter={(ids) => ids.forEach(handleRemoveFromFilter)}
                                    onRemoveFromColor={handleRemoveFromColor}
                                    onRemoveFromSize={handleRemoveFromSize}
                                    onRemoveFromLabel={(ids) => ids.forEach(handleRemoveFromLabel)}
                                    onRemoveFromTooltip={(ids) => ids.forEach(handleRemoveFromTooltip)}
                                    onRemoveFromMeasureGroup={handleRemoveFromMeasureGroup}
                                    onRemoveFromBackground={handleRemoveFromBackground}
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
                            virtualColumns={virtualColumns}
                            onAddVirtualColumn={handleAddVirtualColumn}
                            onUpdateVirtualColumn={handleUpdateVirtualColumn}
                            onRemoveVirtualColumn={handleRemoveVirtualColumn}
                        />
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
                                  filterFields={mergedFilterFields}
                                  filterConfigurations={mergedFilterConfigurations}
                                  filterMetadata={mergedFilterMetadata}
                                  onDrop={handleFilterDrop}
                                  onRemove={handleRemoveFromFilter}
                                  onConfigChange={(fieldId, config) => {
                                      // Route config changes to the appropriate context
                                      if (isGlobalFilter(fieldId)) {
                                          dataSourceContext.setSessionFilterConfiguration(fieldId, config);
                                      } else {
                                          dispatch({ 
                                              type: 'SET_FILTER_CONFIGURATION', 
                                              payload: { fieldId, config }
                                          });
                                      }
                                  }}
                                  onApplyFilters={handleApplyFilters}
                                  onRefetchValues={refetchFilterValues}
                                  onMarkAsGlobal={markFilterAsGlobal}
                                  onUnmarkGlobal={unmarkGlobalFilter}
                                  globalFilterIds={globalFilterIds}
                              />
                              <FieldOverridesPanel />
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
// SheetProvider is now at App level
const VisualizationPage = () => {
    const { activeSheet } = useSheetContext();

    // Use the sheet ID as key to force remount when switching sheets
    return (
        <VisualizationProvider 
            key={activeSheet?.id} 
            initialState={activeSheet?.visualizationState}
        >
            <UndoRedoProvider>
                <VisualizationPageContent />
            </UndoRedoProvider>
        </VisualizationProvider>
    );
};

export default VisualizationPage;