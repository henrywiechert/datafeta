// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { ColorChannel, Field, FieldOverrideState } from '../types';
import { DEFAULT_MANUAL_COLOR, DEFAULT_CATEGORICAL_SCHEME } from '../config/colorSchemes';

/**
 * Merge a per-field color override onto the global color channel and return the
 * effective ColorChannel.
 *
 * This is the single source of truth for color-attribute precedence:
 * - categorical/string attributes (`scheme`, `manual`) fall back with `||`,
 *   so an empty string defers to the next level;
 * - numeric/boolean toggles (`bias`, `reversed`) fall back with `??`,
 *   so an explicit `0`/`false` override is honored.
 *
 * `field` lets callers pass an already-resolved color field (e.g. resolved by
 * id from the field registry). Pass `null` to force "no field"; omit the
 * argument entirely to inherit the global field.
 */
export function resolveColorChannel(
  global: ColorChannel,
  override?: FieldOverrideState,
  field?: Field | null,
): ColorChannel {
  return {
    field: field !== undefined ? field : global.field,
    scheme: override?.colorScheme || global.scheme || DEFAULT_CATEGORICAL_SCHEME,
    bias: override?.colorBias ?? global.bias ?? 0,
    reversed: override?.colorReversed ?? global.reversed ?? false,
    manual: override?.manualColor || global.manual || DEFAULT_MANUAL_COLOR,
  };
}
