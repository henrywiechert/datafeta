import React, { useMemo, useState } from 'react';
import { Box, Divider } from '@mui/material';
import TuneIcon from '@mui/icons-material/Tune';
import { PropertySection } from '../Properties';
import { useVisualizationContext } from '../../../contexts/VisualizationContext';
import { useUndoRedo } from '../../../contexts/UndoRedoContext';
import { Field } from '../../../types';
import { computeOverrideTargets } from '../../../observable-plot-generator/utils/fieldOverrides';
import { useFieldOverrides } from './useFieldOverrides';
import ColorFieldControl from './ColorFieldControl';
import SizeFieldControl from './SizeFieldControl';
import LabelFieldControl from './LabelFieldControl';
import FieldOverrideRow from './FieldOverrideRow';

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
  } = state as any;

  const [expandedId, setExpandedId] = useState<string | null>('__all__');

  const targets = useMemo(
    () => computeOverrideTargets(xAxisFields as Field[], yAxisFields as Field[]),
    [xAxisFields, yAxisFields]
  );

  const {
    handleUpdateOverride,
    handleClearOverride,
    clearColorOverridesForAllFields,
    clearSizeOverridesForAllFields,
    clearLabelOverridesForAllFields,
    resolveColorField,
    resolveSizeField,
  } = useFieldOverrides({
    xAxisFields: xAxisFields as Field[],
    yAxisFields: yAxisFields as Field[],
    filterFields: filterFields as Field[],
    availableFields: availableFields as Field[],
    colorField: colorField as Field | null,
    sizeField: sizeField as Field | null,
    fieldOverrides,
    colorScheme: colorScheme || 'tableau10',
    colorBias: colorBias ?? 0,
    dispatch,
    recordAction,
    getUndoableSnapshot,
  });

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

  // Per-field override rendering
  const renderFieldControls = (targetField: Field) => {
    const override = fieldOverrides[targetField.id] || {};
    const resolvedColorField = resolveColorField(override);
    const resolvedSizeField = resolveSizeField(override);

    const effectiveManualColor = override.manualColor || manualColor || '#4e79a7';
    const effectiveColorScheme = override.colorScheme || colorScheme || 'tableau10';
    const effectiveColorBias = override.colorBias ?? colorBias ?? 0;
    const effectiveSizeRange: [number, number] = override.sizeRange || sizeRange || [4, 20];
    const effectiveManualSize = override.manualSize ?? manualSize ?? 10;

    return (
      <>
        <ColorFieldControl
          field={resolvedColorField}
          colorScheme={effectiveColorScheme}
          colorBias={effectiveColorBias}
          manualColor={effectiveManualColor}
          onDrop={(field) => handleUpdateOverride(targetField.id, { 
            colorFieldId: field.id,
            colorField: field
          })}
          onRemove={() => handleUpdateOverride(targetField.id, { 
            colorFieldId: null, 
            colorField: null 
          })}
          onSchemeChange={(schemeId) => handleUpdateOverride(targetField.id, { 
            colorScheme: schemeId 
          })}
          onColorChange={(color) => handleUpdateOverride(targetField.id, { 
            manualColor: color 
          })}
          onBiasChange={(bias) => handleUpdateOverride(targetField.id, { 
            colorBias: bias 
          })}
        />

        <Divider sx={{ my: 1 }} />

        <SizeFieldControl
          field={resolvedSizeField}
          sizeRange={effectiveSizeRange}
          manualSize={effectiveManualSize}
          onDrop={(field) => handleUpdateOverride(targetField.id, { 
            sizeFieldId: field.id,
            sizeField: field
          })}
          onRemove={() => handleUpdateOverride(targetField.id, { 
            sizeFieldId: null, 
            sizeField: null 
          })}
          onSizeRangeChange={(range) => handleUpdateOverride(targetField.id, { 
            sizeRange: range 
          })}
          onManualSizeChange={(size) => handleUpdateOverride(targetField.id, { 
            manualSize: size 
          })}
        />

        <Divider sx={{ my: 1 }} />

        <LabelFieldControl
          labelFields={override.labelFields || []}
          displayLabel={override.displayLabel}
          dataLabelMode={override.dataLabelMode}
          showDisplayLabel={true}
          showDataLabelMode={true}
          onLabelDrop={(field) => {
            const currentLabelFields = override.labelFields || [];
            if (!currentLabelFields.some((f: Field) => f.id === field.id)) {
              handleUpdateOverride(targetField.id, {
                labelFields: [...currentLabelFields, field],
              });
            }
          }}
          onLabelRemove={(fieldId) => {
            const currentLabelFields = override.labelFields || [];
            const updatedLabelFields = currentLabelFields.filter((f: Field) => f.id !== fieldId);
            handleUpdateOverride(targetField.id, {
              labelFields: updatedLabelFields.length > 0 ? updatedLabelFields : undefined,
            });
          }}
          onDisplayLabelChange={(label) => handleUpdateOverride(targetField.id, { 
            displayLabel: label 
          })}
          onDataLabelModeChange={(mode) => handleUpdateOverride(targetField.id, { 
            dataLabelMode: mode 
          })}
        />
      </>
    );
  };

  // Global override rendering
  const renderGlobalControls = () => {
    const resolvedGlobalColorField = colorField as Field | null;
    const resolvedGlobalSizeField = sizeField as Field | null;

    const effectiveManualColor = manualColor || '#4e79a7';
    const effectiveColorScheme = colorScheme || 'tableau10';
    const effectiveColorBias = colorBias ?? 0;

    return (
      <Box sx={{ p: 1, pt: 0.5, pb: 0.5 }}>
        <ColorFieldControl
          field={resolvedGlobalColorField}
          colorScheme={effectiveColorScheme}
          colorBias={effectiveColorBias}
          manualColor={effectiveManualColor}
          onDrop={(field) => {
            recordAction(getUndoableSnapshot());
            clearColorOverridesForAllFields();
            dispatch({ type: 'SET_COLOR_FIELD', payload: field });
          }}
          onRemove={() => {
            recordAction(getUndoableSnapshot());
            clearColorOverridesForAllFields();
            dispatch({ type: 'SET_COLOR_FIELD', payload: null });
          }}
          onSchemeChange={(schemeId) => {
            recordAction(getUndoableSnapshot());
            clearColorOverridesForAllFields();
            dispatch({ type: 'SET_COLOR_SCHEME', payload: schemeId });
          }}
          onColorChange={(color) => {
            recordAction(getUndoableSnapshot());
            clearColorOverridesForAllFields();
            dispatch({ type: 'SET_MANUAL_COLOR', payload: color });
          }}
          onBiasChange={(bias) => {
            recordAction(getUndoableSnapshot());
            clearColorOverridesForAllFields();
            dispatch({ type: 'SET_COLOR_BIAS', payload: bias });
          }}
        />

        <Divider sx={{ my: 1 }} />

        <SizeFieldControl
          field={resolvedGlobalSizeField}
          sizeRange={sizeRange}
          manualSize={manualSize}
          onDrop={(field) => {
            recordAction(getUndoableSnapshot());
            clearSizeOverridesForAllFields();
            dispatch({ type: 'SET_SIZE_FIELD', payload: field });
          }}
          onRemove={() => {
            recordAction(getUndoableSnapshot());
            clearSizeOverridesForAllFields();
            dispatch({ type: 'SET_SIZE_FIELD', payload: null });
          }}
          onSizeRangeChange={(range) => {
            recordAction(getUndoableSnapshot());
            dispatch({ type: 'SET_SIZE_RANGE', payload: range });
          }}
          onManualSizeChange={(size) => {
            recordAction(getUndoableSnapshot());
            dispatch({ type: 'SET_MANUAL_SIZE', payload: size });
          }}
        />

        <Divider sx={{ my: 1 }} />

        <LabelFieldControl
          labelFields={labelFields as Field[] || []}
          showLabelsEnabled={true}
          labelsEnabled={labelsEnabled}
          onLabelDrop={(field) => {
            recordAction(getUndoableSnapshot());
            clearLabelOverridesForAllFields();
            const currentLabelFields = labelFields as Field[] || [];
            if (!currentLabelFields.some((f: Field) => f.id === field.id)) {
              dispatch({ type: 'SET_LABEL_FIELDS', payload: [...currentLabelFields, field] });
            }
          }}
          onLabelRemove={(fieldId) => {
            recordAction(getUndoableSnapshot());
            clearLabelOverridesForAllFields();
            const currentLabelFields = labelFields as Field[] || [];
            const updatedLabelFields = currentLabelFields.filter((f: Field) => f.id !== fieldId);
            dispatch({ type: 'SET_LABEL_FIELDS', payload: updatedLabelFields });
          }}
          onLabelsEnabledChange={(enabled) => {
            recordAction(getUndoableSnapshot());
            dispatch({ type: 'SET_LABELS_ENABLED', payload: enabled });
          }}
        />
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
          const isGlobal = row.id === '__all__';
          const isExpanded = expandedId === row.id;
          const hasOverride = !isGlobal && !!fieldOverrides[row.id];

          return (
            <FieldOverrideRow
              key={row.id}
              id={row.id}
              label={row.label}
              axis={row.axis}
              isGlobal={isGlobal}
              hasOverride={hasOverride}
              isExpanded={isExpanded}
              onToggle={() => setExpandedId(isExpanded ? null : row.id)}
              onClear={() => handleClearOverride(row.id)}
            >
              {isGlobal ? renderGlobalControls() : (row.field && renderFieldControls(row.field))}
            </FieldOverrideRow>
          );
        })}
      </Box>
    </PropertySection>
  );
};

export default FieldOverridesPanel;
