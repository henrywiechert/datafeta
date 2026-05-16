// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * API Service (Legacy Entry Point)
 * 
 * This file maintains backward compatibility by re-exporting the refactored
 * API services. The implementation has been split into focused modules:
 * 
 * - connectionApi: Connection lifecycle (connect/disconnect)
 * - metadataApi: Database metadata (tables, columns, stats)
 * - queryApi: Query execution (JSON, Arrow)
 * - snapshotApi: Snapshot storage
 * - kaggleApi: Kaggle integration
 * 
 * New code should import from './services/api' directly.
 * This file exists for backward compatibility only.
 */

export { 
  apiService,
  connectionApi,
  metadataApi,
  queryApi,
  snapshotApi,
  kaggleApi,
  fetchFieldStats,
  cancelAllRequests,
  getCurrentAbortController,
  createAbortController
} from './services/api';
