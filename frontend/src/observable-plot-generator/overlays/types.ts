// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Overlay Types
 *
 * Types for overlay marks (regression, moving average, density, reference
 * lines, marginal rug, hexbin, crosshair).
 * Overlays are add-on marks appended to existing chart PlotOptions — they never
 * modify the primary chart handler logic.
 */

import { UserChartType } from '../../types/field';
import { CellChartType } from '../helpers/chartTypeResolver';
import { DEFAULT_MANUAL_COLOR, DEFAULT_OVERLAY_COLOR, DEFAULT_REFERENCE_LINE_COLOR } from '../../config/colorSchemes';

// --- Overlay type identifiers ------------------------------------------------

export type OverlayType = 'linearRegression' | 'movingAverage' | 'density' | 'referenceLines' | 'marginalRug' | 'hexbin' | 'crosshair';

/**
 * Applied to overlay marks that series highlighting must never dim: marks that
 * summarise the whole cell rather than one series, or whose rows are
 * aggregates that cannot be matched to a series.
 */
export const OVERLAY_NO_HIGHLIGHT_CLASS = 'overlay-no-highlight';

/**
 * Applied to marks whose pixel size must not be scaled up in the Zoom facet
 * dialog (e.g. hexbin hexagons, which tile the plot at a fixed bin width).
 */
export const MARK_FIXED_SIZE_CLASS = 'mark-fixed-size';

/** Summary statistics a reference line can mark. */
export type ReferenceStat = 'mean' | 'median' | 'percentile' | 'min' | 'max';

/** Applied to the reference-line rule and label marks. */
export const REFERENCE_LINE_CLASS = 'overlay-reference-line';

/** Clamp a user-entered percentile into (0, 100], keeping at most one decimal. */
export function normalizePercentile(p: number | undefined): number {
  if (typeof p !== 'number' || !Number.isFinite(p)) return 95;
  return Math.round(Math.min(100, Math.max(0.1, p)) * 10) / 10;
}

export const MA_SMOOTHING_MIN = 1;
export const MA_SMOOTHING_MAX = 50;
export const MA_SMOOTHING_DEFAULT = 10;

/** Clamp the moving-average smoothing percentage to the slider range. */
export function normalizeSmoothing(s: number | undefined): number {
  if (typeof s !== 'number' || !Number.isFinite(s)) return MA_SMOOTHING_DEFAULT;
  return Math.round(Math.min(MA_SMOOTHING_MAX, Math.max(MA_SMOOTHING_MIN, s)));
}

// --- Per-overlay parameters (union bag — each builder picks what it needs) ----

export interface OverlayParams {
  // Linear regression
  ci?: number;              // Confidence interval 0–0.99 (default 0.95)

  // Moving average
  smoothing?: number;       // Window as % of the points per series (default 10)
  reduce?: string;          // 'mean' | 'median' (default 'mean'; other values fall back to mean)
  anchor?: 'start' | 'middle' | 'end';  // Window anchor (default 'middle')

  // Visual styling
  color?: string;           // Override stroke/fill color
  opacity?: number;         // Band fill opacity (default 0.15)
  strokeWidth?: number;     // Line thickness (default 1.5)
  // Linear regression behaviour
  perGroup?: boolean;       // Fit one line per discrete-color group (default false)
  showCI?: boolean;         // Show confidence interval band (default true)

  // Density overlay
  bandwidth?: number;       // KDE kernel bandwidth in pixels (default 30)
  thresholds?: number;      // Number of contour levels (default 10)
  filled?: boolean;         // Fill contour bands instead of lines only (default false)

  // Reference lines
  refStats?: ReferenceStat[];  // Statistics to mark (default ['mean'])
  percentile?: number;         // Percentile for the 'percentile' stat, 0–100 (default 95)
  refValue?: number | null;    // Fixed value line; null/undefined = none
  showLabels?: boolean;        // Label each line at the frame edge (default true)

  // Marginal rug
  rugAxes?: 'both' | 'x' | 'y';  // Which frame edges get a rug (default 'both')
  rugLength?: number;            // Tick length in pixels (default 8)

  // Hexbin
  binWidth?: number;             // Hexagon width in pixels (default 20)

  // Crosshair (also uses showLabels)
  crosshairAxes?: 'both' | 'x' | 'y';  // Guide lines to draw; 'x'/'y' also snap by that axis alone (default 'both')
}

/**
 * What a cell's crosshair plots, attached to the cell's options as
 * `__crosshair` so the renderer can mirror it into the other cells of the grid.
 */
