import React from 'react';
import { PropertySection } from '../Properties';
import { PropertyDropZone } from '../Properties';
import PhotoSizeSelectLargeIcon from '@mui/icons-material/PhotoSizeSelectLarge';
import { useVisualizationContext } from '../../../contexts/VisualizationContext';
import { Chip, Box } from '@mui/material';

const SizePanelWithDropZone: React.FC = () => {
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
                            sx={{
                                backgroundColor: '#e3f2fd',
                                color: '#1976d2',
                                '& .MuiChip-deleteIcon': {
                                    color: '#1976d2'
                                }
                            }}
                        />
                    </Box>
                )}
            </PropertyDropZone>
        </PropertySection>
    );
};

export default SizePanelWithDropZone;