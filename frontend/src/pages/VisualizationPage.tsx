import React from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { useVisualizationState } from '../hooks/useVisualizationState';
import FieldChip from '../components/Visualization/FieldChip';
import DropZone from '../components/Visualization/DropZone';
import DataSourcePanel from '../components/Visualization/DataSourcePanel';
import DropZones from '../components/Visualization/DropZones';
import ChartArea from '../components/Visualization/ChartArea';
import styles from './VisualizationPage.module.css';
import { Select, MenuItem, FormControl, InputLabel, CircularProgress, Alert, SelectChangeEvent } from '@mui/material';

function VisualizationPage() {
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
        handleTableSelect
    } = useVisualizationState();

    if (!connectionDetails) {
        return (
            <div className={styles.container}>
                <h2>Visualization</h2>
                <p>Please connect to a data source first on the 'Data Sources' page.</p>
            </div>
        );
    }

    return (
        <DndProvider backend={HTML5Backend}>
            <div className={styles.pageContainer}>
                <DataSourcePanel>
                    {connectionDetails.type === 'clickhouse' && (
                        <FormControl fullWidth>
                            <InputLabel>Database</InputLabel>
                            <Select value={selectedDatabase} label="Database" onChange={(e) => handleDatabaseSelect(e.target.value)}>
                                {databases.map(db => <MenuItem key={db.name} value={db.name}>{db.name}</MenuItem>)}
                            </Select>
                        </FormControl>
                    )}
                    <FormControl fullWidth disabled={tables.length === 0}>
                        <InputLabel>Table</InputLabel>
                        <Select value={selectedTable} label="Table" onChange={(e) => handleTableSelect(e.target.value)}>
                            {tables.map(tbl => <MenuItem key={tbl.name} value={tbl.name}>{tbl.name}</MenuItem>)}
                        </Select>
                    </FormControl>

                    {isLoadingMetadata && <CircularProgress />}
                    {metadataError && <Alert severity="error">{metadataError}</Alert>}

                    <div className={styles.fieldList}>
                        <h4>Available Fields</h4>
                        {availableFields.map(field => (
                            <FieldChip key={field.id} field={field} onUpdate={handleFieldUpdate} />
                        ))}
                    </div>
                </DataSourcePanel>

                <div className={styles.mainCanvas}>
                    <DropZones>
                        <DropZone onDrop={(item) => handleDrop('x', item)} axis="x">
                            <strong>X-Axis:</strong>
                            {xAxisFields.map(field => (
                                <FieldChip key={field.id} field={field} onUpdate={handleFieldUpdate} />
                            ))}
                        </DropZone>
                        <DropZone onDrop={(item) => handleDrop('y', item)} axis="y">
                            <strong>Y-Axis:</strong>
                            {yAxisFields.map(field => (
                                <FieldChip key={field.id} field={field} onUpdate={handleFieldUpdate} />
                            ))}
                        </DropZone>
                    </DropZones>
                    <ChartArea />
                </div>
            </div>
        </DndProvider>
    );
}

export default VisualizationPage; 