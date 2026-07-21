// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
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
  /**
   * When > 0, indicates that additional distinct values exist for this field
   * in the same chart cell beyond the one being displayed. Used by heatmaps
   * when tooltip-panel fields are not fully grouped by the cell dimensions.
   */
  extraCount?: number;
}

/** Comparison row for pinned line-chart tooltip expansion. */
export interface PinnedTooltipComparisonItem {
  /** Stable series identity within the current plot cell. */
  seriesKey: string;
  /** Human-readable series label. */
  seriesLabel: string;
  /** Explicit series color for comparison rows. */
  colorHex?: string;
  /** Raw plotted value for the current series at the selected X position. */
  value: string | number;
  /** Optional formatted display string for the value. */
  formattedValue?: string;
  /** Percent difference relative to the selected plotted value. */
  percentDifference?: number;
  /** Whether this row matches the selected plotted series. */
  isSelected: boolean;
}

/** Pinned comparison panel metadata for line charts. */
export interface PinnedTooltipComparison {
  /** Human-readable title for the comparison panel. */
  title: string;
  /** Clarifies that comparison is based on plotted dots, not raw rows. */
  comparisonBasis: 'plotted-dots';
  /** Display label for the selected X channel. */
  xLabel: string;
  /** Raw X value used for comparison. */
  xValue: any;
  /** Formatted X value for display. */
  xFormattedValue: string;
  /** Display label for the compared value axis. */
  valueLabel: string;
  /** Series rows visible at the selected X position in the current plot cell. */
  items: PinnedTooltipComparisonItem[];
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
  /** Whether the interaction layer should render a transient X guide line. */
  showVerticalGuideLine?: boolean;
  /** Optional pinned comparison payload for supported charts such as lines. */
  getPinnedComparison?: (data: any) => PinnedTooltipComparison | undefined;
  /**
   * Callback for filter actions triggered from a pinned tooltip.
   * Injected post-hoc by ChartArea after chart generation.
   */
  onFilterAction?: (action: TooltipFilterAction, field: TooltipField) => void;
}
