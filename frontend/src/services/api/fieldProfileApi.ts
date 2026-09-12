// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Field Profile API Service ("Quick View")
 *
 * Profiles describe the raw column and ignore active filters, so a result stays
 * valid while filters are edited. That makes the in-memory cache below both safe
 * and effective: hovering the same field twice never hits the network twice.
 */

import { FieldProfile, FieldProfileRequest } from '../../types';
import { API_BASE_URL, fetchWithErrorHandling } from './apiClient';

/** Entries older than this are refetched, so a changed table is not shown forever. */
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 100;

interface CacheEntry {
  profile: FieldProfile;
  cachedAt: number;
}

const cache = new Map<string, CacheEntry>();

function cacheKey(request: FieldProfileRequest): string {
  return JSON.stringify([
    request.database ?? '',
    request.table,
    request.sourceTable ?? '',
    request.field,
    request.profileKind,
    request.dateTimePart ?? '',
    request.dateTimeMode ?? '',
    request.topN ?? 5,
    request.histogramBins ?? 24,
    request.approximate !== false,
    request.virtualTable ?? null,
    request.virtualColumns ?? null,
  ]);
}

function readCache(key: string): FieldProfile | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  // Refresh insertion order so the LRU eviction below keeps hot entries.
  cache.delete(key);
  cache.set(key, entry);
  return entry.profile;
}

function writeCache(key: string, profile: FieldProfile): void {
  cache.set(key, { profile, cachedAt: Date.now() });
  while (cache.size > CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
}

export const fieldProfileApi = {
  /**
   * Statistical profile of a single column.
   *
   * Takes an explicit `signal` rather than falling back to the shared abort
   * controller: a cancelled hover must not cancel unrelated metadata requests.
   */
  async getFieldProfile(
    request: FieldProfileRequest,
    signal?: AbortSignal,
  ): Promise<FieldProfile> {
    const key = cacheKey(request);
    const cached = readCache(key);
    if (cached) return cached;

    const response = await fetchWithErrorHandling(
      `${API_BASE_URL}/field-profile`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      },
      signal,
    );

    const profile: FieldProfile = await response.json();
    writeCache(key, profile);
    return profile;
  },

  /** Drop cached profiles; call when the connection or table composition changes. */
  clearFieldProfileCache(): void {
    cache.clear();
  },
};
