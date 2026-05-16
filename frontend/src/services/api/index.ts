// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * API Services Index
 * 
 * Unified API service exports that maintain backward compatibility
 * with the original apiService interface while providing modular services.
 * 
 * Usage:
 *   import { apiService } from './services/api';
 *   // or
 *   import { connectionApi, metadataApi, queryApi } from './services/api';
 */

import { connectionApi } from './connectionApi';
import { metadataApi } from './metadataApi';
import { queryApi } from './queryApi';
import { snapshotApi } from './snapshotApi';
import { kaggleApi } from './kaggleApi';
import { 
  cancelAllRequests, 
  getCurrentAbortController, 
  createAbortController 
} from './apiClient';

/**
 * Unified API service - backward compatible with original apiService
 */
export const apiService = {
  // Connection operations
  connect: connectionApi.connect,
  disconnect: connectionApi.disconnect,
  connectHive: connectionApi.connectHive,
  loadPartition: connectionApi.loadPartition,
  addFiles: connectionApi.addFiles,

  // Metadata operations
  listDatabases: metadataApi.listDatabases,
  listTables: metadataApi.listTables,
  listColumns: metadataApi.listColumns,
  getTableRelationships: metadataApi.getTableRelationships,
  getSuggestedJoins: metadataApi.getSuggestedJoins,
  getSuggestedUnions: metadataApi.getSuggestedUnions,
  previewClickHousePatternTables: metadataApi.previewClickHousePatternTables,
  getMergedColumns: metadataApi.getMergedColumns,
  getDistinctValues: metadataApi.getDistinctValues,
  getDistinctValuesCount: metadataApi.getDistinctValuesCount,
  getFieldRange: metadataApi.getFieldRange,
  getDateTimeRange: metadataApi.getDateTimeRange,
  getRowCount: metadataApi.getRowCount,
  getFieldStats: metadataApi.getFieldStats,

  // Query operations
  executeQuery: queryApi.executeQuery,
  executeQueryArrow: queryApi.executeQueryArrow,
  executeQueryArrowRaw: queryApi.executeQueryArrowRaw,

  // Snapshot operations
  listSnapshots: snapshotApi.listSnapshots,
  saveSnapshot: snapshotApi.saveSnapshot,
  loadSnapshot: snapshotApi.loadSnapshot,
  deleteSnapshot: snapshotApi.deleteSnapshot,
  renameSnapshot: snapshotApi.renameSnapshot,
  overwriteSnapshot: snapshotApi.overwriteSnapshot,
  moveSnapshot: snapshotApi.moveSnapshot,
  renameFolder: snapshotApi.renameFolder,

  // Kaggle operations
  searchKaggleDatasets: kaggleApi.searchKaggleDatasets,
  listKaggleFiles: kaggleApi.listKaggleFiles,

  // Request management
  cancelAllRequests,
  getCurrentAbortController,
  createNewAbortController: createAbortController,
};

// Export individual service modules for direct use
export { connectionApi } from './connectionApi';
export { metadataApi } from './metadataApi';
export { queryApi } from './queryApi';
export { snapshotApi } from './snapshotApi';
export { kaggleApi } from './kaggleApi';
export { 
  cancelAllRequests, 
  getCurrentAbortController, 
  createAbortController 
} from './apiClient';

// Standalone utility exports
export { fetchFieldStats } from './metadataApi';
