// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only

// Tiny pub/sub used to break the cyclic dependency between ConnectionContext
// (global) and VisualizationContext (per-sheet). ConnectionContext emits
// 'connection:reset' on connect/disconnect; the active per-sheet
// VisualizationProvider subscribes and dispatches RESET_QUERY_STATE.
//
// Keeping this out of React context lets ConnectionProvider live above the
// per-sheet VisualizationProvider without needing an outer "legacy" instance.

type ResetEvent = 'connection:reset';
type Listener = () => void;

const listeners: Record<ResetEvent, Set<Listener>> = {
  'connection:reset': new Set(),
};

export const resetBus = {
  emit(event: ResetEvent): void {
    listeners[event].forEach((fn) => {
      try {
        fn();
      } catch (err) {
        // Never let one subscriber break the others.
        // eslint-disable-next-line no-console
        console.error('[resetBus] listener threw for', event, err);
      }
    });
  },

  subscribe(event: ResetEvent, fn: Listener): () => void {
    listeners[event].add(fn);
    return () => {
      listeners[event].delete(fn);
    };
  },
};
