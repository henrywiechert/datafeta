import React, { useMemo, useState } from 'react';
import { Box, Typography, TextField, MenuItem, Chip, IconButton, Tooltip, Divider, ToggleButton, ToggleButtonGroup, Switch, FormControlLabel } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import TuneIcon from '@mui/icons-material/Tune';
import RefreshIcon from '@mui/icons-material/Refresh';
import { PropertySection, PropertyDropZone } from '../Properties';
import { useVisualizationContext } from '../../../contexts/VisualizationContext';
import { useUndoRedo } from '../../../contexts/UndoRedoContext';
import { Field, FieldOverrideState, DataLabelMode, DragSource } from '../../../types';
import { computeOverrideTargets } from '../../../observable-plot-generator/utils/fieldOverrides';
import { getFieldDisplayName } from '../../../utils/fieldUtils';
import ManualColorSelector from '../Color/ManualColorSelector';
import ColorSchemeSelector from '../Color/ColorSchemeSelector';
import ColorBiasControl from '../Color/ColorBiasControl';
import SizeRangeControl from '../Size/SizeRangeControl';

const LABEL_MODE_OPTIONS: { value: DataLabelMode; label: string }[] = [
  { value: 'inherit', label: 'Inherit' },
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
];

const CHIP_BASE_SX = {
  maxWidth: '100%',
  minWidth: 0,
  display: 'inline-flex',
  flexShrink: 1,
  overflow: 'hidden',
} as const;

const CHIP_LABEL_SX = {
  fontSize: '12px',
  fontWeight: 500,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: '100%',
  display: 'block',
  minWidth: 0,
} as const;

