// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { Field } from '../../../types';

/**
 * Shallow compare field arrays (order significant).
 * Compares id and isInvalid flag to detect validation state changes.
 */
export function sameFieldArray(a: Field[], b: Field[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id) return false;
    // Also detect isInvalid changes (for schema validation highlighting)
    if (a[i].isInvalid !== b[i].isInvalid) return false;
  }
  return true;
}

