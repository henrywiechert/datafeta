import * as Plot from '@observablehq/plot';
import { generatePairChartOptions } from '../chartTypes/cellCharts';
import { Field } from '../../types';
import { ChartTypeOverrides, mapUserChartTypeToCellChartType, resolveChartTypeForPair } from '../helpers/chartTypeResolver';
import { getFieldColumnName } from '../helpers/fields';
import { CartesianPlotsConfig } from '../types';
import { FieldOverrideState } from '../../types';
import { deriveColorScaleInfo, applyMeasureNameColorOverrides } from '../utils/colorSchemeUtils';
import { isMeasureValuesField, combineMeasureValuesOverrides } from '../../utils/syntheticFields';
import { hasAnyMeasureOverrides, generateMeasureValuesMultiMarkPlot } from '../chartTypes/measureValuesMultiMark';
import { applyOverlays } from '../overlays';
import { cellChartTypeToUserType } from '../overlays/types';

export type CartesianPlot = {
  id: string;
  title: string;
  options: Plot.PlotOptions;
  position: { row: number; col: number };
  xField?: Field;
  yField?: Field;
};

/**
 * Build plot specs for all X×Y candidate pairs using a structured config object.
 */
export function generateCartesianPlots(config: CartesianPlotsConfig): CartesianPlot[] {
  const {
    data,
    xCandidates,
    yCandidates,
    sharedDomains,
    encoding,
    labels: labelCfg,
    tooltipFields,
    facetFields,
    overrides,
    fieldOverrides,
    fieldOverrideTargets,
    allFields,
    globalChartType,
    measureValuesSourceFields,
    bandThicknessScale,
    ganttZoomRange,
    overlays: overlayConfigs,
  } = config;

  // Extract encoding options
  const colorField = encoding?.color?.field;
  const colorScheme = encoding?.color?.scheme;
  const colorBias = encoding?.color?.bias;
  const manualColor = encoding?.color?.manual;
  const sizeField = encoding?.size?.field;
  const sizeRange = encoding?.size?.range;
  const manualSize = encoding?.size?.manual;
  const thicknessScale = bandThicknessScale;

  // Combine measure and numeric domains
  const sharedMeasureDomains = sharedDomains.measure;

  const plots: CartesianPlot[] = [];

  // Use provided numeric domains if available (from faceting), otherwise use those from sharedDomains
  const sharedNumeric = sharedDomains.numeric;

  // Compute a shared color domain across the entire grid when a color field is present
  // Use provided color scale if available (from faceting), otherwise compute from local data
  let sharedColorScale = sharedDomains.colorScale !== undefined
    ? sharedDomains.colorScale
    : (colorField ? deriveColorScaleInfo(data, colorField, colorScheme, colorBias) : null);
  
  // Apply per-measure color overrides if color field is MeasureNames
  sharedColorScale = applyMeasureNameColorOverrides(
    sharedColorScale,
    colorField,
    measureValuesSourceFields,
    fieldOverrides
  );

  // Build lookup maps for overrides and fields
  const overrideMap: Record<string, FieldOverrideState> = fieldOverrides || {};
  const targetAxisByFieldId: Record<string, 'x' | 'y'> = {};
  (fieldOverrideTargets || []).forEach((t) => {
    targetAxisByFieldId[t.fieldId] = t.axis;
  });
  const fieldById: Record<string, Field> = {};
  (allFields || []).forEach((f) => {
    if (!fieldById[f.id]) {
      fieldById[f.id] = f;
    }
  });

  // Pre-compute combined override for MeasureValues if applicable
  const measureValuesOverride = combineMeasureValuesOverrides(
    measureValuesSourceFields,
    fieldOverrides
  );

  for (let r = 0; r < yCandidates.length; r++) {
    for (let c = 0; c < xCandidates.length; c++) {
      const xField = xCandidates[c];
      const yField = yCandidates[r];

      // Check if either axis has MeasureValues
      const xIsMeasureValues = isMeasureValuesField(xField);
      const yIsMeasureValues = isMeasureValuesField(yField);

      // Resolve effective overrides for this cell based on which axis is configured
      const xTargetAxis = targetAxisByFieldId[xField.id];
      const yTargetAxis = targetAxisByFieldId[yField.id];
      
      // For MeasureValues fields, use the combined override from source measures
      const xOverride = xIsMeasureValues 
        ? measureValuesOverride 
        : (xTargetAxis === 'x' ? overrideMap[xField.id] : undefined);
      const yOverride = yIsMeasureValues 
        ? measureValuesOverride 
        : (yTargetAxis === 'y' ? overrideMap[yField.id] : undefined);

      // Prefer X-axis override when both are present (defensive; rules should prevent this)
      const cellOverride: FieldOverrideState | undefined = xOverride || yOverride;

      // Start from global encodings
      let cellColorField: Field | undefined | null = colorField;
      let cellColorScheme: string | undefined = colorScheme;
      let cellColorBias: number | undefined = colorBias;
      let cellManualColor: string | undefined = manualColor;
      let cellSizeField: Field | undefined | null = sizeField;
      let cellSizeRange: [number, number] | undefined = sizeRange;
      let cellManualSize: number | undefined = manualSize;

      // Build per-cell chart type override from fieldOverrides or global chart type
      let cellChartTypeOverrides: ChartTypeOverrides | undefined = overrides;
      if (cellOverride?.chartType) {
        // Per-field chart type override takes precedence
        // Determine which axis has the override (prefer X if both have it)
        const overrideAxis = xOverride?.chartType ? 'x' : 'y';
        const cellChartType = mapUserChartTypeToCellChartType(
          cellOverride.chartType,
          overrideAxis,
          xField,
          yField
        );
        cellChartTypeOverrides = {
          ...overrides,
          byFieldId: {
            ...(overrides?.byFieldId || {}),
            [overrideAxis === 'x' ? xField.id : yField.id]: cellChartType,
          },
        };
      } else if (globalChartType) {
        // Fall back to global chart type when no per-field override is set
        // Use x-axis field as the primary for mapping (arbitrary choice, works for most cases)
        const globalCellChartType = mapUserChartTypeToCellChartType(
          globalChartType,
          xField.type === 'measure' ? 'x' : 'y',
          xField,
          yField
        );
        cellChartTypeOverrides = {
          ...overrides,
          global: globalCellChartType,
        };
      }

      if (cellOverride) {
        // Color field: prefer stored field object, fallback to lookup by ID
        if (cellOverride.colorField) {
          cellColorField = cellOverride.colorField;
        } else if (cellOverride.colorFieldId) {
          const cf = fieldById[cellOverride.colorFieldId];
          if (cf) {
            cellColorField = cf;
          }
        }
        if (cellOverride.colorScheme !== undefined) {
          cellColorScheme = cellOverride.colorScheme;
        }
        if (cellOverride.colorBias !== undefined) {
          cellColorBias = cellOverride.colorBias;
        }
        if (cellOverride.manualColor) {
          cellManualColor = cellOverride.manualColor;
        }

        // Size field: prefer stored field object, fallback to lookup by ID
        if (cellOverride.sizeField) {
          cellSizeField = cellOverride.sizeField;
        } else if (cellOverride.sizeFieldId) {
          const sf = fieldById[cellOverride.sizeFieldId];
          if (sf) {
            cellSizeField = sf;
          }
        }
        if (cellOverride.sizeRange) {
          cellSizeRange = cellOverride.sizeRange;
        }
        if (cellOverride.manualSize !== undefined) {
          cellManualSize = cellOverride.manualSize;
        }
      }

      // Check if we need multi-mark rendering for MeasureValues with per-measure overrides
      const needsMultiMark = (xIsMeasureValues || yIsMeasureValues) && 
        measureValuesSourceFields?.length && 
        hasAnyMeasureOverrides(measureValuesSourceFields, fieldOverrides);

      let options: Plot.PlotOptions;
      
      if (needsMultiMark) {
        // Use multi-mark rendering for per-measure chart types
        // Pass the GLOBAL manualSize (not cellManualSize from combined overrides)
        // so each measure falls back to the global default, not to another measure's override
        options = generateMeasureValuesMultiMarkPlot({
          data,
          xField,
          yField,
          measureValuesSourceFields: measureValuesSourceFields!,
          fieldOverrides: fieldOverrides || {},
          colorField: cellColorField || undefined,
          sharedColorScale: sharedColorScale,
          manualSize: manualSize,  // Use global, not cellManualSize
          manualColor: manualColor,  // Pass global manual color as fallback
          sharedDomains: { ...sharedMeasureDomains, ...sharedNumeric },
          tooltipFields,
        });
      } else {
        // Standard single-mark rendering
        options = generatePairChartOptions(
          data,
          xField,
          yField,
          { ...sharedMeasureDomains, ...sharedNumeric },
          cellChartTypeOverrides,
          cellColorField || undefined,
          cellSizeField || undefined,
          cellSizeRange,
          cellManualSize,
          thicknessScale,
          cellColorScheme,
          cellColorBias,
          cellManualColor,
          (() => {
            // Per-cell label configuration based on dataLabelMode and labelFields
            if (!labelCfg) return undefined;
            if (cellOverride?.dataLabelMode === 'off') {
              return undefined;
            }
            
            // Build effective labelCfg for this cell
            let effectiveLabelCfg = { ...labelCfg };
            
            // If cell override has labelFields, use those instead of global
            if (cellOverride?.labelFields && cellOverride.labelFields.length > 0) {
              effectiveLabelCfg = {
                ...effectiveLabelCfg,
                labelFields: cellOverride.labelFields,
              };
            }
            
            // If dataLabelMode is 'on', force enable labels
            if (cellOverride?.dataLabelMode === 'on') {
              effectiveLabelCfg.labelsEnabled = true;
            }
            
            return effectiveLabelCfg;
          })(),
          tooltipFields,
          facetFields,
          sharedDomains.categorical,
          ganttZoomRange
        );
      }

      // Apply statistical overlays (regression, moving average, Bollinger bands)
      if (overlayConfigs?.length) {
        const resolvedCellType = resolveChartTypeForPair(xField, yField, cellChartTypeOverrides);
        const userChartType = cellChartTypeToUserType(resolvedCellType);
        // Determine orientation: dependent (value) axis — Y for most charts, X for barX/tickX/ganttX
        const depAxis: 'x' | 'y' = (resolvedCellType === 'barX' || resolvedCellType === 'tickX' || resolvedCellType === 'ganttX') ? 'x' : 'y';
        options = applyOverlays(options, overlayConfigs, {
          data,
          xColumn: getFieldColumnName(xField),
          yColumn: getFieldColumnName(yField),
          chartType: userChartType,
          orientation: depAxis,
        });
      }

      // Apply shared color domain to keep color mapping consistent across the grid
      if (sharedColorScale) {
        const colorLabel = colorField?.columnName;
        const sharedConfig = sharedColorScale.kind === 'continuous'
          ? {
              type: 'linear',
              domain: sharedColorScale.domain as [number, number],
              range: sharedColorScale.range,
              clamp: true,
              label: colorLabel,
            }
          : {
              type: 'ordinal' as any,
              domain: sharedColorScale.domain as any[],
              range: sharedColorScale.range,
              label: colorLabel,
            };

        options = {
          ...options,
          color: {
            ...(options as any).color,
            ...sharedConfig,
          } as any,
        };
      }
      const title = buildCellTitle(xField, yField);
      plots.push({ id: `cell-${r}-${c}`, title, options, position: { row: r, col: c }, xField, yField });
    }
  }

  return plots;
}

function buildCellTitle(xField: Field, yField: Field): string {
  const xLabel = xField.type === 'measure' ? `${xField.aggregation || 'sum'}(${xField.columnName})` : xField.columnName;
  const yLabel = yField.type === 'measure' ? `${yField.aggregation || 'sum'}(${yField.columnName})` : yField.columnName;
  return `${yLabel} vs ${xLabel}`;
}

// buildLabelConfig moved to utils/configBuilder.ts
