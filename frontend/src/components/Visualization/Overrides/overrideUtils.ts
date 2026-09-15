// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { Field, DragSource } from '../../../types';
import { readDragPayload } from '../../../utils/dragDataStore';

/**
 * Safely parses drag event data and returns the field and source if present
 */
export const parseDragData = (e: React.DragEvent): { field: Field | null; source: DragSource | null } => {
  const payload = readDragPayload(e.nativeEvent.dataTransfer ?? undefined);
  if (payload && payload.fields.length > 0) {
    return { field: payload.fields[0], source: (payload.source as DragSource) || null };
  }
  return { field: null, source: null };
};

