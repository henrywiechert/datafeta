import React from 'react';
import { PropertySection } from '../Properties';
import { PropertyDropZone } from '../Properties';
import PhotoSizeSelectLargeIcon from '@mui/icons-material/PhotoSizeSelectLarge';
import { useVisualizationContext } from '../../../contexts/VisualizationContext';
import { Chip, Box, Slider, Typography, FormControl } from '@mui/material';

const SizePanelComplete: React.FC = () => {
    const { state, dispatch } = useVisualizationContext();
    
    const handleSizeDrop = (e: React.DragEvent) => {
        try {
            const fieldData = e.dataTransfer.getData('application/json');
            if (fieldData) {
                const parsedData = JSON.parse(fieldData);
                const { field } = parsedData;
                
                if (field) {
                    dispatch({
                        type: 'SET_SIZE_FIELD',
                        payload: field
                    });
                }
            }
        } catch (error) {
            console.error('Error handling drop:', error);
        }
    };

    const handleRemoveFromSize = () => {
        dispatch({
            type: 'SET_SIZE_FIELD',
            payload: null
        });
    };

    const handleSizeRangeChange = (event: Event, newValue: number | number[]) => {
        if (Array.isArray(newValue)) {
            dispatch({
                type: 'SET_SIZE_RANGE',
                payload: [newValue[0], newValue[1]]
            });
        }
    };

    const handleManualSizeChange = (event: Event, newValue: number | number[]) => {
        if (typeof newValue === 'number') {
            dispatch({
                type: 'SET_MANUAL_SIZE',
                payload: newValue
            });
        }
    };

    // Get chip styling based on field flavour
    const getChipStyles = () => {
        if (!state.sizeField) return {};
        
        if (state.sizeField.flavour === 'discrete') {
            return {
                backgroundColor: '#e3f2fd',
                border: '1px solid #1976d2',
            };
        } else if (state.sizeField.flavour === 'continuous') {
            return {
                backgroundColor: '#e8f5e8',
                border: '1px solid #388e3c',
            };
        }
        return {
            backgroundColor: '#e3f2fd',
            border: '1px solid #1976d2',
        };
    };

    return (
        <PropertySection
            title="Size"
            icon={<PhotoSizeSelectLargeIcon fontSize="small" />}
            defaultExpanded={true}
            storageKey="sizePanel.expanded"
        >
            <PropertyDropZone
                hasContent={!!state.sizeField}
                emptyMessage="Drop a field here to control size"
                onDrop={handleSizeDrop}
            >
                {state.sizeField && (
                    <Box sx={{ p: 1 }}>
                        <Chip
                            label={state.sizeField.columnName}
                            onDelete={handleRemoveFromSize}
                            size="small"
                            sx={getChipStyles()}
                        />
                    </Box>
                )}
            </PropertyDropZone>
            
            {/* Size Range Controls */}
            <Box sx={{ mt: 2, px: 1 }}>
                {state.sizeField ? (
                    <FormControl fullWidth>
                        <Typography variant="caption" gutterBottom>
                            Size Range: {state.sizeRange[0]} - {state.sizeRange[1]}
                        </Typography>
                        <Slider
                            value={state.sizeRange}
                            onChange={handleSizeRangeChange}
                            valueLabelDisplay="auto"
                            min={1}
                            max={50}
                            step={1}
                            size="small"
                            sx={{ mt: 1 }}
                        />
                    </FormControl>
                ) : (
                    <FormControl fullWidth>
                        <Typography variant="caption" gutterBottom>
                            Manual Size: {state.manualSize}
                        </Typography>
                        <Slider
                            value={state.manualSize}
                            onChange={handleManualSizeChange}
                            valueLabelDisplay="auto"
                            min={1}
                            max={50}
                            step={1}
                            size="small"
                            sx={{ mt: 1 }}
                        />
                    </FormControl>
                )}
            </Box>
        </PropertySection>
    );
};

export default SizePanelComplete;