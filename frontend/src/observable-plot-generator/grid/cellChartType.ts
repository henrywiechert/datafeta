// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Per-cell chart type resolution for the cartesian grid.
 *
 * Shared by `generateCartesianPlots` (to render each X×Y cell) and overlay
 * availability (to predict the cells overlays are drawn on), so the Overlays
 * panel offers exactly the overlays the renderer applies.
 */
import { DistributionVariant, Field, FieldOverrideState, UserChartType } from '../../types';
import {
  CellChartType,
  ChartTypeOverrides,
  mapUserChartTypeToCellChartType,
  resolveChartTypeForPair,
} from '../helpers/chartTypeResolver';
import { FieldOverrideTarget } from '../utils/fieldOverrides';
import { isMeasureValuesField, combineMeasureValuesOverrides } from '../../utils/syntheticFields';

export interface CellChartTypeInputs {
  overrides?: ChartTypeOverrides;
  fieldOverrides?: Record<string, FieldOverrideState>;
  fieldOverrideTargets?: FieldOverrideTarget[];
  globalChartType?: UserChartType | null;
  distributionVariant?: DistributionVariant;
  measureValuesSourceFields?: Field[];
}

export interface ResolvedCell {
  /** Per-field override that applies to this cell (X-axis override wins) */
  cellOverride?: FieldOverrideState;
  /** Chart type overrides handed to the pair chart builder */
  chartTypeOverrides?: ChartTypeOverrides;
  cellChartType: CellChartType;
}

/**
 * Build a resolver for the chart type of each X×Y cell: per-field override
 * first, then the global chart type, then per-pair auto-detection.
 */
export function createCellChartTypeResolver(
  inputs: CellChartTypeInputs,
): (xField: Field, yField: Field) => ResolvedCell {
  const {
    overrides,
    fieldOverrides,
    fieldOverrideTargets,
    globalChartType,
    distributionVariant = 'tick-strip',
    measureValuesSourceFields,
  } = inputs;

  const overrideMap: Record<string, FieldOverrideState> = fieldOverrides || {};
  const targetAxisByFieldId: Record<string, 'x' | 'y'> = {};
  (fieldOverrideTargets || []).forEach((t) => {
    targetAxisByFieldId[t.fieldId] = t.axis;
  });

  // Pre-compute combined override for MeasureValues if applicable
  const measureValuesOverride = combineMeasureValuesOverrides(
    measureValuesSourceFields,
    fieldOverrides
  );

  return (xField, yField) => {
    // Resolve effective overrides for this cell based on which axis is configured
    const xTargetAxis = targetAxisByFieldId[xField.id];
    const yTargetAxis = targetAxisByFieldId[yField.id];

    // For MeasureValues fields, use the combined override from source measures
    const xOverride = isMeasureValuesField(xField)
      ? measureValuesOverride
      : (xTargetAxis === 'x' ? overrideMap[xField.id] : undefined);
    const yOverride = isMeasureValuesField(yField)
      ? measureValuesOverride
      : (yTargetAxis === 'y' ? overrideMap[yField.id] : undefined);

    // Prefer X-axis override when both are present (defensive; rules should prevent this)
    const cellOverride: FieldOverrideState | undefined = xOverride || yOverride;

    // Build per-cell chart type override from fieldOverrides or global chart type
    let chartTypeOverrides: ChartTypeOverrides | undefined = overrides;
    if (cellOverride?.chartType) {
      // Per-field chart type override takes precedence
      // Determine which axis has the override (prefer X if both have it)
      const overrideAxis = xOverride?.chartType ? 'x' : 'y';
      const cellChartType = mapUserChartTypeToCellChartType(
        cellOverride.chartType,
        overrideAxis,
        xField,
        yField,
        distributionVariant
      );
      chartTypeOverrides = {
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
        yField,
        distributionVariant
      );
      chartTypeOverrides = {
        ...overrides,
        global: globalCellChartType,
      };
    }

    return {
      cellOverride,
      chartTypeOverrides,
      cellChartType: resolveChartTypeForPair(xField, yField, chartTypeOverrides),
    };
  };
}
