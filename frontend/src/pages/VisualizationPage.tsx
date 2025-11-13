import React from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';
import { Link } from 'react-router-dom';
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { useVisualizationState } from '../hooks/useVisualizationState';
import { useVisualizationContext, VisualizationProvider } from '../contexts/VisualizationContext';
import { UndoRedoProvider } from '../contexts/UndoRedoContext';
import { useSheetContext } from '../contexts/SheetContext';
import { useDragDrop } from '../hooks/useDragDrop';
import { useConnection } from '../contexts/ConnectionContext';
import { useDataSource } from '../contexts/DataSourceContext';
import { useUndoRedo } from '../hooks/useUndoRedo';
import FieldsPanel from '../components/Visualization/FieldsPanel';
import ChartPanel from '../components/Visualization/ChartPanel';
import FilterPanel from '../components/Visualization/Filters/FilterPanel';
import ColorPanel from '../components/Visualization/Color/ColorPanel';
// import SizePanel from '../components/Visualization/Size/SizePanel';
import LegendPanel from '../components/Visualization/Legend/LegendPanel';
import SizePanel from '../components/Visualization/Size/SizePanelComplete';
import LabelPanel from '../components/Visualization/Label/LabelPanel';
import LoadingModal from '../components/LoadingModal';
import { apiService } from '../apiService';

import { Field, DragSource } from '../types';

