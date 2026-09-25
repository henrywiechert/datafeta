// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Overlay availability
 *
 * Predicts which overlays would take effect on the chart the generator renders
 * for a given field/chart-type configuration, so the Overlays panel only
 * offers those. It mirrors the generator's routing:
 *
 * - Overlays are only applied inside `generateCartesianPlots`, i.e. to X×Y
 *   cells built from the continuous fields of each axis (faceted or not).
 *   With continuous fields on one axis only, the chart renders through the
 *   bar / tick-strip paths, which draw no overlays.
 * - Table presentation and grid-level chart types (pie, heatmap, cdf,
 *   density) bypass that pipeline entirely.
 * - Each cell's chart type comes from the same resolver the generator uses
 *   (per-field override → global chart type → per-pair auto-detection), and
 *   `OVERLAY_META.applicableTo` decides per cell, exactly as `applyOverlays`.
 */

import { DistributionVariant, Field, FieldOverrideState, UserChartType } from '../../types';
import { detectDefaultUserChartType } from '../helpers/chartTypeResolver';
import { isTablePresentation } from '../chartTypes/chartTypePresentation';
import { getChartTypeDescriptor } from '../chartTypeRegistry';
import { computeOverrideTargets } from '../utils/fieldOverrides';
import { createCellChartTypeResolver } from '../grid/cellChartType';
import { OVERLAY_META, OverlayType, cellChartTypeToUserType } from './types';

export interface OverlayAvailabilityInput {
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

/** Overlay types that would draw marks on at least one rendered cell. */
export function getAvailableOverlayTypes(input: OverlayAvailabilityInput): Set<OverlayType> {
  const { xFields, yFields, colorField, fieldOverrides, measureValuesSourceFields, distributionVariant } = input;
  const available = new Set<OverlayType>();

  let chartType = input.globalChartType ?? detectDefaultUserChartType(xFields, yFields, colorField);
  if (!chartType || isTablePresentation(chartType)) return available;

  const descriptor = getChartTypeDescriptor(chartType);
  if (descriptor?.isGridChart) {
    if (descriptor.isAllowed(xFields, yFields, colorField)) return available;
    // A disallowed grid chart type falls back to auto-detection in the
    // generator: pie is cleared up front; cdf/density are only cleared on the
    // unfaceted path (faceted cells keep the type and draw no overlays).
    const faceted = [...xFields, ...yFields].some((f) => f.flavour === 'discrete');
    if (!descriptor.clearWhenNotAllowed && faceted) return available;
    chartType = null;
  }

  const xCandidates = xFields.filter((f) => f.flavour === 'continuous');
  const yCandidates = yFields.filter((f) => f.flavour === 'continuous');
  if (xCandidates.length === 0 || yCandidates.length === 0) return available;

  const resolveCell = createCellChartTypeResolver({
    fieldOverrides,
    fieldOverrideTargets: computeOverrideTargets(xFields, yFields, measureValuesSourceFields),
    globalChartType: chartType,
    distributionVariant,
    measureValuesSourceFields,
  });

  for (const xField of xCandidates) {
    for (const yField of yCandidates) {
      const cellType = cellChartTypeToUserType(resolveCell(xField, yField).cellChartType);
      for (const meta of OVERLAY_META) {
        if (meta.applicableTo.has(cellType)) available.add(meta.type);
      }
    }
  }
  return available;
}
