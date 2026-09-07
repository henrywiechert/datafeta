// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * useCurrentSnapshot – identity of the server snapshot currently open in the
 * workspace, plus whether it has unsaved edits.
 *
 * This is what turns snapshots into documents: knowing which snapshot is open
 * lets "Save" update it in place instead of forcing the user to re-pick it in
 * the gallery (and risk overwriting the wrong one).
 */

import { useCallback, useRef, useState } from 'react';
import { SavedConfiguration, SnapshotMetadata } from '../types';

/** The subset of snapshot metadata needed to identify and label the open config. */
export interface CurrentSnapshotIdentity {
  id: string;
  name: string;
  folder: string;
}

/**
 * Serialise a configuration for change detection.
 *
 * `exportConfiguration` stamps a fresh `exportedAt` on every call, so it has to
 * be excluded — otherwise a config never compares equal to itself and the
 * workspace would read as permanently dirty.
 */
export function stableConfigKey(config: SavedConfiguration): string {
  return JSON.stringify({ ...config, exportedAt: undefined });
}

export interface UseCurrentSnapshotResult {
  /** The open snapshot, or null when the workspace is untitled. */
  current: CurrentSnapshotIdentity | null;
  /** True when the configuration differs from what was last loaded or saved. */
  isDirty: boolean;
  /** Take on the identity of a snapshot (after loading it, or after Save As). */
  adopt: (meta: SnapshotMetadata | CurrentSnapshotIdentity) => void;
  /** Forget the open snapshot — the workspace becomes untitled. */
  clear: () => void;
  /** Record `config` as the saved state, clearing the dirty flag. */
  markSaved: (config: SavedConfiguration) => void;
  /** Re-compare `config` against the saved state and update `isDirty`. */
  recomputeDirty: (config: SavedConfiguration) => void;
}

export function useCurrentSnapshot(): UseCurrentSnapshotResult {
  const [current, setCurrent] = useState<CurrentSnapshotIdentity | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  // Kept in a ref: the baseline is only ever read inside callbacks, and making
  // it state would re-render every consumer on each comparison.
  const baselineRef = useRef<string | null>(null);

  const adopt = useCallback((meta: SnapshotMetadata | CurrentSnapshotIdentity) => {
    setCurrent({ id: meta.id, name: meta.name, folder: meta.folder ?? '' });
    // The caller marks the baseline once the loaded state has actually landed;
    // until then there is nothing meaningful to compare against.
    baselineRef.current = null;
    setIsDirty(false);
  }, []);

  const clear = useCallback(() => {
    setCurrent(null);
    baselineRef.current = null;
    setIsDirty(false);
  }, []);

  const markSaved = useCallback((config: SavedConfiguration) => {
    baselineRef.current = stableConfigKey(config);
    setIsDirty(false);
  }, []);

  const recomputeDirty = useCallback((config: SavedConfiguration) => {
    // Nothing open, or no baseline captured yet: dirtiness is not meaningful.
    if (baselineRef.current === null) return;
    setIsDirty(stableConfigKey(config) !== baselineRef.current);
  }, []);

  return { current, isDirty, adopt, clear, markSaved, recomputeDirty };
}