// Inner component that uses both sheet and visualization contexts
const VisualizationPageContent = () => {
    const [fieldsSearch, setFieldsSearch] = React.useState('');
    
    const {
        xAxisFields,
        yAxisFields,
        availableFields,
        databases,
        tables,
        selectedDatabase,
        selectedTable,
        isLoadingMetadata,
        metadataError,
        handleFieldUpdate,
        handleDatabaseSelect,
        handleTableSelect,
        refetchFilterValues,
        virtualColumns,
        handleAddVirtualColumn,
        handleUpdateVirtualColumn,
        handleRemoveVirtualColumn
    } = useVisualizationState();

    // Access the enhanced context with loading states and cancellation
    const { state, dispatch, cancelOperation, getUndoableSnapshot } = useVisualizationContext();
    const { recordAction, undo, completeUndo, redo, completeRedo, canUndo, canRedo, clearHistory } = useUndoRedo();
    const { 
        showLoadingModal, 
        loadingOperationType, 
        loadingStartTime, 
        canCancelOperation 
    } = state;

    // Use our custom drag-and-drop hook with virtual columns included
    const {
        handleAxisDrop,
        handleRemoveFromAxis,
        handleReorderFields,
        handleFilterDrop,
        handleRemoveFromFilter,
        handleColorDrop,
        handleRemoveFromColor,
    } = useDragDrop(availableFields);

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
                    virtualColumns: previousState.virtualColumns || []
                }
            });
            
            // Complete the undo operation
            completeUndo(currentState);
        }
    }, [undo, completeUndo, dispatch, getUndoableSnapshot]);

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
                    virtualColumns: nextState.virtualColumns || []
                }
            });
            
            // Complete the redo operation
            completeRedo(currentState);
        }
    }, [redo, completeRedo, dispatch, getUndoableSnapshot]);

    // Simplified axis-specific handlers that use the generic handler
    const handleXAxisDrop = (field: Field, source: DragSource, index?: number) => {
        handleAxisDrop('x', field, source, index);
    };

    const handleYAxisDrop = (field: Field, source: DragSource, index?: number) => {
        handleAxisDrop('y', field, source, index);
    };

    // Handle applying filters
    const handleApplyFilters = React.useCallback(() => {
        // Record current state for undo
        recordAction(getUndoableSnapshot());
        
        // Apply the current filter configurations to the query
        dispatch({ type: 'APPLY_FILTERS' });
    }, [dispatch, recordAction, getUndoableSnapshot]);

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
        suggestedUnionableTables,
        unionTables
    } = dataSourceContext.dataSource;
    const { toggleJoinedTable, toggleUnionTable } = dataSourceContext;
    const { state: sheetState } = useSheetContext();

    // Clear undo history when switching sheets
    React.useEffect(() => {
        clearHistory();
    }, [sheetState.activeSheetId, clearHistory]);

    // Keyboard shortcuts for undo/redo
    React.useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            // Check for Ctrl+Z (Windows/Linux) or Cmd+Z (Mac)
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
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [handleUndo, handleRedo]);

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
            {/* Undo/Redo Controls */}
            <Box sx={{ 
                position: 'absolute', 
                top: 8, 
                right: 8, 
                zIndex: 1000,
                display: 'flex',
                gap: 1,
                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                borderRadius: 1,
                padding: '4px',
                boxShadow: 1
            }}>
                <Tooltip title="Undo (Ctrl+Z)">
                    <span>
                        <IconButton
                            onClick={handleUndo}
                            disabled={!canUndo}
                            size="small"
                            sx={{ color: canUndo ? 'primary.main' : 'action.disabled' }}
                        >
                            <UndoIcon fontSize="small" />
                        </IconButton>
                    </span>
                </Tooltip>
                <Tooltip title="Redo (Ctrl+Shift+Z)">
                    <span>
                        <IconButton
                            onClick={handleRedo}
                            disabled={!canRedo}
                            size="small"
                            sx={{ color: canRedo ? 'primary.main' : 'action.disabled' }}
                        >
                            <RedoIcon fontSize="small" />
                        </IconButton>
                    </span>
                </Tooltip>
            </Box>
            
            {/* Main Layout with react-resizable-panels */}
            <Box sx={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
                <PanelGroup direction="horizontal">
                    {/* Left Panel - Fields with metadata selector */}
                    <Panel defaultSize={20} minSize={10} maxSize={35}>
                        <FieldsPanel
                            availableFields={availableFields}
                            fieldsSearch={fieldsSearch}
                            onFieldsSearchChange={setFieldsSearch}
                            onFieldUpdate={handleFieldUpdate}
                            onRemoveFromAxis={handleRemoveFromAxis}
                            connectionType={connectionDetails?.type || ''}
                            selectedDatabase={selectedDatabase}
                            selectedTable={selectedTable}
                            databases={databases}
                            tables={tables}
                            isLoadingMetadata={isLoadingMetadata}
                            metadataError={metadataError}
                            onDatabaseSelect={handleDatabaseSelect}
                            onTableSelect={handleTableSelect}
                            suggestedJoinableTables={suggestedJoinableTables}
                            joinedTables={joinedTables}
                            onToggleJoinedTable={toggleJoinedTable}
                            suggestedUnionableTables={suggestedUnionableTables}
                            unionTables={unionTables}
                            onToggleUnionTable={toggleUnionTable}
                            virtualColumns={virtualColumns}
                            onAddVirtualColumn={handleAddVirtualColumn}
                            onUpdateVirtualColumn={handleUpdateVirtualColumn}
                            onRemoveVirtualColumn={handleRemoveVirtualColumn}
                        />
                    </Panel>

                    <PanelResizeHandle />

                    {/* Middle Panel - Property sections stacked vertically */}
                    <Panel defaultSize={15} minSize={10} maxSize={30}>
                        <Box sx={{ 
                            height: '100%', 
                            display: 'flex', 
                            flexDirection: 'column',
                            overflow: 'auto',
                            backgroundColor: '#fafafa',
                        }}>
                            <FilterPanel
                                filterFields={state.filterFields}
                                filterConfigurations={state.filterConfigurations}
                                filterMetadata={state.filterMetadata}
                                onDrop={handleFilterDrop}
                                onRemove={handleRemoveFromFilter}
                                onConfigChange={(fieldId, config) => {
                                    // Record current state for undo
                                    recordAction(getUndoableSnapshot());
                                    
                                    dispatch({ 
                                        type: 'SET_FILTER_CONFIGURATION', 
                                        payload: { fieldId, config }
                                    });
                                }}
                                onApplyFilters={handleApplyFilters}
                                onRefetchValues={refetchFilterValues}
                            />
                            <ColorPanel
                                colorField={state.colorField}
                                colorScheme={state.colorScheme}
                                colorBias={state.colorBias}
                                onDrop={handleColorDrop}
                                onRemove={handleRemoveFromColor}
                                onSchemeChange={(schemeId) => {
                                    // Record current state for undo
                                    recordAction(getUndoableSnapshot());
                                    
                                    dispatch({
                                        type: 'SET_COLOR_SCHEME',
                                        payload: schemeId
                                    });
                                }}
                                onBiasChange={(bias) => {
                                    // Record current state for undo
                                    recordAction(getUndoableSnapshot());
                                    
                                    dispatch({
                                        type: 'SET_COLOR_BIAS',
                                        payload: bias
                                    });
                                }}
                            />
                            <LabelPanel />
                            <SizePanel />
                            {state.colorField && (
                                <LegendPanel
                                    colorField={state.colorField}
                                    queryResult={state.queryResult}
                                    colorScheme={state.colorScheme}
                                    colorBias={state.colorBias}
                                />
                            )}
                        </Box>
                    </Panel>

                    <PanelResizeHandle />

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