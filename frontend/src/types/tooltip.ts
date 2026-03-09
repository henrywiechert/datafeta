/**
 * Tooltip Types
 *
 * Shared type definitions for the custom tooltip system.
 * Used by CustomTooltip component, useChartTooltip hook, chart generators,
 * and tooltip event listener infrastructure.
 */

import { Field } from './field';

/**
 * Represents a single field displayed in a chart tooltip.
 */
export interface TooltipField {
  /** Display label (rendered bold) */
  label: string;
  /** Display value (may be formatted) */
  value: string | number;
  /** Optional pre-formatted display string */
  formattedValue?: string;
  /**
   * The originating Field object, when available.
   * Enables interactive features (e.g. filter-from-tooltip) by carrying
   * column metadata, data type, and flavour information.
   */
  sourceField?: Field;
  /**
   * The raw (unformatted) value from the data row.
   * Preserves the original type for use in filter actions,
   * where the formatted string representation would be insufficient.
   */
  rawValue?: any;
}

/** Action type for tooltip-initiated filtering */
export type TooltipFilterAction = 'keep' | 'exclude' | 'filter-visible';

/**
 * Configuration for custom tooltip behaviour on a chart.
 * Attached to Observable Plot options as `__customTooltip`.
 */
export interface CustomTooltipConfig {
  /** Whether custom tooltips are enabled for this chart */
  enabled: boolean;
  /** Factory that extracts tooltip fields from a data row */
  getFields: (data: any) => TooltipField[];
  /** Original data array for index-based fallback lookup */
  data?: any[];
  /**
   * Callback for filter actions triggered from a pinned tooltip.
   * Injected post-hoc by ChartArea after chart generation.
   */
  onFilterAction?: (action: TooltipFilterAction, field: TooltipField) => void;
}
