// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { FilterConfig } from '../types';
import { mergeFilterConfigurations } from './effectiveFilters';

/**
 * Stable stringify for filter-config maps so key order and nested key order
 * do not create false pending signals.
 */
function stableStringifyConfigs(configurations: Record<string, FilterConfig>): string {
  const normalized = Object.keys(configurations)
    .sort()
    .map((id) => {
      const entries = Object.entries(configurations[id] as unknown as Record<string, unknown>);
      entries.sort(([a], [b]) => a.localeCompare(b));
      return [id, entries] as const;
    });
  return JSON.stringify(normalized);
}

/**
 * True when merged draft filter configs differ from merged applied configs
 * (sheet + session). Metadata is ignored — Apply only commits configurations.
 */
export function hasPendingFilterApply(
  draftLocal: Record<string, FilterConfig>,
  draftSession: Record<string, FilterConfig>,
  appliedLocal: Record<string, FilterConfig>,
  appliedSession: Record<string, FilterConfig>,
): boolean {
  const draft = mergeFilterConfigurations(draftLocal, draftSession);
  const applied = mergeFilterConfigurations(appliedLocal, appliedSession);
  return stableStringifyConfigs(draft) !== stableStringifyConfigs(applied);
}
