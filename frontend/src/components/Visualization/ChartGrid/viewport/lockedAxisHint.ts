// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Transient hint near the pointer when a zoom gesture meets an axis that has
 * independent per-facet domains (and so cannot zoom). One shared element, so
 * a wheel burst updates it instead of stacking messages.
 */

const HINT_DURATION_MS = 2500;
const POINTER_OFFSET_PX = 14;

let hintEl: HTMLDivElement | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;

function ensureHint(): HTMLDivElement {
  if (hintEl) return hintEl;
  const el = document.createElement('div');
  el.setAttribute('role', 'status');
  Object.assign(el.style, {
    position: 'fixed',
    zIndex: '1500',
    maxWidth: '260px',
    padding: '6px 10px',
    borderRadius: '4px',
    background: 'var(--df-inverse-surface)',
    color: 'var(--df-inverse-text)',
    font: '12px/1.4 system-ui, sans-serif',
    pointerEvents: 'none',
    transition: 'opacity 150ms',
  });
  document.body.appendChild(el);
  hintEl = el;
  return el;
}

export function lockedAxisMessage(locked: Array<'x' | 'y'>, zoomedOther: boolean): string {
  const names = locked.map((a) => a.toUpperCase()).join(' and ');
  const prefix = locked.length > 1 ? 'axes are' : 'axis is';
  const effect = zoomedOther ? 'zoom applies to the other axis only' : 'it cannot be zoomed';
  return `${names} ${prefix} independent per facet, ${effect}. Switch it to shared (link icon) to zoom.`;
}

export function showLockedAxisHint(clientX: number, clientY: number, message: string): void {
  const el = ensureHint();
  el.textContent = message;
  el.style.opacity = '1';
  // Keep the box inside the viewport.
  const width = el.offsetWidth;
  const height = el.offsetHeight;
  el.style.left = `${Math.max(4, Math.min(clientX + POINTER_OFFSET_PX, window.innerWidth - width - 4))}px`;
  el.style.top = `${Math.max(4, Math.min(clientY + POINTER_OFFSET_PX, window.innerHeight - height - 4))}px`;
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    el.style.opacity = '0';
  }, HINT_DURATION_MS);
}
