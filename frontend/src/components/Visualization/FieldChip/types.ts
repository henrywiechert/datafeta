// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import type { Field, DragSource as GlobalDragSource } from '../../../types';

// Re-export DragSource for local consumers (chipStyles, etc.), but keep it aligned
// with the global DragSource union.
export type DragSource = GlobalDragSource;

export interface FieldChipProps {
  field: Field;
  source: DragSource;
  onUpdate: (fields: Field | Field[]) => void; // Accepts single field or array
  index?: number;
  isInvalidOnAxis?: boolean;
  allFields?: Field[]; // For range selection
  onCreateBins?: (field: Field) => void; // Callback for "Create Bins..." action
}
