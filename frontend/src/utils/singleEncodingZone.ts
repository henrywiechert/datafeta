// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { v4 as uuidv4 } from 'uuid';
import { DragSource, Field } from '../types';

interface ResolveSingleEncodingDropFieldOptions {
  field: Field;
  source: DragSource | null;
  zoneSource: DragSource;
  availableFields?: Field[];
  requiredFlavour?: Field['flavour'];
}

/**
 * Resolve a dropped field for a single-field encoding zone.
 *
 * Behavior:
 * - Dropping from the same zone preserves the existing field instance.
 * - Dropping from any other source creates an independent field copy.
 * - When availableFields are provided, AVAILABLE_FIELDS drops are resolved from
 *   the current field registry to pick up the latest field metadata.
 * - requiredFlavour rejects unsupported fields (e.g. shape/background).
 */
export function resolveSingleEncodingDropField({
  field,
  source,
  zoneSource,
  availableFields,
  requiredFlavour,
}: ResolveSingleEncodingDropFieldOptions): Field | null {
  const sourceField =
    source === 'AVAILABLE_FIELDS' && availableFields
      ? availableFields.find(candidate => candidate.id === field.id) ?? null
      : field;

  if (!sourceField) {
    return null;
  }

  if (requiredFlavour && sourceField.flavour !== requiredFlavour) {
    return null;
  }

  if (source === zoneSource) {
    return sourceField;
  }

  return { ...sourceField, id: uuidv4() };
}