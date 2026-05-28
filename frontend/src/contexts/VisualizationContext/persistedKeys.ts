// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
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
  'manualColor',
  'sizeField',
  'sizeRange',
  'manualSize',
  'labelFields',
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
  'overlays',
  'chartTypeParams',
  'shapeField',
  'manualShape',
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
