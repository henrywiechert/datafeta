// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { Field } from '../types';
import { dateTimeOutputName, resolveDateTime } from '../datetime/datetimeSemantics';

/**
 * Backend aliases datetime parts as `${field}_${date_part}_${date_mode}`.
 * Local DuckDB tables preserve those output column names, so any local SQL must
 * refer to the aliased output name, not the raw base column.
 *
 * Part-only by rule: "Full DateTime" keeps the plain column name.
 */
export function getFieldOutputColumnName(field: Field): string {
  return dateTimeOutputName(field.columnName, resolveDateTime(field));
}


