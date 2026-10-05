// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { Field } from '../../types';
import {
  DISCRETE_OTHER_LABEL,
  DiscretePaletteScale,
  deriveDiscretePaletteScale,
  getPaletteItemForValue,
} from './discretePaletteScale';

/**
 * Observable Plot built-in symbol names available for shape encoding.
 * Using 7 primary symbols + 1 dedicated "Other" symbol (asterisk).
 */
export const SHAPE_SYMBOLS: string[] = [
  'circle',
  'square',
  'diamond',
  'triangle',
  'star',
  'cross',
  'wye',
];

/** Symbol reserved for the "Other" bucket (top-N overflow and nulls). */
export const SHAPE_OTHER_SYMBOL = 'asterisk';

/** Manual option representing plain filled dots (no shape encoding). */
export const MANUAL_NO_SHAPE = 'none';

/** All symbols available for manual single-shape selection. */
export const MANUAL_SHAPE_SYMBOLS = [...SHAPE_SYMBOLS] as const;

export type ShapeSymbolName = typeof SHAPE_SYMBOLS[number] | typeof SHAPE_OTHER_SYMBOL;
export type ManualShapeOption = typeof MANUAL_NO_SHAPE | typeof MANUAL_SHAPE_SYMBOLS[number];

/** Manual palette options in UI order. */
export const MANUAL_SHAPE_OPTIONS = [
  MANUAL_NO_SHAPE,
  ...MANUAL_SHAPE_SYMBOLS,
] as const;

/** Default manual shape when no shape field is assigned. */
export const DEFAULT_MANUAL_SHAPE: ManualShapeOption = MANUAL_NO_SHAPE;

export function isManualShapeOption(value: string | null | undefined): value is ManualShapeOption {
  return value === MANUAL_NO_SHAPE || MANUAL_SHAPE_SYMBOLS.includes(value as typeof MANUAL_SHAPE_SYMBOLS[number]);
}

export function resolveManualShapeOption(value: string | null | undefined): ManualShapeOption {
  return isManualShapeOption(value) ? value : DEFAULT_MANUAL_SHAPE;
}

/** Maximum number of distinct categories before bucketing into "Other". */
export const SHAPE_TOP_N = 7;

/** Sentinel string label used for the "Other" bucket. */
export const SHAPE_OTHER_LABEL = DISCRETE_OTHER_LABEL;

/** Shape scale info for a discrete field; palette items are symbol names. */
export type ShapeScaleInfo = DiscretePaletteScale<string>;

/**
 * Derive shape scale info from query result rows for a discrete field.
 * See `deriveDiscretePaletteScale` for domain ordering and Other bucketing.
 *
 * @param rows - Query result rows
 * @param field - The shape encoding field (must be discrete)
 * @param topN - Maximum number of distinct categories (default: SHAPE_TOP_N)
 */
export function deriveShapeScaleInfo(
  rows: any[],
  field: Field,
  topN: number = SHAPE_TOP_N
): ShapeScaleInfo {
  return deriveDiscretePaletteScale(rows, field, {
    palette: SHAPE_SYMBOLS,
    otherItem: SHAPE_OTHER_SYMBOL,
    topN,
    otherLabel: SHAPE_OTHER_LABEL,
  });
}

/**
 * Look up the symbol name for a given raw value using a ShapeScaleInfo.
 * Values not in the domain (and nulls) return the Other symbol.
 */
export function getSymbolForValue(value: any, scaleInfo: ShapeScaleInfo): string {
  return getPaletteItemForValue(value, scaleInfo);
}
