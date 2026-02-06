import { Field } from '../types';

/**
 * In-memory drag data store.
 *
 * Browsers can silently lose DataTransfer payload data in long-running tabs
 * (memory pressure, security policy changes, etc.), which causes
 * `JSON.parse(e.dataTransfer.getData(...))` to throw on an empty string.
 *
 * This module keeps the drag payload in a plain JS variable so that the data
 * is always available for the drop handler regardless of browser state.
 * DataTransfer is still set as a best-effort secondary channel.
 */

export interface DragPayload {
  fields: Field[];
  source: string;
  indices: number[];
}

let currentPayload: DragPayload | null = null;

/** Store the drag payload at drag-start. */
export function setDragData(payload: DragPayload): void {
  currentPayload = payload;
}

/** Retrieve the current drag payload (returns null if nothing is being dragged). */
export function getDragData(): DragPayload | null {
  return currentPayload;
}

/** Clear the stored payload (call on drag-end or after drop). */
export function clearDragData(): void {
  currentPayload = null;
}

/**
 * Read drag payload from the in-memory store (primary) or from the
 * DataTransfer object (fallback).  Returns null when both fail.
 */
export function readDragPayload(dataTransfer?: DataTransfer): DragPayload | null {
  // Primary: in-memory store – always works
  if (currentPayload) {
    return currentPayload;
  }

  // Fallback: try DataTransfer (may be empty in degraded browser state)
  if (dataTransfer) {
    try {
      const raw =
        dataTransfer.getData('application/json') ||
        dataTransfer.getData('text/plain');
      if (raw) {
        const parsed = JSON.parse(raw);
        // Normalise legacy single-field format
        if (parsed.field && !parsed.fields) {
          return {
            fields: [parsed.field],
            source: parsed.source,
            indices: parsed.index !== undefined ? [parsed.index] : [-1],
          };
        }
        return {
          fields: parsed.fields || [],
          source: parsed.source,
          indices: parsed.indices || [],
        };
      }
    } catch {
      // DataTransfer data is corrupt / empty – nothing we can do
    }
  }

  return null;
}
