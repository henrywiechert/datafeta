import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box } from '@mui/material';
import TuneIcon from '@mui/icons-material/Tune';
import { PropertySection } from '../Properties';
import { useVisualizationContext } from '../../../contexts/VisualizationContext';
import { useDataSource } from '../../../contexts/DataSourceContext';
import { useUndoRedo } from '../../../contexts/UndoRedoContext';
import { Field } from '../../../types';
import { computeOverrideTargets } from '../../../observable-plot-generator/utils/fieldOverrides';
import { detectDefaultChartTypeForPair, detectDefaultUserChartType, CellChartType } from '../../../observable-plot-generator/helpers/chartTypeResolver';
import { analyzeFields } from '../../../observable-plot-generator/analysis/fieldAnalysis';
import { SIZE_DEFAULTS_BY_CHART_TYPE, SIZE_DEFAULT_FALLBACK } from '../../../config/chartLayoutConfig';
import { DEFAULT_MANUAL_COLOR, DEFAULT_CATEGORICAL_SCHEME, DEFAULT_SEQUENTIAL_SCHEME, categoricalSchemes } from '../../../config/colorSchemes';
import { useFieldOverrides } from './useFieldOverrides';
import ColorFieldControl from './ColorFieldControl';
import BackgroundFieldControl from './BackgroundFieldControl';
import SizeFieldControl from './SizeFieldControl';
import ShapeFieldControl from './ShapeFieldControl';
import LabelFieldControl from './LabelFieldControl';
import TooltipFieldControl from './TooltipFieldControl';
import ChartTypeControl from './ChartTypeControl';
import FieldOverrideRow from './FieldOverrideRow';

