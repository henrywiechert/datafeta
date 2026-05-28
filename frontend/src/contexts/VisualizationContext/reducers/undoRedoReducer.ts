// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { VisualizationState, VisualizationAction } from '../types';
import { PERSISTED_STATE_KEYS } from '../persistedKeys';

/**
 * Handles undo/redo state restoration.
 *
 * Restoration is declarative: for each persisted key, the snapshot value is
 * applied when present (including explicit `null`), otherwise the current
 * value is kept. The set of restored keys is PERSISTED_STATE_KEYS.
 */
export function undoRedoReducer(state: VisualizationState, action: VisualizationAction): VisualizationState | null {
  switch (action.type) {
    case 'RESTORE_UNDOABLE_STATE': {
      const restored: VisualizationState = { ...state };
      for (const key of PERSISTED_STATE_KEYS) {
        const value = action.payload[key];
        if (value !== undefined) {
          (restored as unknown as Record<string, unknown>)[key] = value;
        }
      }
      restored.queryVersion = state.queryVersion + 1;
      return restored;
    }
    default:
      return null; // Not handled by this reducer
  }
}

