// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useState } from 'react';

const TABLET_POINTER_QUERY = '(hover: none) and (pointer: coarse)';
const PORTRAIT_QUERY = '(orientation: portrait)';

export interface TabletUiState {
  /** Coarse pointer with no hover — finger UI, independent of window width. */
  isTablet: boolean;
  /** Portrait while in tablet mode. Overlay should ask the user to rotate. */
  isPortrait: boolean;
}

function readMedia(query: string): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia(query).matches;
}

/**
 * Detects a tablet-style pointer and syncs `data-ui="tablet"` on the document
 * root so CSS can enlarge hit targets. An iPad with a trackpad reports a fine
 * pointer and stays in computer style.
 *
 * Mount once near the app root. Consumers that need the boolean in React
 * should call this hook (it is cheap: two matchMedia listeners).
 */
export function useTabletUi(): TabletUiState {
  const [isTablet, setIsTablet] = useState(() => readMedia(TABLET_POINTER_QUERY));
  const [isPortrait, setIsPortrait] = useState(() => readMedia(PORTRAIT_QUERY));

  useEffect(() => {
    const pointerMq = window.matchMedia(TABLET_POINTER_QUERY);
    const portraitMq = window.matchMedia(PORTRAIT_QUERY);

    const sync = () => {
      const tablet = pointerMq.matches;
      setIsTablet(tablet);
      setIsPortrait(portraitMq.matches);
      if (tablet) {
        document.documentElement.setAttribute('data-ui', 'tablet');
      } else {
        document.documentElement.removeAttribute('data-ui');
      }
    };

    sync();
    pointerMq.addEventListener('change', sync);
    portraitMq.addEventListener('change', sync);
    return () => {
      pointerMq.removeEventListener('change', sync);
      portraitMq.removeEventListener('change', sync);
      document.documentElement.removeAttribute('data-ui');
    };
  }, []);

  return { isTablet, isPortrait: isTablet && isPortrait };
}
