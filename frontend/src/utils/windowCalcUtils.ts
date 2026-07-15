// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Window Calculation (Table Calc) Utilities
 *
 * Window calcs (difference, percent difference, running sum) are computed by
 * the backend in an outer window-function SELECT over the aggregated result.
 * They require an ordering dimension (ideally a timeline datetime bucket) on
 * the shelf (axes or tooltip); all other dimensions become the PARTITION BY.
 */

import type { Field, WindowCalcType } from '../types';

export const WINDOW_CALC_OPTIONS: { value: WindowCalcType; label: string }[] = [
  { value: 'difference', label: 'Difference' },
  { value: 'percent_difference', label: '% Difference' },
  { value: 'running_sum', label: 'Running Sum' },
];

/**
 * Find the dimension a window calc should ORDER BY, or undefined if the
 * shelf has no eligible ordering dimension (calc is then not applicable).
 *
 * Preference order:
 * 1. Timeline datetime part dimension (e.g. day/week buckets)
 * 2. Continuous datetime dimension (raw timestamps)
 * 3. Any other continuous dimension (e.g. numeric buckets)
 */
export function findWindowCalcOrderByDimension(fields: Field[]): Field | undefined {
  const dims = fields.filter((f) => f.type === 'dimension');
  return (
    dims.find((d) => Boolean(d.dateTimePart) && d.dateTimeMode === 'timeline') ||
    dims.find((d) => d.dataType === 'datetime' && d.flavour === 'continuous') ||
    dims.find((d) => d.flavour === 'continuous')
  );
}

/** Whether a window calc can currently be applied given the fields on the shelves. */
export function hasWindowCalcOrderByDimension(fields: Field[]): boolean {
  return findWindowCalcOrderByDimension(fields) !== undefined;
}
