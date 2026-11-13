// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Overlay availability
 *
 * Predicts which overlays would take effect on the chart the generator renders
 * for a given field/chart-type configuration, so the Overlays panel only
 * offers those. Overlays are only applied to cartesian cells, so this is the
 * cell prediction (see grid/cartesianCellPrediction) filtered by
 * `OVERLAY_META.applicableTo` per cell, exactly as `applyOverlays`.
 */

import {
  CartesianCellPredictionInput,
  predictCartesianCells,
} from '../grid/cartesianCellPrediction';
import { OVERLAY_META, OverlayType, cellChartTypeToUserType } from './types';

export type OverlayAvailabilityInput = CartesianCellPredictionInput;

/** Overlay types that would draw marks on at least one rendered cell. */
export function getAvailableOverlayTypes(input: OverlayAvailabilityInput): Set<OverlayType> {
  const available = new Set<OverlayType>();
  for (const cell of predictCartesianCells(input)) {
    const cellType = cellChartTypeToUserType(cell.cellChartType);
    for (const meta of OVERLAY_META) {
      if (meta.applicableTo.has(cellType)) available.add(meta.type);
    }
  }
  return available;
}
