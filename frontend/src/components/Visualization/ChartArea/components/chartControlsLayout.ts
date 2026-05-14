// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
export interface ChartControlsVisibility {
  hideLowPriorityInline: boolean;
  hideTier2Inline: boolean;
  showInlineDevSql: boolean;
  showInlineTableToggle: boolean;
  showInlineSwap: boolean;
  showInlineZoomOut: boolean;
  showInlineZoomReset: boolean;
  showInlineRefresh: boolean;
  showInlineBand: boolean;
  showInlineSettings: boolean;
  showInlineIndependentX: boolean;
  showInlineIndependentY: boolean;
  showInlineReset: boolean;
  showOverflowTableToggle: boolean;
  showOverflowSwap: boolean;
  showOverflowZoomOut: boolean;
  showOverflowZoomReset: boolean;
  showOverflowRefresh: boolean;
  showOverflowBand: boolean;
  showOverflowSettings: boolean;
  showOverflowIndependentX: boolean;
  showOverflowIndependentY: boolean;
  showOverflowReset: boolean;
  hasOverflowActions: boolean;
}

export function resolveChartControlsVisibility(
  controlsWidth: number,
  showTableRows: boolean
): ChartControlsVisibility {
  const hideLowPriorityInline = controlsWidth < 700;
  const hideTier2Inline = controlsWidth < 400;

  const showInlineDevSql = !hideLowPriorityInline;
  const showInlineTableToggle = !hideTier2Inline;
  const showInlineSwap = !hideTier2Inline && !showTableRows;
  const showInlineZoomOut = !hideTier2Inline && !showTableRows;
  const showInlineZoomReset = !hideTier2Inline && !showTableRows;
  const showInlineRefresh = !hideLowPriorityInline;
  const showInlineBand = !hideLowPriorityInline && !showTableRows;
  const showInlineSettings = !hideLowPriorityInline;
  const showInlineIndependentX = !hideLowPriorityInline && !showTableRows;
  const showInlineIndependentY = !hideLowPriorityInline && !showTableRows;
  const showInlineReset = !hideLowPriorityInline;

  const showOverflowTableToggle = hideTier2Inline;
  const showOverflowSwap = hideTier2Inline && !showTableRows;
  const showOverflowZoomOut = hideTier2Inline && !showTableRows;
  const showOverflowZoomReset = hideTier2Inline && !showTableRows;
  const showOverflowRefresh = hideLowPriorityInline;
  const showOverflowBand = hideLowPriorityInline && !showTableRows;
  const showOverflowSettings = hideLowPriorityInline;
  const showOverflowIndependentX = hideLowPriorityInline && !showTableRows;
  const showOverflowIndependentY = hideLowPriorityInline && !showTableRows;
  const showOverflowReset = hideLowPriorityInline;

  const hasOverflowActions = Boolean(
    showOverflowTableToggle ||
    showOverflowSwap ||
    showOverflowZoomOut ||
    showOverflowZoomReset ||
    showOverflowRefresh ||
    showOverflowBand ||
    showOverflowSettings ||
    showOverflowIndependentX ||
    showOverflowIndependentY ||
    showOverflowReset
  );

  return {
    hideLowPriorityInline,
    hideTier2Inline,
    showInlineDevSql,
    showInlineTableToggle,
    showInlineSwap,
    showInlineZoomOut,
    showInlineZoomReset,
    showInlineRefresh,
    showInlineBand,
    showInlineSettings,
    showInlineIndependentX,
    showInlineIndependentY,
    showInlineReset,
    showOverflowTableToggle,
    showOverflowSwap,
    showOverflowZoomOut,
    showOverflowZoomReset,
    showOverflowRefresh,
    showOverflowBand,
    showOverflowSettings,
    showOverflowIndependentX,
    showOverflowIndependentY,
    showOverflowReset,
    hasOverflowActions,
  };
}
