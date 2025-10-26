import React from 'react';
import { Box } from '@mui/material';
import { Link } from 'react-router-dom';
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { useVisualizationState } from '../hooks/useVisualizationState';
import { useVisualizationContext, VisualizationProvider } from '../contexts/VisualizationContext';
import { useSheetContext } from '../contexts/SheetContext';
import { useDragDrop } from '../hooks/useDragDrop';
import { useConnection } from '../contexts/ConnectionContext';
import FieldsPanel from '../components/Visualization/FieldsPanel';
import ChartPanel from '../components/Visualization/ChartPanel';
import FilterPanel from '../components/Visualization/Filters/FilterPanel';
import ColorPanel from '../components/Visualization/Color/ColorPanel';
// import SizePanel from '../components/Visualization/Size/SizePanel';
import LegendPanel from '../components/Visualization/Legend/LegendPanel';
import SizePanel from '../components/Visualization/Size/SizePanelComplete';
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
        refetchFilterValues
    } = useVisualizationState();

    // Access the enhanced context with loading states and cancellation
    const { state, dispatch, cancelOperation } = useVisualizationContext();
    const { 
        showLoadingModal, 
        loadingOperationType, 
        loadingStartTime, 
        canCancelOperation 
    } = state;

    // Use our custom drag-and-drop hook
    const {
        handleAxisDrop,
        handleRemoveFromAxis,
        handleReorderFields,
        handleFilterDrop,
        handleRemoveFromFilter,
        handleColorDrop,
        handleRemoveFromColor,
    } = useDragDrop();

    // Simplified axis-specific handlers that use the generic handler
    const handleXAxisDrop = (field: Field, source: DragSource, index?: number) => {
        handleAxisDrop('x', field, source, index);
    };

    const handleYAxisDrop = (field: Field, source: DragSource, index?: number) => {
        handleAxisDrop('y', field, source, index);
    };

    // Handle applying filters
    const handleApplyFilters = React.useCallback(() => {
        // Apply the current filter configurations to the query
        dispatch({ type: 'APPLY_FILTERS' });
    }, [dispatch]);

    // Handle cancellation of long-running operations
    const handleCancelOperation = React.useCallback(() => {
        // Cancel API requests
        apiService.cancelAllRequests();
        
        // Update context state
        cancelOperation();
    }, [cancelOperation]);

    const { connectionDetails } = useConnection();

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
                                onDrop={handleColorDrop}
                                onRemove={handleRemoveFromColor}
                                onSchemeChange={(schemeId) => {
                                    dispatch({
                                        type: 'SET_COLOR_SCHEME',
                                        payload: schemeId
                                    });
                                }}
                            />
                            <SizePanel />
                            {state.colorField && (
                                <LegendPanel
                                    colorField={state.colorField}
                                    queryResult={state.queryResult}
                                    colorScheme={state.colorScheme}
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
            />
        </Box>
    );
};

// Main component - wraps content with VisualizationProvider
// SheetProvider is now at App level
const VisualizationPage = () => {
    const { activeSheet } = useSheetContext();

    // Use the sheet ID as key to force remount when switching sheets
    return (
        <VisualizationProvider 
            key={activeSheet?.id} 
            initialState={activeSheet?.visualizationState}
        >
            <VisualizationPageContent />
        </VisualizationProvider>
    );
};

export default VisualizationPage;