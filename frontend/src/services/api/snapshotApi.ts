// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
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
 * - Move snapshots between folders
 * - Rename folders
 */

import { fetchWithErrorHandling, API_BASE_PREFIX } from './apiClient';

interface SnapshotMeta {
  id: string;
  name: string;
  folder: string;
  createdAt: string;
  updatedAt: string;
}

export const snapshotApi = {
  /**
   * List all saved snapshots.
   * Returns metadata only (id, name, folder, timestamps) for display in a gallery.
   */
  async listSnapshots(signal?: AbortSignal): Promise<SnapshotMeta[]> {
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
    folder?: string,
    signal?: AbortSignal
  ): Promise<SnapshotMeta> {
    const response = await fetchWithErrorHandling(
      `${API_BASE_PREFIX}/snapshots`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, configuration, folder: folder ?? '' }),
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
  ): Promise<SnapshotMeta & { configuration: any }> {
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
  ): Promise<SnapshotMeta> {
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
  ): Promise<SnapshotMeta> {
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

  /**
   * Move a snapshot to a different folder.
   */
  async moveSnapshot(
    snapshotId: string,
    folder: string,
    signal?: AbortSignal
  ): Promise<SnapshotMeta> {
    const response = await fetchWithErrorHandling(
      `${API_BASE_PREFIX}/snapshots/${encodeURIComponent(snapshotId)}/move`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder }),
      },
      signal
    );
    return response.json();
  },

  /**
   * Rename a folder, updating all snapshots within it.
   */
  async renameFolder(
    oldPath: string,
    newPath: string,
    signal?: AbortSignal
  ): Promise<{ updatedCount: number; oldPath: string; newPath: string }> {
    const response = await fetchWithErrorHandling(
      `${API_BASE_PREFIX}/snapshots/rename-folder`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPath, newPath }),
      },
      signal
    );
    return response.json();
  },
};
