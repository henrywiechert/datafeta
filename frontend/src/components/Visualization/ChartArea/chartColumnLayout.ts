// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { PanelConstraints } from '../../Layout/usePanelSplit';

/**
 * Size constraints for the chart area's two secondary panels: the legend sits
 * beside the plot (above the chart controls, sharing the plot's height) and the
 * debug drawer sits below plot + legend + controls.
 *
 * One declaration feeds both the `Panel` props and the drag gesture's clamping,
 * the same contract `SHELL_PANELS` uses for the three app columns — a handle can
 * then never preview a size the panel will refuse.
 *
 * Minima are pixels because they are content-driven (a legend swatch column
 * needs ~180px whatever the window size); maxima are proportional so neither
 * panel can crowd out the plot on a wide screen.
 */
export const CHART_COLUMN_PANELS: Record<'legend' | 'debug', PanelConstraints> = {
  legend: { minPx: 180, maxPercent: 40 },
  debug: { minPx: 150, maxPercent: 70 },
};

/** The plot itself never shrinks below this, whatever the legend is doing. */
export const PLOT_MIN_PX = 240;

/** Fallbacks for a sheet that has never resized these panels. */
export const DEFAULT_LEGEND_WIDTH_PX = 220;
export const DEFAULT_DEBUG_HEIGHT_PX = 300;
