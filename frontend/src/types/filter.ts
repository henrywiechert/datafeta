/**
 * Filter Types
 * Filter configuration and metadata
 */

import { DateTimePart, DateTimeMode } from './field';

export type FilterType = 'discrete' | 'continuous' | 'datetime';

// Filter scope: sheet (per-sheet, persisted) or session (global, ephemeral)
export type FilterScope = 'sheet' | 'session';

// Base filter configuration
interface BaseFilterConfig {
  fieldId: string;
  columnName: string;
  type: FilterType;
  dateTimePart?: DateTimePart;
  dateTimeMode?: DateTimeMode;
  // Scope of the filter - 'sheet' (default) or 'session' (global, ephemeral)
  scope?: FilterScope;
  // Whether this filter was created by the chart zoom brush
  isZoomFilter?: boolean;
}

// Discrete filter: user selects from available values
export interface DiscreteFilterConfig extends BaseFilterConfig {
  type: 'discrete';
  selectedValues: any[];
  // Optimization: when excluding fewer values than including, store the exclusion list
  // so the query builder can use NOT IN instead of IN for a smaller query payload.
  excludedValues?: any[];
  totalAvailableCount?: number;
}

// Continuous filter: user sets min/max range
export interface ContinuousFilterConfig extends BaseFilterConfig {
  type: 'continuous';
  min: number | null;
  max: number | null;
}

// DateTime filter: user sets date range
export interface DateTimeFilterConfig extends BaseFilterConfig {
  type: 'datetime';
  startDate: string | null;
  endDate: string | null;
}

// Union type for all filter configurations
export type FilterConfig = DiscreteFilterConfig | ContinuousFilterConfig | DateTimeFilterConfig;

// Metadata for filter configuration (available values or ranges)
interface BaseFilterMetadata {
  fieldId: string;
  columnName: string;
  type: FilterType;
  loading: boolean;
  error?: string;
}

export interface DiscreteFilterMetadata extends BaseFilterMetadata {
  type: 'discrete';
  availableValues: any[];
  totalCount?: number;
  originalTotalCount?: number;
  isPartial?: boolean;
  warningMessage?: string;
  appliedRegexQuery?: string;
}

export interface ContinuousFilterMetadata extends BaseFilterMetadata {
  type: 'continuous';
  min: number;
  max: number;
}

export interface DateTimeFilterMetadata extends BaseFilterMetadata {
  type: 'datetime';
  min: string;
  max: string;
}

export type FilterMetadata = DiscreteFilterMetadata | ContinuousFilterMetadata | DateTimeFilterMetadata;
