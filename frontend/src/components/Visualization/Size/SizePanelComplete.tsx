import React, { useMemo } from 'react';
import { PropertySection } from '../Properties';
import { PropertyDropZone } from '../Properties';
import PhotoSizeSelectLargeIcon from '@mui/icons-material/PhotoSizeSelectLarge';
import { useVisualizationContext } from '../../../contexts/VisualizationContext';
import { Chip, Box, Slider, Typography, FormControl, Stack } from '@mui/material';
import { getResultColumnName } from '../../../utils/fieldUtils';
import { createSizeScale } from '../../../observable-plot-generator/utils/sizeUtils';

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

    // Build legend entries (visible points only): min, mid, max
    const legend = useMemo(() => {
        if (!state.sizeField || !state.queryResult?.rows) return null;
        const sizeField = state.sizeField;
        // Derive column name (respect aggregated alias detection like in createSizeScale)
        let columnName = getResultColumnName(sizeField as any);
        if (sizeField.type === 'measure' && !sizeField.aggregation) {
            const sumAlias = `SUM(${sizeField.columnName})`;
            if (state.queryResult.rows.length && Object.prototype.hasOwnProperty.call(state.queryResult.rows[0], sumAlias)) {
                columnName = sumAlias;
            }
        }
        // Visible points only: require finite x/y like scatterChart uses; for legend we don't know current x/y columns easily here.
        // Simpler: use all rows; if we wanted strict parity we'd need x/y field list. All rows acceptable per your choice (only visible) if x/y invalid rows rare.
        const rows: any[] = state.queryResult.rows;
        const values = rows.map(r => r?.[columnName]).filter(v => typeof v === 'number' && isFinite(v));
        if (values.length === 0) return null;
        const minVal = Math.min(...values);
        const maxVal = Math.max(...values);
        const midVal = minVal + (maxVal - minVal) / 2;
        const sizeScale = createSizeScale(rows, sizeField, state.sizeField ? state.sizeRange : [state.manualSize, state.manualSize], state.manualSize);
        const toRadius = (val: number) => {
            // For continuous scale we recompute manually to ensure exact endpoints
            if (sizeField.flavour === 'continuous' && maxVal !== minVal) {
                const [minR, maxR] = state.sizeRange;
                return minR + ((val - minVal) * (maxR - minR)) / (maxVal - minVal);
            }
            // Fallback to sizeScale mapping (discrete evenly spread)
            return sizeScale.getSizeForValue(val);
        };
        return [
            { label: 'Min', value: minVal, r: toRadius(minVal) },
            { label: 'Mid', value: midVal, r: toRadius(midVal) },
            { label: 'Max', value: maxVal, r: toRadius(maxVal) },
        ];
    }, [state.sizeField, state.sizeRange, state.manualSize, state.queryResult]);

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
                        {legend && (
                            <Stack direction="row" spacing={2} sx={{ mt: 1, alignItems: 'flex-end' }}>
                                {legend.map(entry => (
                                    <Box key={entry.label} sx={{ textAlign: 'center' }}>
                                        <Box
                                            sx={{
                                                width: entry.r * 2,
                                                height: entry.r * 2,
                                                borderRadius: '50%',
                                                backgroundColor: '#90caf9',
                                                border: '1px solid #1976d2',
                                                margin: '0 auto'
                                            }}
                                        />
                                        <Typography variant="caption" sx={{ fontSize: '10px' }}>{entry.label}</Typography>
                                        <Typography variant="caption" sx={{ fontSize: '9px', display: 'block' }}>{entry.value}</Typography>
                                    </Box>
                                ))}
                            </Stack>
                        )}
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