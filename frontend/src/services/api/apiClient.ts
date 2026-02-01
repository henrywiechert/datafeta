/**
 * API Client Core
 * 
 * Provides shared HTTP client functionality for all API services:
 * - Error handling
 * - Request cancellation
 * - Tab ID headers for session isolation
 * - Base URL configuration
 */

import { getTabId } from '../../utils/tabSession';

// Derive API base: Prefer explicit env var (REACT_APP_API_BASE, e.g. "/api/v1"), else fall back to
// same-origin relative path (when frontend served by backend) and append /data segment used by router.
// This avoids hard-coded localhost:8000 which breaks when containerized behind another host/port.
const apiBasePrefix = (process.env.REACT_APP_API_BASE || '/api/v1').replace(/\/$/, '');
export const API_BASE_URL = `${apiBasePrefix}/data`;
export const API_BASE_PREFIX = apiBasePrefix;

// Global abort controller for managing cancellable requests
let currentAbortController: AbortController | null = null;

/**
 * Create and manage abort controllers for request cancellation
 */
export function createAbortController(): AbortController {
  // Cancel any existing request
  if (currentAbortController) {
    currentAbortController.abort();
  }
  
  // Create new controller
  currentAbortController = new AbortController();
  return currentAbortController;
}

/**
 * Get current abort controller
 */
export function getCurrentAbortController(): AbortController | null {
  return currentAbortController;
}

/**
 * Cancel all ongoing requests
 */
export function cancelAllRequests(): void {
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
  }
}

/**
 * Handle fetch with improved error handling
 * 
 * - Adds tab ID header for session isolation
 * - Handles JSON and text error responses
 * - Converts AbortError to user-friendly message
 */
export async function fetchWithErrorHandling(
  url: string, 
  options: RequestInit = {}, 
  signal?: AbortSignal
): Promise<Response> {
  // Merge existing headers with the tab ID header
  const existingHeaders = options.headers instanceof Headers 
    ? Object.fromEntries(options.headers.entries())
    : (options.headers || {});
  
  const fetchOptions: RequestInit = {
    ...options,
    headers: {
      ...existingHeaders,
      'X-Tab-Id': getTabId(), // Include tab ID for per-tab session isolation
    },
    signal: signal || (options.signal),
    credentials: 'include', // Include cookies in all requests
  };

  try {
    const response = await fetch(url, fetchOptions);
    
    if (!response.ok) {
      // Better error handling: Check content type before parsing JSON
      let errorMessage = `Request failed with status ${response.status}`;
      try {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json();
          // Use the detail field if available, otherwise stringify the whole object
          errorMessage = errorData.detail || JSON.stringify(errorData);
        } else {
          // If not JSON, try to get the raw text response
          const errorText = await response.text();
          errorMessage = errorText || errorMessage; // Use text if available
        }
      } catch (parseError) {
        console.error("Failed to parse error response:", parseError);
        // Fallback if parsing fails or text() fails
        errorMessage = `Request failed with status ${response.status} (${response.statusText})`;
      }
      throw new Error(errorMessage);
    }
    
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request was cancelled');
    }
    throw error;
  }
}

/**
 * Build URL with query parameters (helper utility)
 */
export function buildUrl(path: string, params?: Record<string, string | number | undefined>): string {
  const base = API_BASE_URL.startsWith('http') ? API_BASE_URL : `${window.location.origin}${API_BASE_URL}`;
  const url = new URL(`${base}${path}`);
  
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        url.searchParams.append(key, String(value));
      }
    });
  }
  
  return url.toString();
}
