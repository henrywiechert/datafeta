import React, { useRef } from 'react';
import { DndProvider, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { Box, FormControl, InputLabel, Select, MenuItem, CircularProgress, Alert } from '@mui/material';
import { useVisualizationState } from '../hooks/useVisualizationState';
import { useLayout } from '../contexts/LayoutContext';
import { LayoutProvider } from '../contexts/LayoutContext';
import FieldChip, { ItemTypes, FieldDragItem } from '../components/Visualization/FieldChip';
import DropZone from '../components/Visualization/DropZone';
import DropZones from '../components/Visualization/DropZones';
import ChartArea from '../components/Visualization/ChartArea';
import AppLayout from '../components/Layout/AppLayout';
import PanelToolbar from '../components/Layout/PanelToolbar';
import PropertiesPanel from '../components/Panels/PropertiesPanel';
import DataPreviewPanel from '../components/Panels/DataPreviewPanel';

const VisualizationLayout = () => {
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
        handleDrop,
        handleFieldUpdate,
        handleDatabaseSelect,
        handleTableSelect,
        handleRemoveFromAxis
    } = useVisualizationState();

    const { layoutState } = useLayout();

    const dropRef = useRef<HTMLDivElement>(null);
    const [{ isOver }, drop] = useDrop(() => ({
        accept: ItemTypes.FIELD,
        drop: (item: FieldDragItem) => handleRemoveFromAxis(item),
        collect: (monitor) => ({ isOver: !!monitor.isOver() }),
    }));
    drop(dropRef);

    if (!connectionDetails) {
        return (
            <Box sx={{ p: 4, textAlign: 'center' }}>
                <h2>Visualization</h2>
                <p>Please connect to a data source first on the 'Data Sources' page.</p>
            </Box>
        );
    }

    // Create panel content components
    const panelContent = {
        fields: (
            <Box>
                {availableFields.map(field => (
                    <FieldChip 
                        key={field.id} 
                        field={field} 
                        onUpdate={handleFieldUpdate} 
                        source="AVAILABLE_FIELDS" 
                    />
                ))}
            </Box>
        ),
        properties: (
            <PropertiesPanel 
                selectedChart="bar"
                onChartTypeChange={(type) => console.log('Chart type changed:', type)}
            />
        ),
        dataPreview: (
            <DataPreviewPanel 
                onRefresh={() => console.log('Refreshing data...')}
                onExport={() => console.log('Exporting data...')}
            />
        ),
        filters: (
            <Box sx={{ p: 2 }}>
                <Box sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
                    Filters panel - Coming soon!
                </Box>
                <Box sx={{ mt: 2 }}>
                    This is where filter controls would go:
                    <ul>
                        <li>Date range picker</li>
                        <li>Category filters</li>
                        <li>Value range sliders</li>
                        <li>Custom SQL filters</li>
                    </ul>
                </Box>
            </Box>
        )
    };

    // Build panels array dynamically based on layout state
    const panels = Object.values(layoutState.panels)
        .filter(panel => panel.visible)
        .map(panel => ({
            id: panel.id,
            title: panel.title,
            position: panel.position,
            width: panel.width,
            content: panelContent[panel.id as keyof typeof panelContent] || <div>Panel content not found</div>
        }));

    // Top bar with panel controls and data selectors
    const topBar = (
        <Box>
            <PanelToolbar />
            <Box sx={{ display: 'flex', gap: 2, p: 2, alignItems: 'center' }}>
                {connectionDetails.type === 'clickhouse' && (
                    <FormControl sx={{ minWidth: 200 }}>
                        <InputLabel>Database</InputLabel>
                        <Select 
                            value={selectedDatabase} 
                            label="Database" 
                            onChange={(e) => handleDatabaseSelect(e.target.value)}
                        >
                            {databases.map(db => (
                                <MenuItem key={db.name} value={db.name}>
                                    {db.name}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                )}
                <FormControl sx={{ minWidth: 200 }} disabled={tables.length === 0}>
                    <InputLabel>Table</InputLabel>
                    <Select 
                        value={selectedTable} 
                        label="Table" 
                        onChange={(e) => handleTableSelect(e.target.value)}
                    >
                        {tables.map(tbl => (
                            <MenuItem key={tbl.name} value={tbl.name}>
                                {tbl.name}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>
                {isLoadingMetadata && <CircularProgress size={24} />}
                {metadataError && <Alert severity="error">{metadataError}</Alert>}
            </Box>
        </Box>
    );

    // Main content area
    const mainContent = (
        <Box 
            ref={dropRef} 
            sx={{ 
                flex: 1, 
                p: 2,
                backgroundColor: isOver ? '#ffebee' : 'transparent'
            }}
        >
            <DropZones>
                <DropZone onDrop={(item, insertIndex) => handleDrop('x', item, insertIndex)} axis="x">
                    <strong>X-Axis:</strong>
                    {xAxisFields.map((field, index) => (
                        <FieldChip 
                            key={field.id} 
                            field={field} 
                            onUpdate={handleFieldUpdate} 
                            source="X_AXIS" 
                            index={index} 
                        />
                    ))}
                </DropZone>
                <DropZone onDrop={(item, insertIndex) => handleDrop('y', item, insertIndex)} axis="y">
                    <strong>Y-Axis:</strong>
                    {yAxisFields.map((field, index) => (
                        <FieldChip 
                            key={field.id} 
                            field={field} 
                            onUpdate={handleFieldUpdate} 
                            source="Y_AXIS" 
                            index={index} 
                        />
                    ))}
                </DropZone>
            </DropZones>
            <ChartArea />
        </Box>
    );

    return (
        <AppLayout 
            panels={panels} 
            topBar={topBar}
            title="DataFeta - Visualization"
        >
            {mainContent}
        </AppLayout>
    );
};

function VisualizationPageNew() {
    return (
        <LayoutProvider>
            <DndProvider backend={HTML5Backend}>
                <VisualizationLayout />
            </DndProvider>
        </LayoutProvider>
    );
}

export default VisualizationPageNew; 