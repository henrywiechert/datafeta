import React, { useRef } from 'react';
import { DndProvider, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { Box, FormControl, InputLabel, Select, MenuItem, CircularProgress, Alert, Paper, Typography } from '@mui/material';
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { useVisualizationState } from '../hooks/useVisualizationState';
import FieldChip, { ItemTypes, FieldDragItem } from '../components/Visualization/FieldChip';
import DropZone from '../components/Visualization/DropZone';
import DropZones from '../components/Visualization/DropZones';
import ChartArea from '../components/Visualization/ChartArea';
import PropertiesPanel from '../components/Panels/PropertiesPanel';
import DataPreviewPanel from '../components/Panels/DataPreviewPanel';

const VisualizationLayoutWithLibrary = () => {
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
                <h2>Visualization (Using react-resizable-panels)</h2>
                <p>Please connect to a data source first on the 'Data Sources' page.</p>
            </Box>
        );
    }

    return (
        <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
            {/* Top Bar */}
            <Paper sx={{ p: 2, borderRadius: 0, borderBottom: 1, borderColor: 'divider' }}>
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                    <Typography variant="h6">Visualization (react-resizable-panels Demo)</Typography>
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
            </Paper>

            {/* Main Layout with react-resizable-panels */}
            <Box sx={{ flex: 1 }}>
                <PanelGroup direction="horizontal">
                    {/* Left Panel - Fields */}
                    <Panel defaultSize={25} minSize={20} maxSize={40}>
                        <Paper sx={{ height: '100%', borderRadius: 0 }}>
                            <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
                                <Typography variant="h6">Fields</Typography>
                            </Box>
                            <Box sx={{ p: 2, overflow: 'auto', height: 'calc(100% - 60px)' }}>
                                {availableFields.map(field => (
                                    <FieldChip 
                                        key={field.id} 
                                        field={field} 
                                        onUpdate={handleFieldUpdate} 
                                        source="AVAILABLE_FIELDS" 
                                    />
                                ))}
                            </Box>
                        </Paper>
                    </Panel>

                    <PanelResizeHandle />

                    {/* Middle Panel - Main Content */}
                    <Panel defaultSize={50} minSize={30}>
                        <PanelGroup direction="vertical">
                            {/* Main Visualization Area */}
                            <Panel defaultSize={70} minSize={40}>
                                <Box 
                                    ref={dropRef}
                                    sx={{ 
                                        height: '100%',
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
                            </Panel>

                            <PanelResizeHandle />

                            {/* Bottom Panel - Data Preview */}
                            <Panel defaultSize={30} minSize={20}>
                                <Paper sx={{ height: '100%', borderRadius: 0 }}>
                                    <Box sx={{ p: 1, borderBottom: 1, borderColor: 'divider' }}>
                                        <Typography variant="subtitle1">Data Preview</Typography>
                                    </Box>
                                    <Box sx={{ height: 'calc(100% - 40px)' }}>
                                        <DataPreviewPanel />
                                    </Box>
                                </Paper>
                            </Panel>
                        </PanelGroup>
                    </Panel>

                    <PanelResizeHandle />

                    {/* Right Panel - Properties */}
                    <Panel defaultSize={25} minSize={20} maxSize={40}>
                        <Paper sx={{ height: '100%', borderRadius: 0 }}>
                            <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
                                <Typography variant="h6">Properties</Typography>
                            </Box>
                            <Box sx={{ overflow: 'auto', height: 'calc(100% - 60px)' }}>
                                <PropertiesPanel />
                            </Box>
                        </Paper>
                    </Panel>
                </PanelGroup>
            </Box>
        </Box>
    );
};

function VisualizationPageLibrary() {
    return (
        <DndProvider backend={HTML5Backend}>
            <VisualizationLayoutWithLibrary />
        </DndProvider>
    );
}

export default VisualizationPageLibrary; 