// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Owns the chart viewport (transient pan/zoom view state) for one chart area.
 *
 * - The LIVE value follows every gesture step; gesture handlers, the CSS
 *   preview and the axis gutters read it.
 * - The COMMITTED value lags behind until the gesture pauses; chart
 *   generation subscribes to it and regenerates once per commit.
 *
 * Neither lives in VisualizationContext: a context update re-renders every
 * consumer across the page (shelves, filters, controls), which made each zoom
 * step a long task. The controller is a stable object, so passing it down the
 * memoized chart grid does not re-render cells either.
 */
import type { ChartViewport, ViewportRange } from '../../../../observable-plot-generator/viewport/chartViewport';

export type ViewportPatch = Record<string, ViewportRange | null>;

/**
 * Idle time after the last gesture step before the viewport is committed (ms).
 * A commit redraws every cell (Plot.plot) and blocks the main thread, so it
 * must not land in the gaps of an ongoing gesture (mouse-wheel notches, held
 * WASD repeats every 150 ms); until then the CSS preview carries the gesture.
 */
export const VIEWPORT_COMMIT_IDLE_MS = 250;

export interface ViewportController {
  /** Live range for a column (pending or committed); undefined = natural domain. */
  get(column: string): ViewportRange | undefined;
  /**
   * Update live ranges (null clears a column) and schedule a commit. With
   * `holdCommit` the commit waits for flush() instead of the idle timer: a
   * held drag that pauses must not redraw the chart under the pointer and
   * then again on release.
   */
  set(patch: ViewportPatch, options?: { holdCommit?: boolean }): void;
  /** Clear columns (or everything) and commit immediately. */
  clear(columns?: string[]): void;
  /** Commit any pending change now (e.g. at the end of a drag). */
  flush(): void;
  /** Notified on every live change. */
  subscribe(listener: () => void): () => void;
  /** Committed viewport (stable object between commits). */
  getCommitted(): ChartViewport;
  /** Notified after every commit. */
  subscribeCommitted(listener: () => void): () => void;
  dispose(): void;
  /** Cell under the pointer; keyboard pan/zoom acts on it. */
  getHoveredCell(): ViewportCellTarget | null;
  setHoveredCell(target: ViewportCellTarget | null): void;
}

/** Pan/zoom configuration handed down the chart grid (Alt+wheel, drag, WASD). */
export interface ViewportGridConfig {
  /** Stable live-viewport holder; omit to disable pan/zoom. */
  controller?: ViewportController;
  /** Axes with independent per-facet domains cannot be panned. */
  independentDomains?: { x?: boolean; y?: boolean };
}

/** What keyboard navigation needs from the hovered cell. */
export interface ViewportCellTarget {
  resolveAxes(): CellViewportAxis[];
}

/** A pannable axis of one cell, resolved from its plot options. */
export interface CellViewportAxis {
  axis: 'x' | 'y';
  column: string;
  bounds: ViewportRange;
  temporal: boolean;
  /** Domain the axis shows without a viewport. */
  natural: ViewportRange;
}

function applyPatch(base: ChartViewport, patch: ViewportPatch): ChartViewport {
  const next = { ...base };
  for (const [column, range] of Object.entries(patch)) {
    if (range) next[column] = range;
    else delete next[column];
  }
  return next;
}

export function createViewportController(idleMs: number = VIEWPORT_COMMIT_IDLE_MS): ViewportController {
  let live: ChartViewport = {};
  let committed: ChartViewport = {};
  let pending = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const listeners = new Set<() => void>();
  const committedListeners = new Set<() => void>();
  let hoveredCell: ViewportCellTarget | null = null;

  const notify = () => listeners.forEach((l) => l());

  const commit = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    pending = false;
    committed = live;
    committedListeners.forEach((l) => l());
  };

  const flush = () => {
    if (pending) commit();
  };

  return {
    get: (column) => live[column],
    set(patch, options) {
      live = applyPatch(live, patch);
      pending = true;
      notify();
      if (timer) clearTimeout(timer);
      timer = options?.holdCommit ? null : setTimeout(commit, idleMs);
    },
    clear(columns) {
      const patch: ViewportPatch = {};
      for (const c of columns ?? Object.keys(live)) patch[c] = null;
      const changed = Object.keys(patch).some((c) => c in live || c in committed);
      live = applyPatch(live, patch);
      if (!changed) return;
      notify();
      commit();
    },
    flush,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getCommitted: () => committed,
    subscribeCommitted(listener) {
      committedListeners.add(listener);
      return () => {
        committedListeners.delete(listener);
      };
    },
    dispose() {
      if (timer) clearTimeout(timer);
      timer = null;
    },
    getHoveredCell: () => hoveredCell,
    setHoveredCell(target) {
      hoveredCell = target;
    },
  };
}
