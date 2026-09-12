// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Field Profile ("Quick View") types — mirror of backend/models/query.py.
 */

import { VirtualColumnDefinition } from './virtualColumn';
import { VirtualTableDefinition } from './multiTable';

export type ProfileKind = 'numeric' | 'string' | 'datetime' | 'boolean';

export interface FieldProfileRequest {
  field: string;
  table: string;
  database?: string;
  sourceTable?: string;
  dateTimePart?: string;
  dateTimeMode?: string;
  virtualColumns?: VirtualColumnDefinition[];
  virtualTable?: VirtualTableDefinition;
  profileKind: ProfileKind;
  topN?: number;
  histogramBins?: number;
  approximate?: boolean;
}

export interface TopValue {
  value: unknown;
  count: number;
}

export interface HistogramBin {
  lower: number;
  upper: number;
  count: number;
}

export interface NumericProfile {
  min?: number | null;
  max?: number | null;
  mean?: number | null;
  stddev?: number | null;
  q1?: number | null;
  median?: number | null;
  q3?: number | null;
  non_finite_count: number;
  histogram: HistogramBin[];
}

export interface StringProfile {
  min_length?: number | null;
  max_length?: number | null;
  empty_count: number;
  top_values: TopValue[];
}

export interface DatetimeBucket {
  start: string;
  count: number;
}

export interface DatetimeProfile {
  min?: string | null;
  max?: string | null;
  bucket?: string | null;
  buckets: DatetimeBucket[];
}

export interface FieldProfile {
  field: string;
  profile_kind: ProfileKind;
  /** True when distinct_count is a HyperLogLog estimate rather than an exact count. */
  approximate: boolean;
  row_count: number;
  null_count: number;
  distinct_count?: number | null;
  numeric?: NumericProfile | null;
  string?: StringProfile | null;
  datetime?: DatetimeProfile | null;
  duration_ms: number;
  query_sql?: string | null;
}
