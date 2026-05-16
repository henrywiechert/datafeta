// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Tab-level session management utilities.
 * 
 * Each browser tab gets a unique tab ID stored in sessionStorage.
 * This ID is sent with every API request to allow the backend to
 * maintain separate connection state per tab.
 * 
 * sessionStorage is tab-scoped (unlike localStorage which is shared),
 * so each tab naturally gets its own isolated storage.
 */

const TAB_ID_KEY = 'data-slicer-tab-id';

/**
 * Safely access sessionStorage. Some browsers/environments (old Safari,
 * privacy modes, or embedded WebViews) throw when touching it during page
 * load. Returning null lets us gracefully fall back to an in-memory ID.
 */
function getSessionStorageSafely(): Storage | null {
  try {
    return window.sessionStorage;
  } catch (error) {
    console.warn('[tabSession] sessionStorage unavailable, using in-memory tab ID:', error);
    return null;
  }
}

/**
 * Generate a stable tab ID with feature detection.
 * - Prefer crypto.randomUUID when available (Chromium 92+, modern Firefox/Safari)
 * - Fallback to UUID v4 style using crypto.getRandomValues
 * - Final fallback to Math.random (least preferred but better than crashing)
 */
function generateTabId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    // RFC4122 variant 4
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const toHex = (n: number) => n.toString(16).padStart(2, '0');
    const hex = Array.from(bytes, toHex).join('');
    return `${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}`;
  }

  // Last resort fallback (no crypto). Not ideal, but avoids hard crashes on very old engines.
  return `tab-${Math.random().toString(16).slice(2)}-${Date.now()}`;
}

// Fallback in-memory tab ID when storage is unavailable
let inMemoryTabId: string | null = null;

/**
 * Get or create a unique tab ID for the current browser tab.
 * The ID is stored in sessionStorage and persists across page refreshes
 * but not across tabs or browser sessions.
 */
export function getTabId(): string {
  const storage = getSessionStorageSafely();
  let tabId = storage?.getItem(TAB_ID_KEY) || inMemoryTabId;

  if (!tabId) {
    tabId = generateTabId();
    storage?.setItem(TAB_ID_KEY, tabId);
    inMemoryTabId = tabId; // also keep in-memory for storage-less environments
    console.debug('[tabSession] Created new tab ID:', tabId);
  }

  return tabId;
}

/**
 * Force regeneration of the tab ID.
 * Useful if we detect a duplicated tab scenario.
 */
export function regenerateTabId(): string {
  const storage = getSessionStorageSafely();
  const newTabId = generateTabId();
  storage?.setItem(TAB_ID_KEY, newTabId);
  inMemoryTabId = newTabId;
  console.debug('[tabSession] Regenerated tab ID:', newTabId);
  return newTabId;
}

/**
 * Clear the tab ID (e.g., on explicit logout).
 */
export function clearTabId(): void {
  const storage = getSessionStorageSafely();
  storage?.removeItem(TAB_ID_KEY);
  inMemoryTabId = null;
  console.debug('[tabSession] Cleared tab ID');
}

/**
 * Get the API base URL for beacon requests.
 * Beacon API requires absolute URLs.
 */
function getBeaconUrl(): string {
  const apiBasePrefix = (process.env.REACT_APP_API_BASE || '/api/v1').replace(/\/$/, '');
  const base = apiBasePrefix.startsWith('http') 
    ? apiBasePrefix 
    : `${window.location.origin}${apiBasePrefix}`;
  return `${base}/data`;
}

/**
 * Attempt to disconnect from the backend when the tab is closing.
 * Uses navigator.sendBeacon for reliability (fires even if tab closes quickly).
 * 
 * This is a best-effort cleanup - the backend should also have timeout-based
 * cleanup for cases where this fails (e.g., browser crash).
 */
export function setupTabCloseCleanup(): void {
  const handleBeforeUnload = () => {
    const tabId = getSessionStorageSafely()?.getItem(TAB_ID_KEY) || inMemoryTabId;
    if (!tabId) return; // No tab ID, nothing to clean up

    if (typeof navigator?.sendBeacon !== 'function') {
      console.debug('[tabSession] sendBeacon not supported, skipping disconnect beacon');
      return;
    }

    // Use sendBeacon for reliable delivery during page unload
    const beaconUrl = `${getBeaconUrl()}/disconnect-beacon`;
    const data = new Blob([JSON.stringify({ tab_id: tabId })], { type: 'application/json' });

    try {
      const success = navigator.sendBeacon(beaconUrl, data);
      console.debug('[tabSession] Sent disconnect beacon:', success);
    } catch (error) {
      console.warn('[tabSession] Failed to send disconnect beacon:', error);
    }
  };

  // Register the cleanup handler
  window.addEventListener('beforeunload', handleBeforeUnload);
  
  console.debug('[tabSession] Tab close cleanup registered');
}

/**
 * Initialize tab session management.
 * Should be called once when the app loads.
 */
export function initializeTabSession(): string {
  const tabId = getTabId();
  setupTabCloseCleanup();
  return tabId;
}
