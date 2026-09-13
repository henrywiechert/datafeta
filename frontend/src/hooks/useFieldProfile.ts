// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Quick View field profile loading.
 *
 * The fetch is deliberately delayed: the panel opens on hover, and sweeping the
 * mouse down a menu would otherwise fire a query per field. A profile in flight
 * is aborted when the pointer leaves, using a dedicated controller so it cannot
 * cancel unrelated metadata requests (apiClient's default controller is shared).
 *
 * A loaded profile is kept until the request itself changes. Re-entering the panel
 * must not re-query: the pointer can leave and return purely because the panel
 * resized, and a silent re-query would replace an exact distinct count the user
 * explicitly asked for with the estimate again.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Field, FieldProfile, FieldProfileRequest, ProfileKind } from '../types';
import { apiService } from '../apiService';
import { useDataSource } from '../contexts/DataSourceContext';
import { useDataSourceMetadata, useDataSourceMultiTable } from '../contexts/DataSourceContext/hooks';

/** Hover dwell required before a profile query is sent. */
const HOVER_INTENT_MS = 250;

export function getProfileKind(field: Field): ProfileKind {
  if (field.dataType === 'datetime') {
    // An extracted part (year, weekday, ...) is a small category set, which is
    // far more usefully described by its top values than by a min/max range.
    return field.dateTimePart && field.dateTimeMode === 'distinct' ? 'string' : 'datetime';
  }
  if (field.dataType === 'integer' || field.dataType === 'float') {
    return 'numeric';
  }
  return 'string';
}

export interface UseFieldProfileResult {
  profile: FieldProfile | null;
  loading: boolean;
  error: string | null;
  /** Schedule a fetch after the hover-intent delay. */
  start: () => void;
  /** Cancel a pending or in-flight fetch. */
  cancel: () => void;
  /** Refetch with an exact distinct count instead of the HyperLogLog estimate. */
  loadExact: () => void;
}

export function useFieldProfile(field: Field): UseFieldProfileResult {
  const [profile, setProfile] = useState<FieldProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { dataSource } = useDataSource();
  const { selectedTable, selectedDatabase } = useDataSourceMetadata();
  const { virtualTable } = useDataSourceMultiTable();
  const virtualColumns = dataSource.virtualColumns;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  /** Set once a fetch has settled, so hover re-entry does not re-query. */
  const loadedRef = useRef(false);

  const request = useMemo<FieldProfileRequest>(() => ({
    field: field.columnName,
    table: selectedTable,
    database: selectedDatabase || undefined,
    sourceTable: field.sourceTable,
    dateTimePart: field.dateTimePart,
    dateTimeMode: field.dateTimeMode,
    virtualColumns: virtualColumns.length > 0 ? virtualColumns : undefined,
    virtualTable: virtualTable || undefined,
    profileKind: getProfileKind(field),
    topN: 6,
    histogramBins: 24,
    approximate: true,
  }), [field, selectedTable, selectedDatabase, virtualColumns, virtualTable]);

  // Compared by value: `field` is often a fresh object on every render, so an
  // identity-keyed effect would discard the profile continuously.
  const requestKey = JSON.stringify(request);

  useEffect(() => {
    loadedRef.current = false;
    setProfile(null);
    setError(null);
  }, [requestKey]);

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
  }, []);

  const run = useCallback(async (approximate: boolean) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const result = await apiService.getFieldProfile(
        { ...request, approximate },
        controller.signal,
      );
      if (!controller.signal.aborted) {
        setProfile(result);
        loadedRef.current = true;
      }
    } catch (e) {
      if (!controller.signal.aborted) {
        setError(e instanceof Error ? e.message : 'Failed to load field profile');
        loadedRef.current = true;
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setLoading(false);
      }
    }
  }, [request]);

  const start = useCallback(() => {
    if (!selectedTable || loadedRef.current || timerRef.current || abortRef.current) return;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void run(true);
    }, HOVER_INTENT_MS);
  }, [run, selectedTable]);

  const loadExact = useCallback(() => {
    cancel();
    void run(false);
  }, [cancel, run]);

  useEffect(() => cancel, [cancel]);

  return { profile, loading, error, start, cancel, loadExact };
}
