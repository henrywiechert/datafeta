import React from 'react';
import { Box } from '@mui/material';
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { useVisualizationState } from '../hooks/useVisualizationState';
import { useVisualizationContext } from '../contexts/VisualizationContext';
import { useDragDrop } from '../hooks/useDragDrop';
import MetadataSelector from '../components/Visualization/MetadataSelector';
import FieldsPanel from '../components/Visualization/FieldsPanel';
import ChartPanel from '../components/Visualization/ChartPanel';

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

    if (!connectionDetails) {
        return (
            <Box sx={{ p: 4, textAlign: 'center' }}>
                <h2>Visualization</h2>
                <p>Please connect to a data source first on the 'Data Sources' page.</p>
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
            {/* Top Bar with MetadataSelector component */}
            <MetadataSelector
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

            {/* Main Layout with react-resizable-panels */}
            <Box sx={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
                <PanelGroup direction="horizontal">
                    {/* Left Panel - Fields */}
                    <Panel defaultSize={25} minSize={10} maxSize={40}>
                        <FieldsPanel
                            availableFields={availableFields}
                            fieldsSearch={fieldsSearch}
                            onFieldsSearchChange={setFieldsSearch}
                            onFieldUpdate={handleFieldUpdate}
                            onRemoveFromAxis={handleRemoveFromAxis}
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
        </Box>
    );
};

export default VisualizationPage;