// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Predicts the X×Y cells `generateCartesianPlots` will render, and the chart
 * type of each, for a given field/chart-type configuration. UI controls that
 * only make sense for some cells (overlays, line series rebase) use it to
 * show exactly what the renderer would apply. It mirrors the generator's
 * routing:
 *
 * - Cartesian cells are built from the continuous fields of each axis
 *   (faceted or not). With continuous fields on one axis only, the chart
 *   renders through the bar / tick-strip paths instead: no cartesian cells.
 * - Table presentation and grid-level chart types (pie, heatmap, cdf,
 *   density) bypass that pipeline entirely.
 * - Each cell's chart type comes from the same resolver the generator uses
 *   (per-field override → global chart type → per-pair auto-detection).
 */

import { DistributionVariant, Field, FieldOverrideState, UserChartType } from '../../types';
import { CellChartType, detectDefaultUserChartType } from '../helpers/chartTypeResolver';
import { isTablePresentation } from '../chartTypes/chartTypePresentation';
import { getChartTypeDescriptor } from '../chartTypeRegistry';
import { computeOverrideTargets } from '../utils/fieldOverrides';
import { createCellChartTypeResolver } from './cellChartType';

export interface CartesianCellPredictionInput {
  /** Active X-axis fields (disabled fields removed), as the planner sees them */
  xFields: Field[];
  /** Active Y-axis fields (disabled fields removed), as the planner sees them */
  yFields: Field[];
  /** User-selected chart type; null = auto */
  globalChartType: UserChartType | null;
  colorField?: Field | null;
  fieldOverrides?: Record<string, FieldOverrideState>;
  measureValuesSourceFields?: Field[];
  distributionVariant?: DistributionVariant;
}

export interface PredictedCartesianCell {
  xField: Field;
  yField: Field;
  cellChartType: CellChartType;
  /** Measure Values cell rendered as one mark layer per measure (see ResolvedCell). */
  multiMark: boolean;
}

/** The cartesian cells the generator would render; empty when it takes another path. */
export function predictCartesianCells(input: CartesianCellPredictionInput): PredictedCartesianCell[] {
  const { xFields, yFields, colorField, fieldOverrides, measureValuesSourceFields, distributionVariant } = input;

  let chartType = input.globalChartType ?? detectDefaultUserChartType(xFields, yFields, colorField);
  if (!chartType || isTablePresentation(chartType)) return [];

  const descriptor = getChartTypeDescriptor(chartType);
  if (descriptor?.isGridChart) {
    if (descriptor.isAllowed(xFields, yFields, colorField)) return [];
    // A disallowed grid chart type falls back to auto-detection in the
    // generator: pie is cleared up front; cdf/density are only cleared on the
    // unfaceted path (faceted cells keep the type and draw no cartesian cells).
    const faceted = [...xFields, ...yFields].some((f) => f.flavour === 'discrete');
    if (!descriptor.clearWhenNotAllowed && faceted) return [];
    chartType = null;
  }

  const xCandidates = xFields.filter((f) => f.flavour === 'continuous');
  const yCandidates = yFields.filter((f) => f.flavour === 'continuous');
  if (xCandidates.length === 0 || yCandidates.length === 0) return [];

  const resolveCell = createCellChartTypeResolver({
    fieldOverrides,
    fieldOverrideTargets: computeOverrideTargets(xFields, yFields, measureValuesSourceFields),
    globalChartType: chartType,
    distributionVariant,
    measureValuesSourceFields,
  });

  const cells: PredictedCartesianCell[] = [];
  for (const xField of xCandidates) {
    for (const yField of yCandidates) {
      const { cellChartType, multiMark } = resolveCell(xField, yField);
      cells.push({ xField, yField, cellChartType, multiMark });
    }
  }
  return cells;
}
