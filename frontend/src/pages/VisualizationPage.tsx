import React from 'react';
import { Box } from '@mui/material';
import { Link } from 'react-router-dom';
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { useVisualizationState } from '../hooks/useVisualizationState';
import { useVisualizationContext } from '../contexts/VisualizationContext';
import { useDragDrop } from '../hooks/useDragDrop';
import FieldsPanel from '../components/Visualization/FieldsPanel';
import ChartPanel from '../components/Visualization/ChartPanel';
import LoadingModal from '../components/LoadingModal';
import { apiService } from '../apiService';

import { Field, DragSource } from '../types';

const VisualizationPage = () => {
    const [fieldsSearch, setFieldsSearch] = React.useState('');
    
    const {
        connectionDetails,
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
        handleTableSelect
    } = useVisualizationState();

    // Access the enhanced context with loading states and cancellation
    const { state, cancelOperation } = useVisualizationContext();
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
        handleReorderFields
    } = useDragDrop();

    // Simplified axis-specific handlers that use the generic handler
    const handleXAxisDrop = (field: Field, source: DragSource, index?: number) => {
        handleAxisDrop('x', field, source, index);
    };

    const handleYAxisDrop = (field: Field, source: DragSource, index?: number) => {
        handleAxisDrop('y', field, source, index);
    };

    // Handle cancellation of long-running operations
    const handleCancelOperation = React.useCallback(() => {
        // Cancel API requests
        apiService.cancelAllRequests();
        
        // Update context state
        cancelOperation();
    }, [cancelOperation]);

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
                    <Panel defaultSize={25} minSize={10} maxSize={40}>
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

                    {/* Main Content */}
                    <Panel defaultSize={75} minSize={50}>
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

export default VisualizationPage;