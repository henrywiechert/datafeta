// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { useSyncExternalStore } from 'react';

const TABLET_POINTER_QUERY = '(hover: none) and (pointer: coarse)';
const PORTRAIT_QUERY = '(orientation: portrait)';

export interface TabletUiState {
  /** Coarse pointer with no hover — finger UI, independent of window width. */
  isTablet: boolean;
  /** Portrait while in tablet mode. Overlay should ask the user to rotate. */
  isPortrait: boolean;
}

/** Tablet tap-target height. Exposed to CSS as `--df-touch-target`. */
export const TABLET_TOUCH_TARGET_PX = 36;

const DESKTOP_STATE: TabletUiState = { isTablet: false, isPortrait: false };

let current: TabletUiState = DESKTOP_STATE;
let started = false;
const listeners = new Set<() => void>();

function hasMatchMedia(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function';
}

function readState(): TabletUiState {
  const isTablet = window.matchMedia(TABLET_POINTER_QUERY).matches;
  const isPortrait = window.matchMedia(PORTRAIT_QUERY).matches;
  return { isTablet, isPortrait: isTablet && isPortrait };
}

function applyRootAttribute(isTablet: boolean): void {
  const root = document.documentElement;
  if (isTablet) {
    root.setAttribute('data-ui', 'tablet');
    root.style.setProperty('--df-touch-target', `${TABLET_TOUCH_TARGET_PX}px`);
  } else {
    root.removeAttribute('data-ui');
    root.style.removeProperty('--df-touch-target');
  }
}

/**
 * Single app-wide listener pair. Owns `data-ui="tablet"` on the document root;
 * individual components never write or remove it.
 */
function start(): void {
  if (started || !hasMatchMedia()) return;
  started = true;
  current = readState();
  applyRootAttribute(current.isTablet);

  const update = () => {
    const next = readState();
    if (next.isTablet === current.isTablet && next.isPortrait === current.isPortrait) return;
    current = next;
    applyRootAttribute(next.isTablet);
    listeners.forEach((listener) => listener());
  };
  window.matchMedia(TABLET_POINTER_QUERY).addEventListener('change', update);
  window.matchMedia(PORTRAIT_QUERY).addEventListener('change', update);
}

function subscribe(listener: () => void): () => void {
  start();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): TabletUiState {
  start();
  return current;
}

/**
 * Detects a tablet-style pointer and syncs `data-ui="tablet"` on the document
 * root so CSS can enlarge hit targets. An iPad with a trackpad reports a fine
 * pointer and stays in computer style.
 *
 * Safe to call from many components: all share one module-level store.
 */
export function useTabletUi(): TabletUiState {
  return useSyncExternalStore(subscribe, getSnapshot, () => DESKTOP_STATE);
}
