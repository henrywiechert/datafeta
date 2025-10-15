import React, { useMemo, useEffect } from 'react';
import { PropertySection } from '../Properties';
import { PropertyDropZone } from '../Properties';
import PhotoSizeSelectLargeIcon from '@mui/icons-material/PhotoSizeSelectLarge';
import { useVisualizationContext } from '../../../contexts/VisualizationContext';
import { Chip, Box, Slider, Typography, FormControl, Stack, Alert } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { getResultColumnName, getFieldDisplayName } from '../../../utils/fieldUtils';
import { createSizeScale } from '../../../observable-plot-generator/utils/sizeUtils';
import { getSizeFieldValueRange } from '../../../observable-plot-generator/chartTypes/barCore';
import { Field } from '../../../types';
import styles from './SizePanelComplete.module.css';

const SizePanelComplete: React.FC = () => {
    const { state, dispatch } = useVisualizationContext();
    
    // Detect if current chart configuration will produce bar charts
    // Bar charts can't vary individual bar widths - they use uniform band padding
    const isBarChartContext = useMemo(() => {
        const xFields = state.xAxisFields;
        const yFields = state.yAxisFields;
        if (xFields.length === 0 && yFields.length === 0) return false;
        
        // Bar charts occur when we have at least one measure and optionally dimensions
        const hasMeasure = [...xFields, ...yFields].some((f: Field) => f.type === 'measure');
        const hasOnlyDimensions = [...xFields, ...yFields].every((f: Field) => f.type === 'dimension');
        
        // If only dimensions (no measures), we get tick strips or dot plots, not bars
        if (hasOnlyDimensions) return false;
        
        // If we have measures, check if it's a bar chart scenario
        // Bar charts: measure on one axis, possibly with discrete dimension on other
        const xMeasures = xFields.filter((f: Field) => f.type === 'measure');
        const yMeasures = yFields.filter((f: Field) => f.type === 'measure');
        
        // Scatter/line charts: continuous measures on both axes OR continuous dimension + measure
        // These support individual point sizing
        if (xMeasures.length > 0 && yMeasures.length > 0) return false; // Scatter
        if (xMeasures.length > 0 && xFields.some((f: Field) => f.type === 'dimension' && f.flavour === 'continuous')) return false; // Line
        if (yMeasures.length > 0 && yFields.some((f: Field) => f.type === 'dimension' && f.flavour === 'continuous')) return false; // Line
        
        // Otherwise, if we have measures, it's likely a bar chart
        return hasMeasure;
    }, [state.xAxisFields, state.yAxisFields]);
    
    // Compute the actual value range from the data when a size field is present
    const fieldValueRange = useMemo(() => {
        if (!state.sizeField || !state.queryResult?.rows) return undefined;
        const range = getSizeFieldValueRange(state.queryResult.rows, state.sizeField);
        
        // Ensure valid range for slider (min < max, both finite)
        if (!range) return undefined;
        const [min, max] = range;
        if (!isFinite(min) || !isFinite(max) || min >= max) return undefined;
        
        return range;
    }, [state.sizeField, state.queryResult]);
    
    // Clamp sizeRange to fieldValueRange when the field or data changes
    useEffect(() => {
        if (state.sizeField && fieldValueRange) {
            const [minField, maxField] = fieldValueRange;
            const [minSize, maxSize] = state.sizeRange;
            
            // Only update if current range is outside the field range
            if (minSize < minField || maxSize > maxField || minSize > maxField || maxSize < minField) {
                // Reset to the full field range
                dispatch({
                    type: 'SET_SIZE_RANGE',
                    payload: [minField, maxField]
                });
            }
        }
    }, [state.sizeField, fieldValueRange]); // Intentionally exclude state.sizeRange and dispatch to avoid loops
    
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
                    
                    // Initialize sizeRange to the actual field value range
                    if (state.queryResult?.rows) {
                        const valueRange = getSizeFieldValueRange(state.queryResult.rows, field);
                        if (valueRange) {
                            dispatch({
                                type: 'SET_SIZE_RANGE',
                                payload: valueRange
                            });
                        }
                    }
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
        
        // Use a fixed reasonable pixel size range for the legend spheres (independent of data values)
        const LEGEND_SIZE_RANGE: [number, number] = [4, 12]; // Small to medium spheres
        const sizeScale = createSizeScale(rows, sizeField, state.sizeField ? state.sizeRange : [state.manualSize, state.manualSize], state.manualSize);
        
        const toRadius = (val: number) => {
            // For legend display, map to fixed pixel range for visual consistency
            if (sizeField.flavour === 'continuous' && maxVal !== minVal) {
                // Map data value proportionally to fixed legend size range
                const norm = (val - minVal) / (maxVal - minVal);
                return LEGEND_SIZE_RANGE[0] + norm * (LEGEND_SIZE_RANGE[1] - LEGEND_SIZE_RANGE[0]);
            }
            // Fallback to sizeScale mapping (discrete evenly spread), but clamp to legend range
            const r = sizeScale.getSizeForValue(val);
            return Math.max(LEGEND_SIZE_RANGE[0], Math.min(LEGEND_SIZE_RANGE[1], r));
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
                emptyMessage={isBarChartContext 
                    ? "Size controls available for scatter/line charts" 
                    : "Drop a field here to control point size"}
                onDrop={handleSizeDrop}
            >
                {state.sizeField && (
                    <Box className={styles.chipContainer}>
                        <Chip
                            label={getFieldDisplayName(state.sizeField)}
                            onDelete={handleRemoveFromSize}
                            deleteIcon={<CloseIcon />}
                            size="small"
                            className={styles.chip}
                            sx={{
                                ...getChipStyles(),
                                '& .MuiChip-label': {
                                    fontSize: '12px',
                                    fontWeight: 500,
                                },
                            }}
                        />
                    </Box>
                )}
            </PropertyDropZone>
            
            {/* Size Range Controls */}
            <Box sx={{ mt: 2, px: 1 }}>
                {state.sizeField ? (
                    <FormControl fullWidth>
                        <Typography variant="caption" gutterBottom>
                            Size Range: {state.sizeRange[0].toFixed(2)} - {state.sizeRange[1].toFixed(2)}
                        </Typography>
                        {fieldValueRange ? (
                            <>
                                <Slider
                                    value={state.sizeRange}
                                    onChange={handleSizeRangeChange}
                                    valueLabelDisplay="auto"
                                    min={fieldValueRange[0]}
                                    max={fieldValueRange[1]}
                                    step={(fieldValueRange[1] - fieldValueRange[0]) / 100}
                                    size="small"
                                    sx={{ mt: 1 }}
                                />
                                <Typography variant="caption" sx={{ fontSize: '10px', color: '#757575', mt: 0.5, display: 'block' }}>
                                    Field value range: {fieldValueRange[0].toFixed(2)} - {fieldValueRange[1].toFixed(2)}
                                </Typography>
                            </>
                        ) : (
                            <Typography variant="caption" sx={{ fontSize: '11px', color: '#f57c00', mt: 1, display: 'block' }}>
                                No valid values found for this field
                            </Typography>
                        )}
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
                                        <Typography variant="caption" sx={{ fontSize: '9px', display: 'block' }}>{entry.value.toFixed(2)}</Typography>
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