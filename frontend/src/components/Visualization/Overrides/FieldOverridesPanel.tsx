import React, { useMemo, useState } from 'react';
import { Box, Typography, TextField, MenuItem, Chip, IconButton, Tooltip, Divider, ToggleButton, ToggleButtonGroup, Switch, FormControlLabel } from '@mui/material';
import TuneIcon from '@mui/icons-material/Tune';
import RefreshIcon from '@mui/icons-material/Refresh';
import { PropertySection } from '../Properties';
import { useVisualizationContext } from '../../../contexts/VisualizationContext';
import { useUndoRedo } from '../../../contexts/UndoRedoContext';
import { Field, FieldOverrideState, DataLabelMode } from '../../../types';
import { computeOverrideTargets } from '../../../observable-plot-generator/utils/fieldOverrides';
import ManualColorSelector from '../Color/ManualColorSelector';
import SizeRangeControl from '../Size/SizeRangeControl';

const LABEL_MODE_OPTIONS: { value: DataLabelMode; label: string }[] = [
  { value: 'inherit', label: 'Inherit' },
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
];

const FieldOverridesPanel: React.FC = () => {
  const { state, dispatch, getUndoableSnapshot } = useVisualizationContext();
  const { recordAction } = useUndoRedo();

  const {
    xAxisFields,
    yAxisFields,
    availableFields,
    fieldOverrides,
    colorField,
    colorScheme,
    colorBias,
    manualColor,
    sizeField,
    sizeRange,
    manualSize,
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
  const fieldById = useMemo(() => {
    const all: Field[] = [...(xAxisFields as Field[]), ...(yAxisFields as Field[]), ...(availableFields as Field[])];
    const map: Record<string, Field> = {};
    for (const f of all) {
      if (!map[f.id]) {
        map[f.id] = f;
      }
    }
    return map;
  }, [xAxisFields, yAxisFields, availableFields]);

  const allMeasureFields = useMemo(
    () =>
      Object.values(fieldById).filter(
        (f) => f.type === 'measure'
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

    const resolvedColorField = override.colorFieldId ? fieldById[override.colorFieldId] || null : null;
    const resolvedSizeField = override.sizeFieldId ? fieldById[override.sizeFieldId] || null : null;

    const effectiveManualColor = override.manualColor || '#4e79a7';
    const sizeRange: [number, number] = override.sizeRange || [4, 20];
    const manualSize = override.manualSize ?? 10;

    const handleLabelModeChange = (_: React.MouseEvent<HTMLElement>, value: DataLabelMode | null) => {
      if (!value) return;
      handleUpdateOverride(targetField.id, { dataLabelMode: value });
    };

    return (
      <>
        {/* Color override */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
          <Typography variant="caption" sx={{ minWidth: 60 }}>
            Color
          </Typography>
          <TextField
            select
            size="small"
            variant="outlined"
            label="Color field"
            value={override.colorFieldId ?? ''}
            onChange={(e) =>
              handleUpdateOverride(targetField.id, {
                colorFieldId: e.target.value || null,
              })
            }
            sx={{ minWidth: 140 }}
          >
            <MenuItem value="">Inherit</MenuItem>
            {allColorCandidateFields.map((f) => (
              <MenuItem key={f.id} value={f.id}>
                {f.columnName}
              </MenuItem>
            ))}
          </TextField>
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

        <Divider sx={{ my: 1 }} />

        {/* Size override */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
          <Typography variant="caption" sx={{ minWidth: 60 }}>
            Size
          </Typography>
          <TextField
            select
            size="small"
            variant="outlined"
            label="Size field"
            value={override.sizeFieldId ?? ''}
            onChange={(e) =>
              handleUpdateOverride(targetField.id, {
                sizeFieldId: e.target.value || null,
              })
            }
            sx={{ minWidth: 140 }}
          >
            <MenuItem value="">Inherit</MenuItem>
            {allMeasureFields.map((f) => (
              <MenuItem key={f.id} value={f.id}>
                {f.columnName}
              </MenuItem>
            ))}
          </TextField>
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
              sx={{ flex: 1 }}
            />
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

  const renderAllBody = () => {
    const resolvedGlobalColorField = colorField as Field | null;
    const resolvedGlobalSizeField = sizeField as Field | null;

    const effectiveManualColor = manualColor || '#4e79a7';

    const handleGlobalColorFieldChange = (value: string) => {
      recordAction(getUndoableSnapshot());
      clearColorOverridesForAllFields();
      const selected = value ? fieldById[value] || null : null;
      dispatch({ type: 'SET_COLOR_FIELD', payload: selected || null });
    };

    const handleGlobalManualColorChange = (color: string) => {
      recordAction(getUndoableSnapshot());
      clearColorOverridesForAllFields();
      dispatch({ type: 'SET_MANUAL_COLOR', payload: color });
    };

    const handleGlobalSizeFieldChange = (value: string) => {
      recordAction(getUndoableSnapshot());
      clearSizeOverridesForAllFields();
      const selected = value ? fieldById[value] || null : null;
      dispatch({ type: 'SET_SIZE_FIELD', payload: selected || null });
    };

    const handleGlobalSizeRangeChange = (range: [number, number]) => {
      recordAction(getUndoableSnapshot());
      clearSizeOverridesForAllFields();
      dispatch({ type: 'SET_SIZE_RANGE', payload: range });
    };

    const handleGlobalManualSizeChange = (value: number) => {
      recordAction(getUndoableSnapshot());
      clearSizeOverridesForAllFields();
      dispatch({ type: 'SET_MANUAL_SIZE', payload: value });
    };

    const handleGlobalLabelsEnabledChange = (checked: boolean) => {
      recordAction(getUndoableSnapshot());
      dispatch({ type: 'SET_LABELS_ENABLED', payload: checked });
    };

    return (
      <Box sx={{ p: 1, pt: 0.5, pb: 0.5 }}>
        {/* Color (global) */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
          <Typography variant="caption" sx={{ minWidth: 60 }}>
            Color
          </Typography>
          <TextField
            select
            size="small"
            variant="outlined"
            label="Color field"
            value={resolvedGlobalColorField?.id ?? ''}
            onChange={(e) => handleGlobalColorFieldChange(e.target.value)}
            sx={{ minWidth: 140 }}
          >
            <MenuItem value="">None</MenuItem>
            {allColorCandidateFields.map((f) => (
              <MenuItem key={f.id} value={f.id}>
                {f.columnName}
              </MenuItem>
            ))}
          </TextField>
          {!resolvedGlobalColorField && (
            <ManualColorSelector
              value={effectiveManualColor}
              onChange={handleGlobalManualColorChange}
            />
          )}
        </Box>

        <Divider sx={{ my: 1 }} />

        {/* Size (global) */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
          <Typography variant="caption" sx={{ minWidth: 60 }}>
            Size
          </Typography>
          <TextField
            select
            size="small"
            variant="outlined"
            label="Size field"
            value={resolvedGlobalSizeField?.id ?? ''}
            onChange={(e) => handleGlobalSizeFieldChange(e.target.value)}
            sx={{ minWidth: 140 }}
          >
            <MenuItem value="">None</MenuItem>
            {allMeasureFields.map((f) => (
              <MenuItem key={f.id} value={f.id}>
                {f.columnName}
              </MenuItem>
            ))}
          </TextField>
        </Box>
        <SizeRangeControl
          sizeField={resolvedGlobalSizeField || null}
          sizeRange={sizeRange}
          manualSize={manualSize}
          onSizeRangeChange={handleGlobalSizeRangeChange}
          onManualSizeChange={handleGlobalManualSizeChange}
        />

        <Divider sx={{ my: 1 }} />

        {/* Labels (global toggle only) */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
          <Typography variant="caption" sx={{ minWidth: 60 }}>
            Labels
          </Typography>
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={labelsEnabled}
                onChange={(e) => handleGlobalLabelsEnabledChange(e.target.checked)}
              />
            }
            label={<Typography variant="caption">Show labels</Typography>}
          />
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


