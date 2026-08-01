// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Helpers for discrete filter value lists in Relevant mode:
 * each field's distinct options can be constrained by other discrete filters.
 * Relevant mode only narrows the visible option list — it never changes a selection.
 */

import type { DiscreteValueListMode, FilterConfig } from '../types';
import { convertFilterConfigsToFilters } from '../queryBuilder/queryBuilder';

/** Resolve value-list mode; missing / unknown ⇒ 'all'. */
export function resolveValueListMode(
  config: FilterConfig | undefined,
): DiscreteValueListMode {
  if (config?.type === 'discrete' && config.valueListMode === 'relevant') {
    return 'relevant';
  }
  return 'all';
}

/**
 * Build the sibling filter map used to constrain distinct values for `fieldId`.
 * Excludes the target field itself and non-discrete configs.
 * Caller should pass already-effective configs (session+sheet, minus disabled).
 */
export function buildCascadingFiltersForField(
  fieldId: string,
  configurations: Record<string, FilterConfig>,
): Record<string, FilterConfig> {
  const result: Record<string, FilterConfig> = {};
  for (const [id, config] of Object.entries(configurations)) {
    if (id === fieldId) continue;
    if (config.type !== 'discrete') continue;
    result[id] = config;
  }
  return result;
}

function stableStringify(value: unknown): string {
  const normalize = (v: any): any => {
    if (v === null || v === undefined) return v;
    if (typeof v === 'bigint') return v.toString();
    if (Array.isArray(v)) return v.map(normalize);
    if (v instanceof Date) return v.toISOString();
    if (typeof v === 'object') {
      const out: Record<string, any> = {};
      for (const k of Object.keys(v).sort()) {
        out[k] = normalize(v[k]);
      }
      return out;
    }
    return v;
  };
  return JSON.stringify(normalize(value));
}

/**
 * Hash of the constraints a sibling map actually imposes, used to skip redundant
 * Relevant refetches. Hashing the converted query filters rather than the raw
 * configs means UI-only fields (valueListMode), select-all siblings and
 * selection reordering do not trigger a refetch.
 */
export function hashCascadingFilters(
  configurations: Record<string, FilterConfig>,
): string {
  const filters = convertFilterConfigsToFilters(configurations);
  if (filters.length === 0) return '';

  // IN / NOT IN value order does not change the resulting list.
  const normalized = filters.map((filter) => ({
    ...filter,
    value: Array.isArray(filter.value)
      ? filter.value.map((v) => stableStringify(v)).sort()
      : filter.value,
  }));
  normalized.sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));

  return hashString(stableStringify(normalized));
}

function hashString(json: string): string {
  let hash = 0;
  for (let i = 0; i < json.length; i++) {
    const char = json.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}
