// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only

/** True when the element carries Observable Plot / D3 row data (object or row index). */
export function isPlotDataMarkElement(el: Element | null | undefined): boolean {
  if (!el) return false;
  const mark = el.closest('circle, rect, path');
  if (!mark) return false;
  const data = (mark as { __data__?: unknown }).__data__;
  if (data == null) return false;
  return typeof data === 'object' || typeof data === 'number';
}
