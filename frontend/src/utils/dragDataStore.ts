// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
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

/**
 * Attribute set on <body> while a field drag is in flight, holding the drag
 * source. Global CSS (index.css) uses it to frame every `.df-drop-target`.
 */
const DRAG_ACTIVE_ATTRIBUTE = 'data-field-drag';

function showDropTargets(source: string): void {
  if (typeof document === 'undefined') return;
  document.body.setAttribute(DRAG_ACTIVE_ATTRIBUTE, source);
}

function hideDropTargets(): void {
  if (typeof document === 'undefined') return;
  document.body.removeAttribute(DRAG_ACTIVE_ATTRIBUTE);
}

// A chip removed by its own drop never receives `dragend`, so the highlight
// is also dropped when any drop lands. This leaves the payload alone: the drop
// handlers still need to read it.
if (typeof document !== 'undefined') {
  document.addEventListener('drop', hideDropTargets, true);
}

/** Store the drag payload at drag-start. */
export function setDragData(payload: DragPayload): void {
  currentPayload = payload;
  // Deferred so the style change does not land inside the browser's
  // drag-start; skipped if the drag already ended.
  setTimeout(() => {
    if (currentPayload === payload) showDropTargets(payload.source);
  }, 0);
}

/** Retrieve the current drag payload (returns null if nothing is being dragged). */
export function getDragData(): DragPayload | null {
  return currentPayload;
}

/** Clear the stored payload (call on drag-end or after drop). */
export function clearDragData(): void {
  currentPayload = null;
  hideDropTargets();
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
