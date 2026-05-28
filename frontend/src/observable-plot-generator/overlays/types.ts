// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Overlay Types
 *
 * Types for statistical overlay marks (regression, moving average).
 * Overlays are add-on marks appended to existing chart PlotOptions — they never
 * modify the primary chart handler logic.
 */

import { UserChartType } from '../../types';
import { CellChartType } from '../helpers/chartTypeResolver';

// --- Overlay type identifiers ------------------------------------------------

export type OverlayType = 'linearRegression' | 'movingAverage' | 'density';

// --- Per-overlay parameters (union bag — each builder picks what it needs) ----

export interface OverlayParams {
  // Linear regression
  ci?: number;              // Confidence interval 0–0.99 (default 0.95)

  // Moving average / Bollinger shared
  windowSize?: number;      // k / n — rolling window size (default 20)
  reduce?: string;          // 'mean' | 'median' | 'sum' | 'min' | 'max' (default 'mean')
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
  { type: 'linearRegression', enabled: false, params: { ci: 0.95, color: '#e15759', strokeWidth: 1.5, perGroup: false, showCI: true } },
  { type: 'movingAverage',    enabled: false, params: { windowSize: 20, reduce: 'mean', anchor: 'middle', color: '#4e79a7', strokeWidth: 2, perGroup: false } },
  { type: 'density',          enabled: false, params: { bandwidth: 30, thresholds: 10, filled: false, opacity: 0.2, strokeWidth: 1.5, color: '#4e79a7', perGroup: false }, hideSourceData: false },
];

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
