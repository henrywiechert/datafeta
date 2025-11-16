import React, { useMemo } from 'react';
import { Box, Typography, TextField, MenuItem, Chip, IconButton, Tooltip, Divider, ToggleButton, ToggleButtonGroup } from '@mui/material';
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

  const { xAxisFields, yAxisFields, availableFields, fieldOverrides } = state as any;

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

  const renderFieldRow = (targetField: Field, axis: 'x' | 'y') => {
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
      <Box
        key={targetField.id}
        sx={{
          border: '1px solid #e0e0e0',
          borderRadius: 1,
          p: 1,
          mb: 1,
          backgroundColor: '#fafafa',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Chip
              size="small"
              label={axis.toUpperCase()}
              color="default"
              sx={{ height: 20, fontSize: '0.7rem' }}
            />
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              {targetField.columnName}
            </Typography>
          </Box>
          <Tooltip title="Reset overrides for this field">
            <span>
              <IconButton
                size="small"
                onClick={() => handleClearOverride(targetField.id)}
                disabled={!fieldOverrides[targetField.id]}
              >
                <RefreshIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Box>

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
      {targets.length === 0 ? (
        <Typography variant="caption" sx={{ color: '#666' }}>
          No per-field overrides are available for the current field combination.
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
          {targets.map((t) => renderFieldRow(t.field, t.axis))}
        </Box>
      )}
    </PropertySection>
  );
};

export default FieldOverridesPanel;


