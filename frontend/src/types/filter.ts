/**
 * Filter Types
 * Filter configuration and metadata
 */

import { DateTimePart, DateTimeMode } from './field';

export type FilterType = 'discrete' | 'continuous' | 'datetime';

// Base filter configuration
interface BaseFilterConfig {
  fieldId: string;
  columnName: string;
  type: FilterType;
  dateTimePart?: DateTimePart;
  dateTimeMode?: DateTimeMode;
}

// Discrete filter: user selects from available values
export interface DiscreteFilterConfig extends BaseFilterConfig {
  type: 'discrete';
  selectedValues: any[];
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
