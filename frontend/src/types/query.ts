// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Query API Types
 * Query description, results, and related types
 */

import type { DateTimePart, DateTimeMode, Flavour } from './field';
import { VirtualTableDefinition } from './multiTable';
import { VirtualColumnDefinition } from './virtualColumn';

// --- Column Casting Types --- //

export interface ColumnCastConfig {
  cast_type: 'BIGINT' | 'INTEGER' | 'DOUBLE' | 'FLOAT' | 'VARCHAR';
  replacement_pattern?: string;
}

export type ColumnCasts = Record<string, ColumnCastConfig>;

// --- Query Building Types --- //

export interface WindowCalc {
  function: 'difference' | 'running_sum';
  /** Output alias of the ordering dimension (e.g. "ts_day_timeline") */
  order_by_field: string;
  /** Output aliases of the partitioning dimensions (all other dims) */
  partition_by: string[];
}

export interface Measure {
  field: string;
  aggregation: 'sum' | 'avg' | 'count' | 'count_distinct' | 'min' | 'max';
  alias: string;
  /** Optional post-aggregation table calculation (computed via window functions) */
  window_calc?: WindowCalc;
}

export interface Filter {
  field: string;
  operator: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'in' | 'not in' | 'like' | 'ilike' | 'not like' | 'not ilike' | 'is null' | 'is not null';
  value: any;
  date_part?: DateTimePart;
  date_mode?: DateTimeMode;
  /** 'row' → WHERE clause (default); 'group' → HAVING clause (measure/aggregation filters) */
  scope?: 'row' | 'group';
}

export interface OrderBy {
  field: string;
  direction?: 'asc' | 'desc';
}

export interface TableRowsSortModel {
  field: string;
  direction: 'asc' | 'desc';
}

export interface Dimension {
  field: string;
  flavour: Flavour;
  axis?: 'x' | 'y';
  date_part?: DateTimePart;
  date_mode?: DateTimeMode;
}

// --- Result Budget Types --- //

export interface ResultBudget {
  max_rows: number;
  strategy: 'none' | 'random' | 'stratified' | 'preserve_extremes';
  stratify_field?: string;
  min_per_stratum?: number;
  preserve_fields?: string[];
}

// --- CDF (Cumulative Distribution Function) Types --- //

export interface CdfField {
  field: string;   // source column name
  alias: string;   // output alias for the cdf value (e.g., "revenue__cdf")
}

export interface BoxPlotField {
  field: string;   // source column name
  alias: string;   // output alias for the summarized value field
  date_part?: DateTimePart;
  date_mode?: DateTimeMode;
}

// --- Query Description --- //

export interface QueryDescription {
  target_table: string;
  target_database?: string;
  dimensions?: Dimension[];
  measures?: Measure[];
  filters?: Filter[];
  orderBy?: OrderBy[];
  limit?: number;
  offset?: number;
  optimization_hints?: OptimizationHints;
  column_casts?: ColumnCasts;
  label_fields?: string[];
  virtual_table?: VirtualTableDefinition;
  virtual_columns?: VirtualColumnDefinition[];
  result_budget?: ResultBudget;
  force_raw_rows?: boolean;
  query_mode?: 'standard' | 'cdf' | 'box_plot';
  cdf_fields?: CdfField[];
  cdf_partition_fields?: string[];
  box_plot_fields?: BoxPlotField[];
  box_plot_color_field?: string;
}

// --- Query Result Types --- //

export interface QueryResultColumn {
  name: string;
  type: string;
}

export interface SamplingInfo {
  /** The budget limit that was applied */
  limit: number;
  /** Whether this was a point budget or line budget */
  type: 'point' | 'line';
}

export interface QueryResult {
  columns: QueryResultColumn[];
  rows: { [key: string]: any }[];
  row_count: number;
  query_sql?: string;
  error?: string;
  optimizations_applied?: OptimizationMetadata[];
  original_estimate?: number;
  reduction_factor?: number;
  optimization_hints_used?: OptimizationHints | null;
  optimization_override?: OptimizationOverride | null;
  result_dimensions?: ResultDimensions;
  label_fields?: string[];
  /** Present when the result was capped by a sampling budget */
  sampled?: SamplingInfo;
}

// --- Optimization Types --- //

export interface FieldOptimizationHint {
  field: string;
  enable_rounding: boolean;
  rounding_threshold?: number;
  enable_sampling: boolean;
  sampling_rate?: number;
  reason: string;
}

export interface OptimizationHints {
  field_hints?: FieldOptimizationHint[];
  enable_global_distinct?: boolean;
  // DEPRECATED but kept for backward compatibility
  enable_distinct?: boolean;
  enable_rounding?: boolean;
  enable_sampling?: boolean;
  enable_binning?: boolean;
  rounding_threshold?: number;
  optimization_level: 'none' | 'light' | 'balanced' | 'aggressive';
  purpose?: string;
}

export interface OptimizationOverride {
  skip_all_optimizations: boolean;
  reason: 'table_too_small' | 'user_disabled' | 'query_too_simple' | 'other';
  table_stats?: {
    row_count: number;
    column_count: number;
    threshold: number;
  };
}

export interface ResultDimensions {
  rows: number;
  columns: number;
  size_display: string;
}

export interface OptimizationMetadata {
  strategy: string;
  reduction?: string;
  rounding_config?: Record<string, number>;
  details?: string;
}
