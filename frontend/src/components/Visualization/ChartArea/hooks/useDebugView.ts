// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { useCallback, useState } from 'react';

interface UseDebugViewReturn {
  isDebugOpen: boolean;
  toggleDebugView: () => void;
}

/**
 * Open/closed state of the debug drawer.
 *
 * Height is not this hook's concern: the drawer is a `Panel`, so the panel
 * group owns its size, its 150px floor and its per-sheet persistence. This hook
 * used to also track `debugHeight` and a `maxDebugHeight` derived from
 * `window.innerHeight` via a resize listener — a guess at the space available,
 * which the group now knows exactly.
 */
export const useDebugView = (): UseDebugViewReturn => {
  const [isDebugOpen, setIsDebugOpen] = useState(false);
  const toggleDebugView = useCallback(() => setIsDebugOpen((open) => !open), []);
  return { isDebugOpen, toggleDebugView };
};
