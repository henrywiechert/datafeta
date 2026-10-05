// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import type { VisualizationStateSnapshot } from '../../types/sheet';
import type { VisualizationState } from './types';

/**
 * Single source of truth for the `VisualizationState` keys that participate in
 * undo/redo capture and restoration (and, by extension, per-sheet snapshots).
 *
 * To make a new setting undoable/persisted, add its key here once. The snapshot
 * builder (`getUndoableSnapshot`) and the `RESTORE_UNDOABLE_STATE` reducer both
 * derive their behavior from this list, so there is no longer a multi-file
 * ritual when adding a persisted setting.
 *
 * Note: ephemeral state (loading flags, query results, timing, metadata-derived
 * fields) is intentionally excluded.
 */
export const PERSISTED_STATE_KEYS = [
  'xAxisFields',
  'yAxisFields',
  'filterFields',
  'filterConfigurations',
  'appliedFilterConfigurations',
  'colorField',
  'colorScheme',
  'colorBias',
  'colorReversed',
  'manualColor',
  'sizeField',
  'sizeRange',
  'manualSize',
  'labelFields',
  'tooltipFields',
  'labelsEnabled',
  'labelSamplingStrategy',
  'labelSamplingThreshold',
  'labelSampleEvery',
  'bandThicknessScale',
  'independentDomains',
  'fieldOverrides',
  'globalChartType',
  'labelFontSize',
  'axisLabelStyles',
  'categoryTickStyles',
  'facetLabelStyles',
  'facetBackgroundField',
  'facetBackgroundScheme',
  'facetBackgroundOpacity',
  'showTableRows',
  'tableColumnFields',
  'overlays',
  'chartTypeParams',
  'shapeField',
  'manualShape',
  'chartCaption',
  'showChartCaption',
] as const;

export type PersistedStateKey = (typeof PERSISTED_STATE_KEYS)[number];

/** Shape of an undo/redo snapshot derived from the persisted keys. */
export type UndoableSnapshot = Partial<Pick<VisualizationState, PersistedStateKey>>;

// Compile-time guard: this errors if any key above is not a VisualizationState
// key (the invalid literal makes the assignment to `readonly never[]` fail).
type ValidPersistedKey = Exclude<PersistedStateKey, keyof VisualizationState> extends never
  ? PersistedStateKey
  : never;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _persistedKeysGuard: readonly ValidPersistedKey[] = PERSISTED_STATE_KEYS;

/**
 * Keys saved with each sheet but deliberately not undoable: their actions do
 * not record undo points.
 */
export const SHEET_ONLY_STATE_KEYS = [
  'disabledFilterIds',
  'optimizationSettings',
  'measureGroup',
] as const;

/**
 * Every `VisualizationState` key written into a sheet's `visualizationState`
 * (see `buildSheetSnapshot`), so a persisted setting survives sheet switches,
 * duplication and file save/load.
 */
export const SHEET_SNAPSHOT_KEYS = [...PERSISTED_STATE_KEYS, ...SHEET_ONLY_STATE_KEYS] as const;

export type SheetSnapshotKey = (typeof SHEET_SNAPSHOT_KEYS)[number];

// Compile-time guard: every snapshot key must be a VisualizationState key and
// be declared on VisualizationStateSnapshot, the type sheets are stored as.
type ValidSheetSnapshotKey = Exclude<
  SheetSnapshotKey,
  keyof VisualizationState & keyof VisualizationStateSnapshot
> extends never
  ? SheetSnapshotKey
  : never;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _sheetSnapshotKeysGuard: readonly ValidSheetSnapshotKey[] = SHEET_SNAPSHOT_KEYS;
