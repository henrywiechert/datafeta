// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { Field } from '../../types';
import { getResultColumnName } from '../../utils/fieldUtils';

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
export const SHAPE_OTHER_LABEL = 'Other';

/**
 * Computed shape scale info for a discrete field.
 */
export interface ShapeScaleInfo {
  /** Ordered top-N domain values (excluding Other). */
  domain: any[];
  /** All raw domain values, including null when present. */
  allValues: any[];
  /** Raw values represented by the Other bucket, including null when present. */
  otherValues: any[];
  /** Mapping from raw value (stringified) to Observable Plot symbol name. */
  symbolMap: Record<string, string>;
  /** Symbol to use for values outside the top-N domain (and nulls). */
  otherSymbol: string;
  /** True when the data has values outside the top-N domain. */
  hasOther: boolean;
  /** Full ordered legend entries including "Other" when present. */
  legendEntries: Array<{ value: any; label: string; symbol: string }>;
}

/**
 * Derive shape scale info from query result rows for a discrete field.
 *
 * Domain ordering: frequency descending, ties broken alphabetically.
 * Top-N categories get individual symbols; everything else (including nulls)
 * maps to the "Other" symbol.
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
  const columnName = getResultColumnName(field);

  // Count occurrences per value
  const counts = new Map<any, number>();
  let nullCount = 0;
  for (const row of rows) {
    const val = row[columnName];
    if (val === null || val === undefined) {
      nullCount++;
    } else {
      counts.set(val, (counts.get(val) ?? 0) + 1);
    }
  }

  // Sort by frequency desc, then alphabetically for deterministic output
  const sorted = Array.from(counts.entries()).sort(([aVal, aCount], [bVal, bCount]) => {
    if (bCount !== aCount) return bCount - aCount;
    return String(aVal).localeCompare(String(bVal));
  });

  // Take top-N
  const topEntries = sorted.slice(0, topN);
  const domain = topEntries.map(([val]) => val);
  const allValues = [
    ...sorted.map(([val]) => val),
    ...(nullCount > 0 ? [null] : []),
  ];
  const otherValues = [
    ...sorted.slice(topN).map(([val]) => val),
    ...(nullCount > 0 ? [null] : []),
  ];

  // Build symbol map
  const symbolMap: Record<string, string> = {};
  topEntries.forEach(([val], index) => {
    symbolMap[String(val)] = SHAPE_SYMBOLS[index % SHAPE_SYMBOLS.length];
  });

  const hasOther = sorted.length > topN || nullCount > 0;

  // Build legend entries
  const legendEntries: ShapeScaleInfo['legendEntries'] = domain.map((val, index) => ({
    value: val,
    label: val === null || val === undefined ? 'NULL' : String(val),
    symbol: SHAPE_SYMBOLS[index % SHAPE_SYMBOLS.length],
  }));

  if (hasOther) {
    const onlyNullInOther = otherValues.length > 0 && otherValues.every(val => val === null || val === undefined);
    legendEntries.push({
      value: SHAPE_OTHER_LABEL,
      label: onlyNullInOther ? 'NULL' : SHAPE_OTHER_LABEL,
      symbol: SHAPE_OTHER_SYMBOL,
    });
  }

  return {
    domain,
    allValues,
    otherValues,
    symbolMap,
    otherSymbol: SHAPE_OTHER_SYMBOL,
    hasOther,
    legendEntries,
  };
}

/**
 * Look up the symbol name for a given raw value using a ShapeScaleInfo.
 * Values not in the domain (and nulls) return the otherSymbol.
 */
export function getSymbolForValue(value: any, scaleInfo: ShapeScaleInfo): string {
  if (value === null || value === undefined) return scaleInfo.otherSymbol;
  return scaleInfo.symbolMap[String(value)] ?? scaleInfo.otherSymbol;
}
