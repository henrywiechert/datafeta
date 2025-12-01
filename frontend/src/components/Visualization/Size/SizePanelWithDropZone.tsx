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
                
                // Handle unified payload format (always arrays) and legacy format
                let fields = parsedData.fields;
                
                // Backward compatibility: normalize legacy single-field format
                if (!fields && parsedData.field) {
                    fields = [parsedData.field];
                }
                
                // For size, only take the first field (single field only)
                if (fields && fields.length > 0) {
                    dispatch({
                        type: 'SET_SIZE_FIELD',
                        payload: fields[0]
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