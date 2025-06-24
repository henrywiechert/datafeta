import React from 'react';
import { Box, FormControl, InputLabel, Select, MenuItem, CircularProgress, Alert, Paper, Typography } from '@mui/material';
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { useVisualizationState } from '../hooks/useVisualizationState';
import { useVisualizationContext } from '../contexts/VisualizationContext';
import FieldChip, { DragSource } from '../components/Visualization/FieldChip/index';
import DropZone from '../components/Visualization/DropZone';
import ChartArea from '../components/Visualization/ChartArea';
import FieldsSearch from '../components/Visualization/FieldsSearch';

import { Field } from '../types';

const VisualizationPage = () => {
    const [isFieldsPanelDragOver, setIsFieldsPanelDragOver] = React.useState(false);
    const [fieldsSearch, setFieldsSearch] = React.useState('');
    const { dispatch } = useVisualizationContext();
    
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
        handleTableSelect,
        handleRemoveFromAxis,
        handleDropFromAvailableFields,
        handleReorderFields
    } = useVisualizationState();

    const handleDrop = (field: Field, source: DragSource, index?: number) => {
        // Only handle drops from available fields for now
        if (source === 'AVAILABLE_FIELDS') {
            // This will be handled by the individual drop zones
            return;
        }
    };

    const handleXAxisDrop = (field: Field, source: DragSource, index?: number) => {
        if (source === 'AVAILABLE_FIELDS') {
            handleDropFromAvailableFields('x', field.id, index);
        } else if (source === 'Y_AXIS') {
            // Move from Y-axis to X-axis: remove from Y, add to X
            const newYFields = yAxisFields.filter(f => f.id !== field.id);
            const newXFields = [...xAxisFields];
            
            if (index !== undefined) {
                newXFields.splice(index, 0, field);
            } else {
                newXFields.push(field);
            }
            
            // Update both axes
            dispatch({ type: 'SET_Y_AXIS_FIELDS', payload: newYFields });
            dispatch({ type: 'SET_X_AXIS_FIELDS', payload: newXFields });
        }
    };

    const handleYAxisDrop = (field: Field, source: DragSource, index?: number) => {
        if (source === 'AVAILABLE_FIELDS') {
            handleDropFromAvailableFields('y', field.id, index);
        } else if (source === 'X_AXIS') {
            // Move from X-axis to Y-axis: remove from X, add to Y
            const newXFields = xAxisFields.filter(f => f.id !== field.id);
            const newYFields = [...yAxisFields];
            
            if (index !== undefined) {
                newYFields.splice(index, 0, field);
            } else {
                newYFields.push(field);
            }
            
            // Update both axes
            dispatch({ type: 'SET_X_AXIS_FIELDS', payload: newXFields });
            dispatch({ type: 'SET_Y_AXIS_FIELDS', payload: newYFields });
        }
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
            {/* Top Bar */}
            <Paper sx={{ p: 2, borderRadius: 0, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                    <Typography variant="h6">Visualization</Typography>
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
            <Box sx={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
                <PanelGroup direction="horizontal">
                    {/* Left Panel - Fields */}
                    <Panel defaultSize={25} minSize={10} maxSize={40}>
                        <div style={{ 
                            height: '100%', 
                            display: 'flex', 
                            flexDirection: 'column',
                            overflow: 'hidden'
                        }}>
                            <div style={{ padding: '12px', borderBottom: '1px solid #ddd', flexShrink: 0 }}>
                                <Typography variant="h6">Fields</Typography>
                                <FieldsSearch value={fieldsSearch} onChange={setFieldsSearch} />
                            </div>
                            <div 
                                style={{ 
                                    padding: '8px', 
                                    overflowY: 'auto',
                                    overflowX: 'hidden',
                                    flex: 1,
                                    minHeight: 0,
                                    backgroundColor: isFieldsPanelDragOver ? 'rgba(244, 67, 54, 0.1)' : 'transparent',
                                    border: isFieldsPanelDragOver ? '2px dashed #f44336' : '2px dashed transparent',
                                    transition: 'all 0.2s ease',
                                }}
                                onDragOver={(e) => {
                                    e.preventDefault();
                                    e.dataTransfer.dropEffect = 'move';
                                    
                                    // Only show visual feedback for axis fields
                                    try {
                                        const data = JSON.parse(e.dataTransfer.getData('application/json'));
                                        if (data.source === 'X_AXIS' || data.source === 'Y_AXIS') {
                                            setIsFieldsPanelDragOver(true);
                                        }
                                    } catch (error) {
                                        // Ignore parsing errors during drag over
                                    }
                                }}
                                onDragLeave={(e) => {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    const x = e.clientX;
                                    const y = e.clientY;
                                    
                                    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
                                        setIsFieldsPanelDragOver(false);
                                    }
                                }}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    setIsFieldsPanelDragOver(false);
                                    
                                    try {
                                        const data = JSON.parse(e.dataTransfer.getData('application/json'));
                                        const { field, source } = data;
                                        
                                        // Only remove if dragging from an axis (not from available fields)
                                        if (source === 'X_AXIS' || source === 'Y_AXIS') {
                                            handleRemoveFromAxis(field.id);
                                        }
                                    } catch (error) {
                                        console.error('Error parsing drag data:', error);
                                    }
                                }}
                            >
                                {/* Dimensions Section */}
                                <Box sx={{ mb: 2 }}>
                                    <Typography variant="subtitle2" sx={{ mb: 0.5, color: 'text.secondary', fontWeight: 'bold' }}>
                                        Dimensions
                                    </Typography>
                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                                        {availableFields
                                            .filter(field => field.type === 'dimension')
                                            .filter(field =>
                                                field.columnName.toLowerCase().includes(fieldsSearch.toLowerCase()) ||
                                                (field.aggregation && field.aggregation.toLowerCase().includes(fieldsSearch.toLowerCase())) ||
                                                (field.dataType && field.dataType.toLowerCase().includes(fieldsSearch.toLowerCase()))
                                            )
                                            .map(field => (
                                                <FieldChip 
                                                    key={`${field.id}-${field.type}-${field.flavour}-${field.dataType}-${field.aggregation || 'none'}`} 
                                                    field={field} 
                                                    onUpdate={handleFieldUpdate} 
                                                    source="AVAILABLE_FIELDS" 
                                                />
                                            ))
                                        }
                                        {availableFields.filter(field => field.type === 'dimension')
                                            .filter(field =>
                                                field.columnName.toLowerCase().includes(fieldsSearch.toLowerCase()) ||
                                                (field.aggregation && field.aggregation.toLowerCase().includes(fieldsSearch.toLowerCase())) ||
                                                (field.dataType && field.dataType.toLowerCase().includes(fieldsSearch.toLowerCase()))
                                            ).length === 0 && (
                                            <Typography variant="body2" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>
                                                No dimensions available
                                            </Typography>
                                        )}

 
                                    </Box>
                                </Box>

                                {/* Measures Section */}
                                <Box>
                                    <Typography variant="subtitle2" sx={{ mb: 0.5, color: 'text.secondary', fontWeight: 'bold' }}>
                                        Measures
                                    </Typography>
                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                                        {availableFields
                                            .filter(field => field.type === 'measure')
                                            .filter(field =>
                                                field.columnName.toLowerCase().includes(fieldsSearch.toLowerCase()) ||
                                                (field.aggregation && field.aggregation.toLowerCase().includes(fieldsSearch.toLowerCase())) ||
                                                (field.dataType && field.dataType.toLowerCase().includes(fieldsSearch.toLowerCase()))
                                            )
                                            .map(field => (
                                                <FieldChip 
                                                    key={`${field.id}-${field.type}-${field.flavour}-${field.dataType}-${field.aggregation || 'none'}`} 
                                                    field={field} 
                                                    onUpdate={handleFieldUpdate} 
                                                    source="AVAILABLE_FIELDS" 
                                                />
                                            ))
                                        }
                                        {availableFields.filter(field => field.type === 'measure')
                                            .filter(field =>
                                                field.columnName.toLowerCase().includes(fieldsSearch.toLowerCase()) ||
                                                (field.aggregation && field.aggregation.toLowerCase().includes(fieldsSearch.toLowerCase())) ||
                                                (field.dataType && field.dataType.toLowerCase().includes(fieldsSearch.toLowerCase()))
                                            ).length === 0 && (
                                            <Typography variant="body2" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>
                                                No measures available
                                            </Typography>
                                        )}

                                    </Box>
                                </Box>
                            </div>
                        </div>
                    </Panel>

                    <PanelResizeHandle />

                    {/* Main Content */}
                    <Panel defaultSize={75} minSize={50}>
                        <Box sx={{ height: '100%', p: 2 }}>
                            <Box sx={{ mb: 2 }}>
                                <DropZone 
                                    onDrop={handleXAxisDrop}
                                    axis="x"
                                    fields={xAxisFields}
                                    onFieldUpdate={handleFieldUpdate}
                                    onRemoveField={handleRemoveFromAxis}
                                    onReorderFields={handleReorderFields}
                                >
                                    X-Axis:
                                </DropZone>
                            </Box>
                            <Box sx={{ mb: 2 }}>
                                <DropZone 
                                    onDrop={handleYAxisDrop}
                                    axis="y"
                                    fields={yAxisFields}
                                    onFieldUpdate={handleFieldUpdate}
                                    onRemoveField={handleRemoveFromAxis}
                                    onReorderFields={handleReorderFields}
                                >
                                    Y-Axis:
                                </DropZone>
                            </Box>
                            <ChartArea />
                        </Box>
                    </Panel>
                </PanelGroup>
            </Box>


        </Box>
    );
};

export default VisualizationPage;