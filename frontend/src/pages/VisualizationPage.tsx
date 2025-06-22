import React, { useRef } from 'react';
import { DndProvider, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { useVisualizationState } from '../hooks/useVisualizationState';
import FieldChip, { ItemTypes, FieldDragItem } from '../components/Visualization/FieldChip';
import DropZone from '../components/Visualization/DropZone';
import DataSourcePanel from '../components/Visualization/DataSourcePanel';
import DropZones from '../components/Visualization/DropZones';
import ChartArea from '../components/Visualization/ChartArea';
import styles from './VisualizationPage.module.css';
import { Select, MenuItem, FormControl, InputLabel, CircularProgress, Alert } from '@mui/material';

// The new layout component that contains all the DND-related logic and UI
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

    const dropRef = useRef<HTMLDivElement>(null);
    const [{ isOver }, drop] = useDrop(() => ({
        accept: ItemTypes.FIELD,
        drop: (item: FieldDragItem) => handleRemoveFromAxis(item),
        collect: (monitor) => ({ isOver: !!monitor.isOver() }),
    }));
    drop(dropRef);

    if (!connectionDetails) {
        return (
            <div className={styles.container}>
                <h2>Visualization</h2>
                <p>Please connect to a data source first on the 'Data Sources' page.</p>
            </div>
        );
    }

    return (
        <div className={styles.pageContainer}>
            <div ref={dropRef} className={styles.mainLayoutBox} style={{ backgroundColor: isOver ? '#ffebee' : 'transparent' }}>
                {/* Left Fields Panel */}
                <div className={styles.leftPanelBox}>
                    <DataSourcePanel>
                        <h4>Fields</h4>
                        {availableFields.map(field => (
                            <FieldChip key={field.id} field={field} onUpdate={handleFieldUpdate} source="AVAILABLE_FIELDS" />
                        ))}
                    </DataSourcePanel>
                </div>

                {/* Main Content Area */}
                <div className={styles.rightPanelBox}>
                    {/* Database and Table Selectors */}
                    <div className={styles.controlsContainer}>
                        {connectionDetails.type === 'clickhouse' && (
                            <FormControl className={styles.formControl}>
                                <InputLabel>Database</InputLabel>
                                <Select value={selectedDatabase} label="Database" onChange={(e) => handleDatabaseSelect(e.target.value)}>
                                    {databases.map(db => <MenuItem key={db.name} value={db.name}>{db.name}</MenuItem>)}
                                </Select>
                            </FormControl>
                        )}
                        <FormControl className={styles.formControl} disabled={tables.length === 0}>
                            <InputLabel>Table</InputLabel>
                            <Select value={selectedTable} label="Table" onChange={(e) => handleTableSelect(e.target.value)}>
                                {tables.map(tbl => <MenuItem key={tbl.name} value={tbl.name}>{tbl.name}</MenuItem>)}
                            </Select>
                        </FormControl>

                        {isLoadingMetadata && <CircularProgress />}
                        {metadataError && <Alert severity="error">{metadataError}</Alert>}
                    </div>

                    {/* Drop Zones and Chart Area */}
                    <div className={styles.mainCanvas}>
                        <DropZones>
                            <DropZone onDrop={(item, insertIndex) => handleDrop('x', item, insertIndex)} axis="x">
                                <strong>X-Axis:</strong>
                                {xAxisFields.map((field, index) => (
                                    <FieldChip key={field.id} field={field} onUpdate={handleFieldUpdate} source="X_AXIS" index={index} />
                                ))}
                            </DropZone>
                            <DropZone onDrop={(item, insertIndex) => handleDrop('y', item, insertIndex)} axis="y">
                                <strong>Y-Axis:</strong>
                                {yAxisFields.map((field, index) => (
                                    <FieldChip key={field.id} field={field} onUpdate={handleFieldUpdate} source="Y_AXIS" index={index} />
                                ))}
                            </DropZone>
                        </DropZones>
                        <ChartArea />
                    </div>
                </div>
            </div>
        </div>
    );
};

// The main page component is now just a wrapper for the DND provider
function VisualizationPage() {
    return (
        <DndProvider backend={HTML5Backend}>
            <VisualizationLayout />
        </DndProvider>
    );
}

export default VisualizationPage; 