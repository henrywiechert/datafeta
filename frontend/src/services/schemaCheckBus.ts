// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { SchemaCheckResult } from '../utils/schemaValidation';

type Listener = (result: SchemaCheckResult) => void;

let pendingAfterLoad = false;
const listeners = new Set<Listener>();

export const schemaCheckBus = {
  requestAfterLoad(): void {
    pendingAfterLoad = true;
  },

  consumePendingAfterLoad(): boolean {
    const pending = pendingAfterLoad;
    pendingAfterLoad = false;
    return pending;
  },

  emit(result: SchemaCheckResult): void {
    listeners.forEach((fn) => {
      try {
        fn(result);
      } catch (err) {
        console.error('[schemaCheckBus] listener threw', err);
      }
    });
  },

  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