export interface CrosshairSpec {
  xColumn: string;
  yColumn: string;
  axes: 'both' | 'x' | 'y';
}

// --- Per-overlay configuration -----------------------------------------------

export interface OverlayConfig {
  type: OverlayType;
  enabled: boolean;
  params: OverlayParams;
  /** When true, the primary chart marks (dots, lines, etc.) are hidden and only this overlay is shown */
  hideSourceData?: boolean;
}

// --- Default overlay configs (all start disabled) ----------------------------

export const DEFAULT_OVERLAYS: OverlayConfig[] = [
  { type: 'linearRegression', enabled: false, params: { ci: 0.95, color: DEFAULT_OVERLAY_COLOR, strokeWidth: 1.5, perGroup: false, showCI: true } },
  { type: 'movingAverage',    enabled: false, params: { smoothing: MA_SMOOTHING_DEFAULT, reduce: 'mean', anchor: 'middle', color: DEFAULT_MANUAL_COLOR, strokeWidth: 2, perGroup: false }, hideSourceData: false },
  { type: 'density',          enabled: false, params: { bandwidth: 30, thresholds: 10, filled: false, opacity: 0.2, strokeWidth: 1.5, color: DEFAULT_MANUAL_COLOR, perGroup: false }, hideSourceData: false },
  { type: 'marginalRug',      enabled: false, params: { rugAxes: 'both', rugLength: 8, opacity: 0.35, strokeWidth: 1, color: DEFAULT_MANUAL_COLOR, perGroup: false } },
  { type: 'hexbin',           enabled: false, params: { binWidth: 20, color: DEFAULT_MANUAL_COLOR, perGroup: false }, hideSourceData: true },
  { type: 'crosshair',        enabled: false, params: { crosshairAxes: 'both', showLabels: true } },
  { type: 'referenceLines',   enabled: false, params: { refStats: ['mean'], percentile: 95, refValue: null, showLabels: true, color: DEFAULT_REFERENCE_LINE_COLOR, strokeWidth: 1.5, perGroup: false } },
];

/**
 * Saved views and undo snapshots predate newer overlay types, so their
 * `overlays` arrays can be missing entries. Fill the gaps from the defaults,
 * keeping every saved entry as-is.
 */
export function withAllOverlays(overlays: OverlayConfig[] | undefined): OverlayConfig[] {
  const list = overlays ?? [];
  const missing = DEFAULT_OVERLAYS.filter((d) => !list.some((o) => o.type === d.type));
  return missing.length === 0 ? list : [...list, ...missing];
}

// --- Overlay metadata (for UI + registry) ------------------------------------

export interface OverlayMeta {
  type: OverlayType;
  label: string;
  /** Chart types where this overlay is meaningful */
  applicableTo: ReadonlySet<UserChartType>;
}

export const OVERLAY_META: readonly OverlayMeta[] = [
  {
    type: 'linearRegression',
    label: 'Linear Regression',
    applicableTo: new Set<UserChartType>(['line', 'scatter']),
  },
  {
    type: 'movingAverage',
    label: 'Moving Average',
    applicableTo: new Set<UserChartType>(['line']),
  },
  {
    type: 'density',
    label: 'Density',
    applicableTo: new Set<UserChartType>(['scatter']),
  },
  {
    type: 'marginalRug',
    label: 'Marginal Rug',
    applicableTo: new Set<UserChartType>(['scatter', 'line']),
  },
  {
    type: 'hexbin',
    label: 'Hexbin',
    applicableTo: new Set<UserChartType>(['scatter']),
  },
  {
    type: 'crosshair',
    label: 'Crosshair',
    applicableTo: new Set<UserChartType>(['scatter', 'line']),
  },
  {
    type: 'referenceLines',
    label: 'Reference Lines',
    applicableTo: new Set<UserChartType>(['line', 'scatter', 'bar', 'tick']),
  },
] as const;

// --- Helpers ----------------------------------------------------------------

/** Map internal CellChartType to user-facing UserChartType for overlay applicability checks */
export function cellChartTypeToUserType(ct: CellChartType): UserChartType {
  switch (ct) {
    case 'barX': case 'barY': return 'bar';
    case 'tickX': case 'tickY': case 'boxX': case 'boxY': return 'tick';
    case 'ganttX': case 'ganttY': return 'gantt';
    case 'dot': return 'scatter';
    default: return ct as UserChartType; // 'line' | 'scatter' | 'cdf' | 'density'
  }
}
