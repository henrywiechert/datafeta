// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { Field } from '../types';

/**
 * Backend aliases datetime parts as `${field}_${date_part}_${date_mode}`.
 * Local DuckDB tables preserve those output column names, so any local SQL must
 * refer to the aliased output name, not the raw base column.
 */
export function getFieldOutputColumnName(field: Field): string {
  if ((field as any).dateTimePart && (field as any).dateTimeMode) {
    return `${field.columnName}_${(field as any).dateTimePart}_${(field as any).dateTimeMode}`;
  }
  return field.columnName;
}


