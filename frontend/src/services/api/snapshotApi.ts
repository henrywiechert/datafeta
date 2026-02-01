/**
 * Snapshot API Service
 * 
 * Handles snapshot/configuration storage operations:
 * - List saved snapshots
 * - Save new snapshots
 * - Load snapshots
 * - Delete snapshots
 * - Rename snapshots
 * - Overwrite snapshots
 */

import { fetchWithErrorHandling, API_BASE_PREFIX } from './apiClient';

export const snapshotApi = {
  /**
   * List all saved snapshots.
   * Returns metadata only (id, name, timestamps) for display in a gallery.
   */
  async listSnapshots(signal?: AbortSignal): Promise<Array<{
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
  }>> {
    const response = await fetchWithErrorHandling(
      `${API_BASE_PREFIX}/snapshots`,
      {},
      signal
    );
    return response.json();
  },

  /**
   * Save a new snapshot with the given name and configuration.
   */
  async saveSnapshot(
    name: string,
    configuration: any,
    signal?: AbortSignal
  ): Promise<{ id: string; name: string; createdAt: string; updatedAt: string }> {
    const response = await fetchWithErrorHandling(
      `${API_BASE_PREFIX}/snapshots`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, configuration }),
      },
      signal
    );
    return response.json();
  },

  /**
   * Load a specific snapshot by ID.
   * Returns the full snapshot data including configuration.
   */
  async loadSnapshot(
    snapshotId: string,
    signal?: AbortSignal
  ): Promise<{
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
    configuration: any;
  }> {
    const response = await fetchWithErrorHandling(
      `${API_BASE_PREFIX}/snapshots/${encodeURIComponent(snapshotId)}`,
      {},
      signal
    );
    return response.json();
  },

  /**
   * Delete a snapshot by ID.
   */
  async deleteSnapshot(snapshotId: string, signal?: AbortSignal): Promise<void> {
    await fetchWithErrorHandling(
      `${API_BASE_PREFIX}/snapshots/${encodeURIComponent(snapshotId)}`,
      { method: 'DELETE' },
      signal
    );
  },

  /**
   * Rename a snapshot.
   */
  async renameSnapshot(
    snapshotId: string,
    newName: string,
    signal?: AbortSignal
  ): Promise<{ id: string; name: string; createdAt: string; updatedAt: string }> {
    const response = await fetchWithErrorHandling(
      `${API_BASE_PREFIX}/snapshots/${encodeURIComponent(snapshotId)}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      },
      signal
    );
    return response.json();
  },

  /**
   * Overwrite a snapshot's configuration (keeping the same name).
   */
  async overwriteSnapshot(
    snapshotId: string,
    configuration: any,
    signal?: AbortSignal
  ): Promise<{ id: string; name: string; createdAt: string; updatedAt: string }> {
    const response = await fetchWithErrorHandling(
      `${API_BASE_PREFIX}/snapshots/${encodeURIComponent(snapshotId)}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configuration }),
      },
      signal
    );
    return response.json();
  },
};
