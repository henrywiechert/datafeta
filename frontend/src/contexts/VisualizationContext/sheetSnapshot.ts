// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import type { FilterConfig, VisualizationStateSnapshot } from '../../types';
import { SHEET_SNAPSHOT_KEYS, SheetSnapshotKey } from './persistedKeys';
import type { VisualizationState } from './types';

function stripSessionConfigs(
  configs: Record<string, FilterConfig>,
  sessionFilterIds: ReadonlySet<string>,
): Record<string, FilterConfig> {
  if (sessionFilterIds.size === 0) return configs;
  const next: Record<string, FilterConfig> = {};
  for (const [id, config] of Object.entries(configs)) {
    if (!sessionFilterIds.has(id)) next[id] = config;
  }
  return next;
}

/**
 * The part of the visualization state stored in the active sheet: every
 * `SHEET_SNAPSHOT_KEYS` entry, minus session-scoped filters.
 *
 * Session-scoped (global) filters are never persisted into a sheet's local
 * state. A filter that was just promoted to global has already been removed
 * from the sheet stores; persisting a snapshot that still contains it (e.g. a
 * pre-promotion render flushed on cleanup) would resurrect it as a sheet-level
 * filter, leaving it live in both scopes.
 */
export function buildSheetSnapshot(
  state: VisualizationState,
  sessionFilterIds: ReadonlySet<string>,
): Partial<VisualizationStateSnapshot> {
  const persisted = Object.fromEntries(
    SHEET_SNAPSHOT_KEYS.map((key) => [key, state[key]]),
  ) as Pick<VisualizationState, SheetSnapshotKey>;

  return {
    ...persisted,
    filterFields: state.filterFields.filter((field) => !sessionFilterIds.has(field.id)),
    filterConfigurations: stripSessionConfigs(state.filterConfigurations, sessionFilterIds),
    appliedFilterConfigurations: stripSessionConfigs(state.appliedFilterConfigurations, sessionFilterIds),
    // Not read by the app; kept in sync with globalChartType for the saved-file format.
    selectedChartType: state.globalChartType ?? 'auto',
  };
}
