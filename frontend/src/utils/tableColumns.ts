// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Helpers for the first-class table view's column list.
 */
import { Field } from '../types';
import { getResultColumnName } from './fieldUtils';

/**
 * Collect all active fields from every encoding channel, deduplicated by their
 * result column name. Returns the original field references (no cloning).
 *
 * Used to seed the table view's "Columns" drop zone from the current chart
 * encodings the first time the view is opened (see Option C seeding).
 */
export function collectEncodingFields(
  xAxisFields: Field[],
  yAxisFields: Field[],
  colorField: Field | null,
  sizeField: Field | null,
  labelFields: Field[],
  tooltipFields: Field[],
): Field[] {
  const seen = new Set<string>();
  const result: Field[] = [];

  const add = (f: Field) => {
    const key = getResultColumnName(f);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(f);
    }
  };

  xAxisFields.forEach(add);
  yAxisFields.forEach(add);
  if (colorField) add(colorField);
  if (sizeField) add(sizeField);
  labelFields.forEach(add);
  tooltipFields.forEach(add);

  return result;
}
