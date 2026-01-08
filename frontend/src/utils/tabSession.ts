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
 * Get or create a unique tab ID for the current browser tab.
 * The ID is stored in sessionStorage and persists across page refreshes
 * but not across tabs or browser sessions.
 */
export function getTabId(): string {
  let tabId = sessionStorage.getItem(TAB_ID_KEY);
  
  if (!tabId) {
    // Generate a new UUID for this tab
    tabId = crypto.randomUUID();
    sessionStorage.setItem(TAB_ID_KEY, tabId);
    console.debug('[tabSession] Created new tab ID:', tabId);
  }
  
  return tabId;
}

/**
 * Force regeneration of the tab ID.
 * Useful if we detect a duplicated tab scenario.
 */
export function regenerateTabId(): string {
  const newTabId = crypto.randomUUID();
  sessionStorage.setItem(TAB_ID_KEY, newTabId);
  console.debug('[tabSession] Regenerated tab ID:', newTabId);
  return newTabId;
}

/**
 * Clear the tab ID (e.g., on explicit logout).
 */
export function clearTabId(): void {
  sessionStorage.removeItem(TAB_ID_KEY);
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
    const tabId = sessionStorage.getItem(TAB_ID_KEY);
    if (!tabId) {
      return; // No tab ID, nothing to clean up
    }

    // Use sendBeacon for reliable delivery during page unload
    const beaconUrl = `${getBeaconUrl()}/disconnect-beacon`;
    const data = new Blob(
      [JSON.stringify({ tab_id: tabId })],
      { type: 'application/json' }
    );
    
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
