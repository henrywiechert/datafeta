// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only

/** Chart-control actions that may collapse into the "More actions" overflow menu. */
export type CollapsibleChartControl =
  | 'sidePanels'
  | 'fullscreen'
  | 'undo'
  | 'redo'
  | 'tableToggle'
  | 'swap'
  | 'zoomOut'
  | 'zoomReset'
  | 'caption'
  | 'rebase'
  | 'refresh'
  | 'independentX'
  | 'independentY'
  | 'band'
  | 'settings'
  | 'reset'
  | 'devSql';

/** Highest priority first: items at the end collapse into the overflow menu first. */
export const CHART_CONTROL_PRIORITY: readonly CollapsibleChartControl[] = [
  'sidePanels',
  'fullscreen',
  'undo',
  'redo',
  'tableToggle',
  'swap',
  'zoomOut',
  'zoomReset',
  'caption',
  'rebase',
  'refresh',
  'independentX',
  'independentY',
  'band',
  'settings',
  'reset',
  'devSql',
];

/** Controls that only exist inline (no overflow menu entry); they are simply hidden when collapsed. */
const INLINE_ONLY: ReadonlySet<CollapsibleChartControl> = new Set<CollapsibleChartControl>(['devSql']);

// Rendered widths in CSS px (MUI small IconButton = 5px padding + 20px icon).
export const ICON_BUTTON_WIDTH = 30;
export const TOOLBAR_GAP = 8;
const CONTROL_WIDTHS: Partial<Record<CollapsibleChartControl, number>> = {
  rebase: 32,
  independentX: 32,
  independentY: 32,
  reset: ICON_BUTTON_WIDTH + 8, // ml: 1
};

const widthOf = (id: CollapsibleChartControl) => CONTROL_WIDTHS[id] ?? ICON_BUTTON_WIDTH;

export interface ChartControlsLayoutInput {
  /** Width of the left button group (the area that clips overflowing buttons). */
  availableWidth: number;
  /** Collapsible controls that apply in the current state, in any order. */
  available: readonly CollapsibleChartControl[];
}

export interface ChartControlsLayout {
  inline: ReadonlySet<CollapsibleChartControl>;
  overflow: ReadonlySet<CollapsibleChartControl>;
  hasOverflowActions: boolean;
}

const rowWidth = (widths: number[]) =>
  widths.length === 0 ? 0 : widths.reduce((a, b) => a + b, 0) + TOOLBAR_GAP * (widths.length - 1);

export function resolveChartControlsLayout({
  availableWidth,
  available,
}: ChartControlsLayoutInput): ChartControlsLayout {
  const candidates = CHART_CONTROL_PRIORITY.filter((id) => available.includes(id));
  if (rowWidth(candidates.map(widthOf)) <= availableWidth) {
    return { inline: new Set(candidates), overflow: new Set(), hasOverflowActions: false };
  }

  // Not everything fits: reserve room for the "More actions" button, then keep
  // adding controls in priority order while they still fit.
  const widths = [ICON_BUTTON_WIDTH];
  const inline = new Set<CollapsibleChartControl>();
  for (const id of candidates) {
    const next = [...widths, widthOf(id)];
    if (rowWidth(next) > availableWidth) break;
    widths.push(widthOf(id));
    inline.add(id);
  }

  const overflow = new Set(candidates.filter((id) => !inline.has(id) && !INLINE_ONLY.has(id)));
  if (overflow.size === 0) {
    // Only inline-only controls were dropped; no menu needed.
    return { inline, overflow, hasOverflowActions: false };
  }
  return { inline, overflow, hasOverflowActions: true };
}