const FieldOverridesPanel: React.FC = () => {
  const { state, dispatch, getUndoableSnapshot } = useVisualizationContext();
  const { dataSource } = useDataSource();
  const { recordAction } = useUndoRedo();

  // Get availableFields from DataSourceContext (session-scoped)
  const { availableFields } = dataSource;

  const {
    xAxisFields,
    yAxisFields,
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
    tooltipFields,
    globalChartType,
    distributionVariant,
    tableCellMode,
    measureValuesSourceFields,
    facetBackgroundField,
    facetBackgroundScheme,
    facetBackgroundOpacity,
    shapeField,
    manualShape,
  } = state;

  const [expandedId, setExpandedId] = useState<string | null>('__all__');

  const targets = useMemo(
    () => computeOverrideTargets(
      xAxisFields as Field[], 
      yAxisFields as Field[],
      measureValuesSourceFields as Field[]
    ),
    [xAxisFields, yAxisFields, measureValuesSourceFields]
  );

  const {
    handleUpdateOverride,
    handleClearOverride,
    clearColorOverridesForAllFields,
    clearSizeOverridesForAllFields,
    clearLabelOverridesForAllFields,
    clearChartTypeOverridesForAllFields,
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
        { id: '__all__', label: '', axis: undefined as 'x' | 'y' | undefined, field: undefined as unknown as Field },
        ...fieldRows,
      ];
    },
    [targets]
  );

  const autoSelectedType = useMemo(() => {
    if (globalChartType) return undefined;
    const xFields = xAxisFields as Field[];
    const yFields = yAxisFields as Field[];
    if (!xFields?.length && !yFields?.length) return undefined;

    // Top-level user-chart-type defaults (currently: heatmap on 1×1 discrete dims
    // with a measure on color). These take precedence over per-pair detection.
    const userTypeDefault = detectDefaultUserChartType(
      xFields,
      yFields,
      colorField as Field | null
    );
    if (userTypeDefault) return userTypeDefault;

    const analysis = analyzeFields(xFields, yFields);
    const xCandidates = xFields.filter(
      (f) => f.type === 'measure' || (f.type === 'dimension' && f.flavour === 'continuous')
    );
    const yCandidates = yFields.filter(
      (f) => f.type === 'measure' || (f.type === 'dimension' && f.flavour === 'continuous')
    );

    if (xCandidates.length > 0 && yCandidates.length > 0) {
      const cellType: CellChartType = detectDefaultChartTypeForPair(xCandidates[0], yCandidates[0]);
      if (cellType === 'barX' || cellType === 'barY') return 'bar';
      if (cellType === 'tickX' || cellType === 'tickY') return 'tick';
      if (cellType === 'dot') return 'scatter';
      if (cellType === 'ganttX' || cellType === 'ganttY') return 'gantt';
      if (cellType === 'scatter' || cellType === 'line') return cellType;
      return undefined;
    }

    const xHasContinuousDim = analysis.xDimensions.some((d) => d.flavour === 'continuous');
    const yHasContinuousDim = analysis.yDimensions.some((d) => d.flavour === 'continuous');
    const hasMeasures = analysis.hasMeasure;

    if (!hasMeasures && (xHasContinuousDim || yHasContinuousDim)) return 'tick';
    if (hasMeasures) return 'bar';
    return 'scatter';
  }, [globalChartType, xAxisFields, yAxisFields, colorField]);

  // Track previous auto-selected type to detect changes
  const prevAutoSelectedTypeRef = useRef<string | undefined>(autoSelectedType);

  const recordUndoSnapshot = React.useCallback(() => {
    recordAction(getUndoableSnapshot());
  }, [recordAction, getUndoableSnapshot]);

  const applyGlobalActions = React.useCallback((
    actions: any[],
    options?: { clearOverrides?: () => void },
  ) => {
    recordUndoSnapshot();
    options?.clearOverrides?.();
    actions.forEach(action => dispatch(action));
  }, [recordUndoSnapshot, dispatch]);

  const applyGlobalAction = React.useCallback((
    action: any,
    options?: { clearOverrides?: () => void },
  ) => {
    applyGlobalActions([action], options);
  }, [applyGlobalActions]);
  
  // Update manualSize when auto-detected chart type changes (only in auto-detect mode)
  useEffect(() => {
    // Only react when in auto-detect mode (globalChartType is null)
    if (globalChartType !== null) {
      prevAutoSelectedTypeRef.current = autoSelectedType;
      return;
    }
    
    // Check if auto-selected type actually changed
    if (prevAutoSelectedTypeRef.current !== autoSelectedType && autoSelectedType !== undefined) {
      const newDefaultSize = SIZE_DEFAULTS_BY_CHART_TYPE[autoSelectedType] ?? SIZE_DEFAULT_FALLBACK;
      dispatch({ type: 'SET_MANUAL_SIZE', payload: newDefaultSize });
    }
    
    prevAutoSelectedTypeRef.current = autoSelectedType;
  }, [autoSelectedType, globalChartType, dispatch]);

  // Per-field override rendering
  const renderFieldControls = (targetField: Field) => {
    const override = fieldOverrides[targetField.id] || {};
    const resolvedColorField = resolveColorField(override);
    const resolvedSizeField = resolveSizeField(override);

    const effectiveManualColor = override.manualColor || manualColor || DEFAULT_MANUAL_COLOR;
    const effectiveColorScheme = override.colorScheme || colorScheme || 'tableau10';
    const effectiveColorBias = override.colorBias ?? colorBias ?? 0;
    const effectiveSizeRange: [number, number] = override.sizeRange || sizeRange || [4, 20];
    const effectiveManualSize = override.manualSize ?? manualSize ?? 10;

    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          // Visible separation between sections without boxy cards
          '& > * + *': {
            borderTop: '1px solid rgba(0,0,0,0.18)',
            pt: 0.75,
            mt: 0.75,
          },
        }}
      >
        <ChartTypeControl
          chartType={override.chartType}
          onChange={(chartType) => handleUpdateOverride(targetField.id, { chartType })}
        />

        <ColorFieldControl
          field={resolvedColorField}
          colorScheme={effectiveColorScheme}
          colorBias={effectiveColorBias}
          manualColor={effectiveManualColor}
          onDrop={(field) => {
            // Auto-select appropriate color scheme based on field flavour
            const isCategoricalScheme = categoricalSchemes.some(s => s.id === effectiveColorScheme);
            const updates: any = { colorFieldId: field.id, colorField: field };
            if (field.flavour === 'continuous' && isCategoricalScheme) {
              updates.colorScheme = DEFAULT_SEQUENTIAL_SCHEME;
            } else if (field.flavour === 'discrete' && !isCategoricalScheme) {
              updates.colorScheme = DEFAULT_CATEGORICAL_SCHEME;
            }
            handleUpdateOverride(targetField.id, updates);
          }}
          onRemove={(_fieldIds) => handleUpdateOverride(targetField.id, { 
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

        <SizeFieldControl
          field={resolvedSizeField}
          sizeRange={effectiveSizeRange}
          manualSize={effectiveManualSize}
          onDrop={(field) => handleUpdateOverride(targetField.id, { 
            sizeFieldId: field.id,
            sizeField: field
          })}
          onRemove={(_fieldIds) => handleUpdateOverride(targetField.id, { 
            sizeFieldId: null, 
            sizeField: null 
          })}
          onSizeRangeChange={(range) => handleUpdateOverride(targetField.id, { 
            sizeRange: range 
          })}
          onManualSizeChange={(size) => handleUpdateOverride(targetField.id, { 
            manualSize: size 
          })}
          forceSingleSlider={globalChartType === 'tick' || globalChartType === 'gantt'}
        />

        <LabelFieldControl
          labelFields={override.labelFields || []}
          dataLabelMode={override.dataLabelMode}
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
          onDataLabelModeChange={(mode) => handleUpdateOverride(targetField.id, { 
            dataLabelMode: mode 
          })}
        />
      </Box>
    );
  };

  // Global override rendering
  const renderGlobalControls = () => {
    const resolvedGlobalColorField = colorField as Field | null;
    const resolvedGlobalSizeField = sizeField as Field | null;
    const effectiveDistributionMode = globalChartType === 'tick' || (!globalChartType && autoSelectedType === 'tick');

    const effectiveManualColor = manualColor || DEFAULT_MANUAL_COLOR;
    const effectiveColorScheme = colorScheme || 'tableau10';
    const effectiveColorBias = colorBias ?? 0;

    return (
      <Box
        sx={{
          p: 0.75,
          pt: 0.5,
          pb: 0.5,
          display: 'flex',
          flexDirection: 'column',
          // Visible separation between sections without boxy cards
          '& > * + *': {
            borderTop: '1px solid rgba(0,0,0,0.18)',
            pt: 0.75,
            mt: 0.75,
          },
        }}
      >
        <ChartTypeControl
          chartType={globalChartType ?? undefined}
          onChange={(chartType) => {
            // Set chart-appropriate default size
            // When switching to auto-detect (chartType is null/undefined), use autoSelectedType
            const effectiveChartType = chartType ?? autoSelectedType;
            const newDefaultSize = effectiveChartType 
              ? (SIZE_DEFAULTS_BY_CHART_TYPE[effectiveChartType] ?? SIZE_DEFAULT_FALLBACK)
              : SIZE_DEFAULT_FALLBACK;

            applyGlobalActions(
              [
                { type: 'SET_GLOBAL_CHART_TYPE', payload: chartType ?? null },
                { type: 'SET_MANUAL_SIZE', payload: newDefaultSize },
              ],
              { clearOverrides: clearChartTypeOverridesForAllFields },
            );
          }}
          autoSelectedType={autoSelectedType}
          distributionVariant={distributionVariant}
          onDistributionVariantChange={(variant) => {
            applyGlobalAction({ type: 'SET_DISTRIBUTION_VARIANT', payload: variant });
          }}
          tableCellMode={tableCellMode}
          onTableCellModeChange={(mode) => {
            applyGlobalAction({ type: 'SET_TABLE_CELL_MODE', payload: mode });
          }}
        />

        <ColorFieldControl
          field={resolvedGlobalColorField}
          colorScheme={effectiveColorScheme}
          colorBias={effectiveColorBias}
          manualColor={effectiveManualColor}
          onDrop={(field) => {
            // Auto-select appropriate color scheme based on field flavour
            const isCategoricalScheme = categoricalSchemes.some(s => s.id === effectiveColorScheme);
            const actions: any[] = [{ type: 'SET_COLOR_FIELD', payload: field }];
            if (field.flavour === 'continuous' && isCategoricalScheme) {
              // Switching to continuous field but have categorical scheme - use sequential default
              actions.push({ type: 'SET_COLOR_SCHEME', payload: DEFAULT_SEQUENTIAL_SCHEME });
            } else if (field.flavour === 'discrete' && !isCategoricalScheme) {
              // Switching to discrete field but have sequential/diverging scheme - use categorical default
              actions.push({ type: 'SET_COLOR_SCHEME', payload: DEFAULT_CATEGORICAL_SCHEME });
            }

            applyGlobalActions(actions, { clearOverrides: clearColorOverridesForAllFields });
          }}
          onRemove={(_fieldIds) => {
            applyGlobalAction(
              { type: 'SET_COLOR_FIELD', payload: null },
              { clearOverrides: clearColorOverridesForAllFields },
            );
          }}
          onSchemeChange={(schemeId) => {
            applyGlobalAction(
              { type: 'SET_COLOR_SCHEME', payload: schemeId },
              { clearOverrides: clearColorOverridesForAllFields },
            );
          }}
          onColorChange={(color) => {
            applyGlobalAction(
              { type: 'SET_MANUAL_COLOR', payload: color },
              { clearOverrides: clearColorOverridesForAllFields },
            );
          }}
          onBiasChange={(bias) => {
            applyGlobalAction(
              { type: 'SET_COLOR_BIAS', payload: bias },
              { clearOverrides: clearColorOverridesForAllFields },
            );
          }}
        />

        <BackgroundFieldControl
          field={facetBackgroundField as Field | null}
          colorScheme={facetBackgroundScheme || 'tableau10'}
          opacity={facetBackgroundOpacity ?? 0.12}
          onDrop={(field) => {
            applyGlobalAction({ type: 'SET_FACET_BACKGROUND_FIELD', payload: field });
          }}
          onRemove={(_fieldIds) => {
            applyGlobalAction({ type: 'SET_FACET_BACKGROUND_FIELD', payload: null });
          }}
          onSchemeChange={(schemeId) => {
            applyGlobalAction({ type: 'SET_FACET_BACKGROUND_SCHEME', payload: schemeId });
          }}
          onOpacityChange={(opacity) => {
            applyGlobalAction({ type: 'SET_FACET_BACKGROUND_OPACITY', payload: opacity });
          }}
        />

        <SizeFieldControl
          field={resolvedGlobalSizeField}
          sizeRange={sizeRange}
          manualSize={manualSize}
          onDrop={(field) => {
            applyGlobalAction(
              { type: 'SET_SIZE_FIELD', payload: field },
              { clearOverrides: clearSizeOverridesForAllFields },
            );
          }}
          onRemove={(_fieldIds) => {
            applyGlobalAction(
              { type: 'SET_SIZE_FIELD', payload: null },
              { clearOverrides: clearSizeOverridesForAllFields },
            );
          }}
          onSizeRangeChange={(range) => {
            applyGlobalAction({ type: 'SET_SIZE_RANGE', payload: range });
          }}
          onManualSizeChange={(size) => {
            applyGlobalAction({ type: 'SET_MANUAL_SIZE', payload: size });
          }}
          forceSingleSlider={effectiveDistributionMode || globalChartType === 'gantt'}
        />

        <ShapeFieldControl
          field={shapeField}
          manualShape={manualShape}
          onDrop={(field) => {
            applyGlobalAction({ type: 'SET_SHAPE_FIELD', payload: field });
          }}
          onManualShapeChange={(shape) => {
            applyGlobalAction({ type: 'SET_MANUAL_SHAPE', payload: shape });
          }}
          onRemove={(_fieldIds) => {
            applyGlobalAction({ type: 'REMOVE_SHAPE_FIELD' });
          }}
        />

        <LabelFieldControl
          labelFields={labelFields as Field[] || []}
          showLabelsEnabled={true}
          labelsEnabled={labelsEnabled}
          onLabelDrop={(field) => {
            const currentLabelFields = labelFields as Field[] || [];
            if (!currentLabelFields.some((f: Field) => f.id === field.id)) {
              applyGlobalAction(
                { type: 'SET_LABEL_FIELDS', payload: [...currentLabelFields, field] },
                { clearOverrides: clearLabelOverridesForAllFields },
              );
            }
          }}
          onLabelRemove={(fieldId) => {
            const currentLabelFields = labelFields as Field[] || [];
            const updatedLabelFields = currentLabelFields.filter((f: Field) => f.id !== fieldId);
            applyGlobalAction(
              { type: 'SET_LABEL_FIELDS', payload: updatedLabelFields },
              { clearOverrides: clearLabelOverridesForAllFields },
            );
          }}
          onLabelsEnabledChange={(enabled) => {
            applyGlobalAction({ type: 'SET_LABELS_ENABLED', payload: enabled });
          }}
        />

        <TooltipFieldControl
          tooltipFields={(tooltipFields as Field[]) || []}
          onTooltipDrop={(field, _source) => {
            const current = (tooltipFields as Field[]) || [];
            if (current.some((f) => f.columnName === field.columnName)) return;
            applyGlobalAction({ type: 'ADD_TOOLTIP_FIELD', payload: field });
          }}
          onTooltipRemove={(fieldId) => {
            applyGlobalAction({ type: 'REMOVE_TOOLTIP_FIELD', payload: fieldId });
          }}
          onUpdateField={(field) => {
            applyGlobalAction({ type: 'UPDATE_FIELD', payload: field });
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
