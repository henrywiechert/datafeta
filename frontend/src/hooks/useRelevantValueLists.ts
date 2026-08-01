// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Watches draft discrete filter configs and refreshes Relevant value lists
 * when sibling constraints change.
 *
 * Relevant mode is purely a visibility mode for the picker list: the only config
 * field this hook ever writes is `valueListMode`. Selections are never changed.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { DiscreteValueListMode, Field, FilterConfig } from '../types';
import {
  buildCascadingFiltersForField,
  hashCascadingFilters,
  resolveValueListMode,
} from '../utils/cascadingFilters';
import { buildEffectiveFilterConfigurations } from '../utils/effectiveFilters';
import type { FilterValueListFetchOptions } from './useFilterMetadata';

const RELEVANT_DEBOUNCE_MS = 300;

export interface UseRelevantValueListsParams {
  filterFields: Field[];
  /** Sheet draft configs */
  sheetConfigurations: Record<string, FilterConfig>;
  /** Session draft configs */
  sessionConfigurations: Record<string, FilterConfig>;
  disabledFilterIds?: string[];
  sessionFilterIds: Set<string>;
  updateFilterConfig: (fieldId: string, config: FilterConfig) => void;
  refetchFilterValues: (
    fieldId: string,
    regexPattern?: string,
    options?: FilterValueListFetchOptions,
  ) => Promise<void>;
}

export interface UseRelevantValueListsReturn {
  setValueListMode: (fieldId: string, mode: DiscreteValueListMode) => void;
  /** Wrap refetch so Query Regex / All-mode callers get correct sibling constraints. */
  refetchWithValueListContext: (
    fieldId: string,
    regexPattern?: string,
    options?: FilterValueListFetchOptions,
  ) => Promise<void>;
}

export function useRelevantValueLists({
  filterFields,
  sheetConfigurations,
  sessionConfigurations,
  disabledFilterIds = [],
  sessionFilterIds,
  updateFilterConfig,
  refetchFilterValues,
}: UseRelevantValueListsParams): UseRelevantValueListsReturn {
  const siblingHashByFieldRef = useRef<Map<string, string>>(new Map());

  const draftConfigurations = useMemo(
    () => buildEffectiveFilterConfigurations({
      localConfigurations: sheetConfigurations,
      sessionConfigurations,
      disabledFilterIds,
    }),
    [sheetConfigurations, sessionConfigurations, disabledFilterIds],
  );

  // Refs keep the callbacks below stable so the debounce timer is not restarted
  // by unrelated re-renders (refetchFilterValues changes identity on every
  // metadata dispatch, including the loading flag it sets itself).
  const draftRef = useRef(draftConfigurations);
  draftRef.current = draftConfigurations;
  const refetchRef = useRef(refetchFilterValues);
  refetchRef.current = refetchFilterValues;
  const updateConfigRef = useRef(updateFilterConfig);
  updateConfigRef.current = updateFilterConfig;
  // Unlike draftRef this keeps disabled filters, so their mode can still be toggled.
  const scopedConfigsRef = useRef({ sheetConfigurations, sessionConfigurations, sessionFilterIds });
  scopedConfigsRef.current = { sheetConfigurations, sessionConfigurations, sessionFilterIds };

  const getConfig = useCallback((fieldId: string): FilterConfig | undefined => {
    const { sheetConfigurations: sheet, sessionConfigurations: session, sessionFilterIds: ids } =
      scopedConfigsRef.current;
    return ids.has(fieldId)
      ? session[fieldId] ?? sheet[fieldId]
      : sheet[fieldId] ?? session[fieldId];
  }, []);

  const refetchWithSiblings = useCallback((
    fieldId: string,
    mode: DiscreteValueListMode,
    regexPattern?: string,
    extraOptions?: FilterValueListFetchOptions,
  ) => {
    const siblingConfigurations = mode === 'relevant'
      ? buildCascadingFiltersForField(fieldId, draftRef.current)
      : {};
    siblingHashByFieldRef.current.set(fieldId, hashCascadingFilters(siblingConfigurations));

    return refetchRef.current(fieldId, regexPattern, {
      ...extraOptions,
      siblingConfigurations,
    });
  }, []);

  const setValueListMode = useCallback((
    fieldId: string,
    mode: DiscreteValueListMode,
  ) => {
    const existing = getConfig(fieldId);
    if (!existing || existing.type !== 'discrete') return;
    if (resolveValueListMode(existing) === mode) return;

    updateConfigRef.current(fieldId, { ...existing, valueListMode: mode });
    void refetchWithSiblings(fieldId, mode);
  }, [getConfig, refetchWithSiblings]);

  const refetchWithValueListContext = useCallback((
    fieldId: string,
    regexPattern?: string,
    options?: FilterValueListFetchOptions,
  ) => {
    const mode = resolveValueListMode(getConfig(fieldId));
    return refetchWithSiblings(fieldId, mode, regexPattern, options);
  }, [getConfig, refetchWithSiblings]);

  // Debounced Relevant refresh when sibling draft selections change.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      filterFields.forEach((field) => {
        if (resolveValueListMode(draftConfigurations[field.id]) !== 'relevant') return;

        const siblings = buildCascadingFiltersForField(field.id, draftConfigurations);
        const nextHash = hashCascadingFilters(siblings);
        if (siblingHashByFieldRef.current.get(field.id) === nextHash) return;

        void refetchWithSiblings(field.id, 'relevant');
      });
    }, RELEVANT_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [draftConfigurations, filterFields, refetchWithSiblings]);

  // Drop hash entries for removed fields.
  useEffect(() => {
    const live = new Set(filterFields.map((f) => f.id));
    siblingHashByFieldRef.current.forEach((_hash, fieldId) => {
      if (!live.has(fieldId)) {
        siblingHashByFieldRef.current.delete(fieldId);
      }
    });
  }, [filterFields]);

  return {
    setValueListMode,
    refetchWithValueListContext,
  };
}
