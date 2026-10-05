// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { Field } from '../../types';
import { getResultColumnName } from '../../utils/fieldUtils';

/** Default label for the bucket holding overflow values and nulls. */
export const DISCRETE_OTHER_LABEL = 'Other';

export interface DiscretePaletteLegendEntry<T> {
  /** Raw value, or the Other label for the Other bucket. */
  value: any;
  label: string;
  item: T;
  /** True for the Other bucket, which stands for `otherValues`. */
  isOther: boolean;
}

/**
 * A discrete field mapped onto a fixed palette (symbols, dash patterns, ...):
 * the top-N values each get a palette item, everything else (including nulls)
 * shares the Other item.
 */
export interface DiscretePaletteScale<T> {
  /** Ordered top-N domain values (excluding Other). */
  domain: any[];
  /** All raw domain values, including null when present. */
  allValues: any[];
  /** Raw values represented by the Other bucket, including null when present. */
  otherValues: any[];
  /** Mapping from raw value (stringified) to palette item. */
  valueMap: Record<string, T>;
  /** Item for values outside the top-N domain (and nulls). */
  otherItem: T;
  /** True when the data has values outside the top-N domain. */
  hasOther: boolean;
  /** Full ordered legend entries including Other when present. */
  legendEntries: DiscretePaletteLegendEntry<T>[];
}

export interface DiscretePaletteOptions<T> {
  palette: readonly T[];
  otherItem: T;
  /** Maximum number of distinct values before bucketing into Other (default: palette size). */
  topN?: number;
  otherLabel?: string;
}

/**
 * Derive a palette scale from query result rows for a discrete field.
 *
 * Domain ordering: frequency descending, ties broken alphabetically.
 * Top-N values get palette items in order; everything else (including nulls)
 * maps to the Other item.
 */
export function deriveDiscretePaletteScale<T>(
  rows: any[],
  field: Field,
  options: DiscretePaletteOptions<T>,
): DiscretePaletteScale<T> {
  const { palette, otherItem, topN = palette.length, otherLabel = DISCRETE_OTHER_LABEL } = options;
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

  const itemAt = (index: number) => palette[index % palette.length];

  const valueMap: Record<string, T> = {};
  topEntries.forEach(([val], index) => {
    valueMap[String(val)] = itemAt(index);
  });

  const hasOther = sorted.length > topN || nullCount > 0;

  const legendEntries: DiscretePaletteLegendEntry<T>[] = domain.map((val, index) => ({
    value: val,
    label: val === null || val === undefined ? 'NULL' : String(val),
    item: itemAt(index),
    isOther: false,
  }));

  if (hasOther) {
    const onlyNullInOther = otherValues.length > 0 && otherValues.every(val => val === null || val === undefined);
    legendEntries.push({
      value: otherLabel,
      label: onlyNullInOther ? 'NULL' : otherLabel,
      item: otherItem,
      isOther: true,
    });
  }

  return {
    domain,
    allValues,
    otherValues,
    valueMap,
    otherItem,
    hasOther,
    legendEntries,
  };
}

/**
 * Look up the palette item for a raw value. Values not in the domain (and
 * nulls) return the Other item.
 */
export function getPaletteItemForValue<T>(value: any, scale: DiscretePaletteScale<T>): T {
  if (value === null || value === undefined) return scale.otherItem;
  return scale.valueMap[String(value)] ?? scale.otherItem;
}
