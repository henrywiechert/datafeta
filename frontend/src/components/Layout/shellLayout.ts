// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { PanelConstraints } from './usePanelSplit';

/**
 * Size constraints for the three shell columns.
 *
 * One declaration feeds both the `Panel` props and the drag gesture's
 * clamping, so a handle can never preview a size the panel will refuse.
 *
 * Minima are in pixels (content-driven), maxima in percent (proportional).
 * The previous all-percentage setup had minima summing to 60% and maxima to
 * 105%, plus a `minWidth: 140` inline escape hatch on the Properties panel.
 */
export const SHELL_PANELS: Record<'left' | 'middle', PanelConstraints> = {
  /** Fields: table picker + field list. */
  left: { minPx: 220, maxPercent: 35 },
  /** Properties: filters, overrides, overlays, measure groups. */
  middle: { minPx: 180, maxPercent: 30 },
};

/** The chart column never gets a proportional floor — just a usable one. */
export const CHART_PANEL_MIN_PX = 360;

/** Fallback sizes for a sheet that has never been resized. */
export const DEFAULT_LEFT_PANEL_PERCENT = 20;
export const DEFAULT_MIDDLE_PANEL_PERCENT = 15;
