// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Relative DateTime Filter Refresh
 *
 * A datetime filter created from a preset stores both the resolved dates and the
 * preset label. The dates are what the query needs; the label is what the user
 * actually meant. When a saved configuration is loaded, relative presets
 * ('Last 7 Days', 'Today', …) are re-resolved against the current time so a
 * snapshot taken ten days ago still shows the last seven days instead of an
 * empty chart for a window that has since moved out of the data.
 *
 * Hand-picked ranges and data-bounded presets ('All Time') are left untouched.
 */

import { FilterConfig } from '../types';
import { resolveRelativePreset } from '../datetime';

/**
 * Re-resolve every relative-preset datetime filter in a configuration map.
 * Mutates `configurations` in place and returns the number of filters updated.
 */
function refreshConfigurationMap(
  configurations: Record<string, FilterConfig> | undefined,
  now: Date,
): number {
  if (!configurations) return 0;

  let refreshed = 0;
  for (const [fieldId, config] of Object.entries(configurations)) {
    if (!config || config.type !== 'datetime' || !config.preset) continue;

    const range = resolveRelativePreset(config.preset, config.dateTimePart, now);
    if (!range) continue; // custom, unknown, or data-bounded preset

    configurations[fieldId] = { ...config, startDate: range.start, endDate: range.end };
    refreshed += 1;
  }
  return refreshed;
}

/**
 * Configuration shape this refresh needs. Kept structural rather than typed as
 * `SavedConfiguration` so it can also run on a raw parsed config during load.
 */
interface ConfigWithFilters {
  sheets?: Array<{
    visualizationState?: {
      filterConfigurations?: Record<string, FilterConfig>;
      appliedFilterConfigurations?: Record<string, FilterConfig>;
    };
  }>;
  sessionFilters?: {
    configurations?: Record<string, FilterConfig>;
  };
}

/**
 * Recalculate all relative datetime filters in a saved configuration.
 *
 * Mutates `config` in place (the load path already migrates configs this way)
 * and returns the number of filters that were refreshed.
 */
export function refreshRelativeDateTimeFilters<T extends ConfigWithFilters>(
  config: T,
  now: Date = new Date(),
): number {
  let refreshed = 0;

  for (const sheet of config.sheets ?? []) {
    const state = sheet?.visualizationState;
    if (!state) continue;
    refreshed += refreshConfigurationMap(state.filterConfigurations, now);
    // Applied configs are what queries actually run with; a snapshot is always
    // saved in an applied state, so both maps must move together.
    refreshed += refreshConfigurationMap(state.appliedFilterConfigurations, now);
  }

  refreshed += refreshConfigurationMap(config.sessionFilters?.configurations, now);

  return refreshed;
}
