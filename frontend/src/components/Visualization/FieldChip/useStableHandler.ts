// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * Returns a function whose identity never changes but which always runs the
 * latest `handler` passed in.
 *
 * ChipWithTooltip's memo comparator deliberately ignores its handler props so a
 * chip does not re-render whenever a parent rebuilds its callbacks. A plain
 * `useCallback` is not enough for that: its identity still changes with its
 * deps, and the memoized chip would keep firing the closure from its first
 * render (e.g. a range-select over the unfiltered field list after the panel
 * search narrowed it). Pass every ChipWithTooltip handler through this hook.
 */
export function useStableHandler<A extends unknown[], R>(
  handler: (...args: A) => R,
): (...args: A) => R {
  const handlerRef = useRef(handler);
  useLayoutEffect(() => {
    handlerRef.current = handler;
  });
  return useCallback((...args: A) => handlerRef.current(...args), []);
}