const FieldOverridesPanel: React.FC = () => {
  const { state, dispatch, getUndoableSnapshot } = useVisualizationContext();
  const { recordAction } = useUndoRedo();

  const {
    xAxisFields,
    yAxisFields,
    availableFields,
    filterFields,
    fieldOverrides,
    colorField,
    colorScheme,
    colorBias,
    manualColor,
    sizeField,
    sizeRange,
    manualSize,
    labelFields,
    labelsEnabled,
    labelSamplingStrategy,
    labelSamplingThreshold,
    labelSampleEvery,
  } = state as any;

  const [expandedId, setExpandedId] = useState<string | null>('__all__');

  const targets = useMemo(
    () => computeOverrideTargets(xAxisFields as Field[], yAxisFields as Field[]),
    [xAxisFields, yAxisFields]
  );

  // Build a lookup of all known fields by id to resolve override references
  // Include fields from ALL sources: axes, filters, available, and currently selected color/size fields
  const fieldById = useMemo(() => {
    const all: Field[] = [
      ...(xAxisFields as Field[]), 
      ...(yAxisFields as Field[]), 
      ...(filterFields as Field[]),
      ...(availableFields as Field[])
    ];
    // Also include current color and size fields if they exist
    if (colorField) all.push(colorField as Field);
    if (sizeField) all.push(sizeField as Field);
    
    const map: Record<string, Field> = {};
    for (const f of all) {
      if (!map[f.id]) {
        map[f.id] = f;
      }
    }
    return map;
  }, [xAxisFields, yAxisFields, filterFields, availableFields, colorField, sizeField]);

  const allSizeCandidateFields = useMemo(
    () =>
      Object.values(fieldById).filter(
        (f) => f.type === 'dimension' || f.type === 'measure'
      ),
    [fieldById]
  );

  const allColorCandidateFields = useMemo(
    () =>
      Object.values(fieldById).filter(
        (f) => f.type === 'dimension' || f.type === 'measure'
      ),
    [fieldById]
  );

  const rows = useMemo(
    () => {
      const fieldRows = targets.map((t) => ({
        id: t.field.id,
        label: t.field.columnName,
        axis: t.axis as 'x' | 'y',
        field: t.field as Field,
      }));
      return [
        { id: '__all__', label: 'All', axis: undefined as 'x' | 'y' | undefined, field: undefined as unknown as Field },
        ...fieldRows,
      ];
    },
    [targets]
  );

  const handleUpdateOverride = (fieldId: string, patch: Partial<FieldOverrideState>) => {
    recordAction(getUndoableSnapshot());
    dispatch({
      type: 'UPDATE_FIELD_OVERRIDE',
      payload: { fieldId, override: patch },
    });
  };

  const handleClearOverride = (fieldId: string) => {
    recordAction(getUndoableSnapshot());
    dispatch({
      type: 'CLEAR_FIELD_OVERRIDE',
      payload: { fieldId },
    });
  };

  const renderFieldBody = (targetField: Field, axis: 'x' | 'y') => {
    const override: FieldOverrideState = fieldOverrides[targetField.id] || {};

    // Prefer the stored field object over the lookup
    const resolvedColorField = override.colorField || (override.colorFieldId ? fieldById[override.colorFieldId] || null : null);
    const resolvedSizeField = override.sizeField || (override.sizeFieldId ? fieldById[override.sizeFieldId] || null : null);

    const effectiveManualColor = override.manualColor || '#4e79a7';
    const effectiveColorScheme = override.colorScheme || colorScheme || 'tableau10';
    const effectiveColorBias = override.colorBias ?? colorBias ?? 0;
    const sizeRange: [number, number] = override.sizeRange || [4, 20];
    const manualSize = override.manualSize ?? 10;

    const handleLabelModeChange = (_: React.MouseEvent<HTMLElement>, value: DataLabelMode | null) => {
      if (!value) return;
      handleUpdateOverride(targetField.id, { dataLabelMode: value });
    };

    const handleColorDrop = (e: React.DragEvent) => {
      try {
        const fieldData = e.dataTransfer.getData('application/json');
        if (fieldData) {
          const parsedData = JSON.parse(fieldData);
          const { field } = parsedData;
          if (field) {
            // Store the colorField object directly, not just the ID
            handleUpdateOverride(targetField.id, { 
              colorFieldId: field.id,
              colorField: field  // Store the actual field object
            });
          }
        }
      } catch (error) {
        console.error('Error handling color drop:', error);
      }
    };

    const handleColorRemove = () => {
      handleUpdateOverride(targetField.id, { colorFieldId: null, colorField: null });
    };

    const handleSizeDrop = (e: React.DragEvent) => {
      try {
        const fieldData = e.dataTransfer.getData('application/json');
        if (fieldData) {
          const parsedData = JSON.parse(fieldData);
          const { field } = parsedData;
          if (field) {
            // Store the sizeField object directly, not just the ID
            handleUpdateOverride(targetField.id, { 
              sizeFieldId: field.id,
              sizeField: field  // Store the actual field object
            });
          }
        }
      } catch (error) {
        console.error('Error handling size drop:', error);
      }
    };

    const handleSizeRemove = () => {
      handleUpdateOverride(targetField.id, { sizeFieldId: null, sizeField: null });
    };

    const handleLabelDrop = (e: React.DragEvent) => {
      try {
        const fieldData = e.dataTransfer.getData('application/json');
        if (fieldData) {
          const parsedData = JSON.parse(fieldData);
          const { field } = parsedData;
          if (field) {
            // Add field to labelFields array (support multiple fields)
            const currentLabelFields = override.labelFields || [];
            // Avoid duplicates
            if (!currentLabelFields.some((f: Field) => f.id === field.id)) {
              handleUpdateOverride(targetField.id, {
                labelFields: [...currentLabelFields, field],
              });
            }
          }
        }
      } catch (error) {
        console.error('Error handling label drop:', error);
      }
    };

    const handleLabelRemove = (fieldIdToRemove: string) => {
      const currentLabelFields = override.labelFields || [];
      const updatedLabelFields = currentLabelFields.filter((f: Field) => f.id !== fieldIdToRemove);
      handleUpdateOverride(targetField.id, {
        labelFields: updatedLabelFields.length > 0 ? updatedLabelFields : undefined,
      });
    };

    const getChipStyles = (field: Field) => {
      if (field.flavour === 'discrete') {
        return {
          backgroundColor: '#e3f2fd',
          border: '1px solid #1976d2',
        };
      } else if (field.flavour === 'continuous') {
        return {
          backgroundColor: '#e8f5e8',
          border: '1px solid #388e3c',
        };
      }
      return {};
    };

    return (
      <>
        {/* Color override with drop zone */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="caption" sx={{ minWidth: 60 }}>
              Color
            </Typography>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <PropertyDropZone
                hasContent={resolvedColorField !== null}
                emptyMessage="Drag a field or use manual color"
                onDrop={handleColorDrop}
              >
                {resolvedColorField && (
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.5,
                      minWidth: 0,
                      width: '100%',
                    }}
                  >
                    <Chip
                      label={getFieldDisplayName(resolvedColorField)}
                      title={getFieldDisplayName(resolvedColorField)}
                      onDelete={handleColorRemove}
                      deleteIcon={<CloseIcon />}
                      size="small"
                      sx={{
                        ...CHIP_BASE_SX,
                        ...getChipStyles(resolvedColorField),
                        '& .MuiChip-label': {
                          ...CHIP_LABEL_SX,
                        },
                      }}
                    />
                  </Box>
                )}
              </PropertyDropZone>
            </Box>
            {resolvedColorField && (
              <ColorSchemeSelector
                currentSchemeId={effectiveColorScheme}
                fieldFlavour={resolvedColorField.flavour}
                onSchemeChange={(schemeId) =>
                  handleUpdateOverride(targetField.id, {
                    colorScheme: schemeId,
                  })
                }
              />
            )}
            {!resolvedColorField && (
              <ManualColorSelector
                value={effectiveManualColor}
                onChange={(color) =>
                  handleUpdateOverride(targetField.id, {
                    manualColor: color,
                  })
                }
              />
            )}
          </Box>
          {resolvedColorField && resolvedColorField.flavour === 'continuous' && (
            <ColorBiasControl
              colorBias={effectiveColorBias}
              onChange={(bias) =>
                handleUpdateOverride(targetField.id, {
                  colorBias: bias,
                })
              }
            />
          )}
        </Box>

        <Divider sx={{ my: 1 }} />

        {/* Size override with drop zone */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="caption" sx={{ minWidth: 60 }}>
              Size
            </Typography>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <PropertyDropZone
                hasContent={resolvedSizeField !== null}
                emptyMessage="Drag a field or use manual size"
                onDrop={handleSizeDrop}
              >
                {resolvedSizeField && (
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.5,
                      minWidth: 0,
                      width: '100%',
                    }}
                  >
                    <Chip
                      label={getFieldDisplayName(resolvedSizeField)}
                      title={getFieldDisplayName(resolvedSizeField)}
                      onDelete={handleSizeRemove}
                      deleteIcon={<CloseIcon />}
                      size="small"
                      sx={{
                        ...CHIP_BASE_SX,
                        backgroundColor: '#f5f5f5',
                        border: '1px solid #bdbdbd',
                        '& .MuiChip-label': {
                          ...CHIP_LABEL_SX,
                        },
                      }}
                    />
                  </Box>
                )}
              </PropertyDropZone>
            </Box>
          </Box>
        </Box>
        <SizeRangeControl
          sizeField={resolvedSizeField}
          sizeRange={sizeRange}
          manualSize={manualSize}
          onSizeRangeChange={(range) =>
            handleUpdateOverride(targetField.id, {
              sizeRange: range,
            })
          }
          onManualSizeChange={(value) =>
            handleUpdateOverride(targetField.id, {
              manualSize: value,
            })
          }
        />

        <Divider sx={{ my: 1 }} />

        {/* Label overrides */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="caption" sx={{ minWidth: 60 }}>
              Label
            </Typography>
            <TextField
              size="small"
              variant="outlined"
              label="Display label"
              value={override.displayLabel ?? ''}
              onChange={(e) =>
                handleUpdateOverride(targetField.id, {
                  displayLabel: e.target.value || undefined,
                })
              }
              sx={{ flex: 1, minWidth: 0 }}
            />
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="caption" sx={{ minWidth: 60 }}>
              Label fields
            </Typography>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <PropertyDropZone
                hasContent={(override.labelFields?.length || 0) > 0}
                emptyMessage="Drag fields to show as labels"
                onDrop={handleLabelDrop}
              >
                {override.labelFields && override.labelFields.length > 0 && (
                  <Box
                    sx={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 0.5,
                      minWidth: 0,
                      width: '100%',
                    }}
                  >
                    {override.labelFields.map((field: Field) => {
                      const labelText = getFieldDisplayName(field);
                      return (
                        <Chip
                          key={field.id}
                          label={labelText}
                          title={labelText}
                          onDelete={() => handleLabelRemove(field.id)}
                          deleteIcon={<CloseIcon />}
                          size="small"
                          sx={{
                            ...CHIP_BASE_SX,
                            backgroundColor: '#fff3e0',
                            border: '1px solid #ff9800',
                            '& .MuiChip-label': {
                              ...CHIP_LABEL_SX,
                            },
                          }}
                        />
                      );
                    })}
                  </Box>
                )}
              </PropertyDropZone>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="caption" sx={{ minWidth: 60 }}>
              Data labels
            </Typography>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={override.dataLabelMode ?? 'inherit'}
              onChange={handleLabelModeChange}
            >
              {LABEL_MODE_OPTIONS.map((opt) => (
                <ToggleButton key={opt.value} value={opt.value}>
                  <Typography variant="caption">{opt.label}</Typography>
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Box>
        </Box>
      </>
    );
  };

  const clearColorOverridesForAllFields = () => {
    const next: typeof fieldOverrides = {};
    Object.entries(fieldOverrides || {}).forEach(([id, override]: any) => {
      const { colorFieldId, colorScheme, colorBias, manualColor, ...rest } = override || {};
      next[id] = rest;
    });
    dispatch({ type: 'SET_FIELD_OVERRIDES', payload: next });
  };

  const clearSizeOverridesForAllFields = () => {
    const next: typeof fieldOverrides = {};
    Object.entries(fieldOverrides || {}).forEach(([id, override]: any) => {
      const { sizeFieldId, sizeRange, manualSize, ...rest } = override || {};
      next[id] = rest;
    });
    dispatch({ type: 'SET_FIELD_OVERRIDES', payload: next });
  };

  const clearLabelOverridesForAllFields = () => {
    const next: typeof fieldOverrides = {};
    Object.entries(fieldOverrides || {}).forEach(([id, override]: any) => {
      const { labelFields, ...rest } = override || {};
      next[id] = rest;
    });
    dispatch({ type: 'SET_FIELD_OVERRIDES', payload: next });
  };

  const renderAllBody = () => {
    const resolvedGlobalColorField = colorField as Field | null;
    const resolvedGlobalSizeField = sizeField as Field | null;

    const effectiveManualColor = manualColor || '#4e79a7';
    const effectiveColorScheme = colorScheme || 'tableau10';
    const effectiveColorBias = colorBias ?? 0;

    const handleGlobalColorDrop = (e: React.DragEvent) => {
      try {
        const fieldData = e.dataTransfer.getData('application/json');
        if (fieldData) {
          const parsedData = JSON.parse(fieldData);
          const { field, source } = parsedData;
          if (field) {
            recordAction(getUndoableSnapshot());
            clearColorOverridesForAllFields();
            dispatch({ type: 'SET_COLOR_FIELD', payload: field });
          }
        }
      } catch (error) {
        console.error('Error handling color drop:', error);
      }
    };

    const handleGlobalColorRemove = () => {
      recordAction(getUndoableSnapshot());
      clearColorOverridesForAllFields();
      dispatch({ type: 'SET_COLOR_FIELD', payload: null });
    };

    const handleGlobalManualColorChange = (color: string) => {
      recordAction(getUndoableSnapshot());
      clearColorOverridesForAllFields();
      dispatch({ type: 'SET_MANUAL_COLOR', payload: color });
    };

    const handleGlobalColorSchemeChange = (schemeId: string) => {
      recordAction(getUndoableSnapshot());
      clearColorOverridesForAllFields();
      dispatch({ type: 'SET_COLOR_SCHEME', payload: schemeId });
    };

    const handleGlobalColorBiasChange = (bias: number) => {
      recordAction(getUndoableSnapshot());
      clearColorOverridesForAllFields();
      dispatch({ type: 'SET_COLOR_BIAS', payload: bias });
    };

    const handleGlobalSizeDrop = (e: React.DragEvent) => {
      try {
        const fieldData = e.dataTransfer.getData('application/json');
        if (fieldData) {
          const parsedData = JSON.parse(fieldData);
          const { field } = parsedData;
          if (field) {
            recordAction(getUndoableSnapshot());
            clearSizeOverridesForAllFields();
            dispatch({ type: 'SET_SIZE_FIELD', payload: field });
          }
        }
      } catch (error) {
        console.error('Error handling size drop:', error);
      }
    };

    const handleGlobalSizeRemove = () => {
      recordAction(getUndoableSnapshot());
      clearSizeOverridesForAllFields();
      dispatch({ type: 'SET_SIZE_FIELD', payload: null });
    };

    const handleGlobalSizeRangeChange = (range: [number, number]) => {
      recordAction(getUndoableSnapshot());
      // Changing the global size range should not reset per-field size overrides.
      // Clearing overrides here caused additionalSizeFields array identity to change,
      // which in turn retriggered queries unnecessarily on mouse-up of the size slider.
      // We only update the global size range now.
      dispatch({ type: 'SET_SIZE_RANGE', payload: range });
    };

    const handleGlobalManualSizeChange = (value: number) => {
      recordAction(getUndoableSnapshot());
      // Changing the global manual size should not reset per-field size overrides.
      // Resetting overrides invalidated additionalSizeFields causing a query re-run.
      dispatch({ type: 'SET_MANUAL_SIZE', payload: value });
    };

    const handleGlobalLabelsEnabledChange = (checked: boolean) => {
      recordAction(getUndoableSnapshot());
      dispatch({ type: 'SET_LABELS_ENABLED', payload: checked });
    };

    const handleGlobalLabelDrop = (e: React.DragEvent) => {
      try {
        const fieldData = e.dataTransfer.getData('application/json');
        if (fieldData) {
          const parsedData = JSON.parse(fieldData);
          const { field } = parsedData;
          if (field) {
            recordAction(getUndoableSnapshot());
            clearLabelOverridesForAllFields();
            // Add field to global labelFields array
            const currentLabelFields = labelFields as Field[] || [];
            // Avoid duplicates
            if (!currentLabelFields.some((f: Field) => f.id === field.id)) {
              dispatch({ type: 'SET_LABEL_FIELDS', payload: [...currentLabelFields, field] });
            }
          }
        }
      } catch (error) {
        console.error('Error handling global label drop:', error);
      }
    };

    const handleGlobalLabelRemove = (fieldIdToRemove: string) => {
      recordAction(getUndoableSnapshot());
      clearLabelOverridesForAllFields();
      const currentLabelFields = labelFields as Field[] || [];
      const updatedLabelFields = currentLabelFields.filter((f: Field) => f.id !== fieldIdToRemove);
      dispatch({ type: 'SET_LABEL_FIELDS', payload: updatedLabelFields });
    };

    const getChipStyles = (field: Field) => {
      if (field.flavour === 'discrete') {
        return {
          backgroundColor: '#e3f2fd',
          border: '1px solid #1976d2',
        };
      } else if (field.flavour === 'continuous') {
        return {
          backgroundColor: '#e8f5e8',
          border: '1px solid #388e3c',
        };
      }
      return {};
    };

    return (
      <Box sx={{ p: 1, pt: 0.5, pb: 0.5 }}>
        {/* Color (global) with drop zone */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="caption" sx={{ minWidth: 60 }}>
              Color
            </Typography>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <PropertyDropZone
                hasContent={resolvedGlobalColorField !== null}
                emptyMessage="Drag a field or use manual color"
                onDrop={handleGlobalColorDrop}
              >
                {resolvedGlobalColorField && (
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.5,
                      minWidth: 0,
                      width: '100%',
                    }}
                  >
                    <Chip
                      label={getFieldDisplayName(resolvedGlobalColorField)}
                      title={getFieldDisplayName(resolvedGlobalColorField)}
                      onDelete={handleGlobalColorRemove}
                      deleteIcon={<CloseIcon />}
                      size="small"
                      sx={{
                        ...CHIP_BASE_SX,
                        ...getChipStyles(resolvedGlobalColorField),
                        '& .MuiChip-label': {
                          ...CHIP_LABEL_SX,
                        },
                      }}
                    />
                  </Box>
                )}
              </PropertyDropZone>
            </Box>
            {resolvedGlobalColorField && (
              <ColorSchemeSelector
                currentSchemeId={effectiveColorScheme}
                fieldFlavour={resolvedGlobalColorField.flavour}
                onSchemeChange={handleGlobalColorSchemeChange}
              />
            )}
            {!resolvedGlobalColorField && (
              <ManualColorSelector
                value={effectiveManualColor}
                onChange={handleGlobalManualColorChange}
              />
            )}
          </Box>
          {resolvedGlobalColorField && resolvedGlobalColorField.flavour === 'continuous' && (
            <ColorBiasControl
              colorBias={effectiveColorBias}
              onChange={handleGlobalColorBiasChange}
            />
          )}
        </Box>

        <Divider sx={{ my: 1 }} />

        {/* Size (global) with drop zone */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="caption" sx={{ minWidth: 60 }}>
              Size
            </Typography>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <PropertyDropZone
                hasContent={resolvedGlobalSizeField !== null}
                emptyMessage="Drag a field or use manual size"
                onDrop={handleGlobalSizeDrop}
              >
                {resolvedGlobalSizeField && (
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.5,
                      minWidth: 0,
                      width: '100%',
                    }}
                  >
                    <Chip
                      label={getFieldDisplayName(resolvedGlobalSizeField)}
                      title={getFieldDisplayName(resolvedGlobalSizeField)}
                      onDelete={handleGlobalSizeRemove}
                      deleteIcon={<CloseIcon />}
                      size="small"
                      sx={{
                        ...CHIP_BASE_SX,
                        backgroundColor: '#f5f5f5',
                        border: '1px solid #bdbdbd',
                        '& .MuiChip-label': {
                          ...CHIP_LABEL_SX,
                        },
                      }}
                    />
                  </Box>
                )}
              </PropertyDropZone>
            </Box>
          </Box>
        </Box>
        <SizeRangeControl
          sizeField={resolvedGlobalSizeField || null}
          sizeRange={sizeRange}
          manualSize={manualSize}
          onSizeRangeChange={handleGlobalSizeRangeChange}
          onManualSizeChange={handleGlobalManualSizeChange}
        />

        <Divider sx={{ my: 1 }} />

        {/* Labels (global) with drop zone */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="caption" sx={{ minWidth: 60 }}>
              Label fields
            </Typography>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <PropertyDropZone
                hasContent={(labelFields?.length || 0) > 0}
                emptyMessage="Drag fields to show as labels"
                onDrop={handleGlobalLabelDrop}
              >
                {labelFields && labelFields.length > 0 && (
                  <Box
                    sx={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 0.5,
                      minWidth: 0,
                      width: '100%',
                    }}
                  >
                    {(labelFields as Field[]).map((field: Field) => {
                      const labelText = getFieldDisplayName(field);
                      return (
                        <Chip
                          key={field.id}
                          label={labelText}
                          title={labelText}
                          onDelete={() => handleGlobalLabelRemove(field.id)}
                          deleteIcon={<CloseIcon />}
                          size="small"
                          sx={{
                            ...CHIP_BASE_SX,
                            backgroundColor: '#fff3e0',
                            border: '1px solid #ff9800',
                            '& .MuiChip-label': {
                              ...CHIP_LABEL_SX,
                            },
                          }}
                        />
                      );
                    })}
                  </Box>
                )}
              </PropertyDropZone>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="caption" sx={{ minWidth: 60 }}>
              Show labels
            </Typography>
            <Switch
              size="small"
              checked={labelsEnabled}
              onChange={(e) => handleGlobalLabelsEnabledChange(e.target.checked)}
            />
          </Box>
        </Box>
      </Box>
    );
  };

  return (
    <PropertySection
      title="Field Overrides"
      icon={<TuneIcon fontSize="small" />}
      defaultExpanded={false}
      storageKey="fieldOverridesPanel.expanded"
    >
      <Box sx={{ display: 'flex', flexDirection: 'column' }}>
        {rows.map((row) => {
          const isAll = row.id === '__all__';
          const isExpanded = expandedId === row.id;
          const hasOverride = !isAll && !!fieldOverrides[row.id];

          return (
            <Box
              key={row.id}
              sx={{
                border: '1px solid #e0e0e0',
                borderRadius: 1,
                mb: 0.75,
                backgroundColor: isExpanded ? '#f5f5f5' : '#fafafa',
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  px: 1,
                  py: 0.5,
                  cursor: 'pointer',
                }}
                onClick={() => setExpandedId(isExpanded ? null : row.id)}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {isAll ? (
                    <Chip
                      size="small"
                      label="ALL"
                      color="default"
                      sx={{ height: 20, fontSize: '0.7rem' }}
                    />
                  ) : (
                    <Chip
                      size="small"
                      label={row.axis?.toUpperCase()}
                      color="default"
                      sx={{ height: 20, fontSize: '0.7rem' }}
                    />
                  )}
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {row.label}
                  </Typography>
                </Box>
                {!isAll && (
                  <Tooltip title="Reset overrides for this field">
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        handleClearOverride(row.id);
                      }}
                    >
                      <IconButton
                        size="small"
                        disabled={!hasOverride}
                      >
                        <RefreshIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                )}
              </Box>
              {isExpanded && !isAll && row.field && row.axis && (
                <Box sx={{ px: 1, pb: 1 }}>
                  {renderFieldBody(row.field, row.axis)}
                </Box>
              )}
              {isExpanded && isAll && (
                <Box sx={{ px: 1, pb: 1 }}>
                  {renderAllBody()}
                </Box>
              )}
            </Box>
          );
        })}
      </Box>
    </PropertySection>
  );
};

export default FieldOverridesPanel;


