// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
export { DataSourceProvider } from './DataSourceProvider';
export type { DataSourceContextType } from './DataSourceProvider';
export { useDataSource } from './useDataSource';
export type { DataSourceState, VirtualColumnPreference } from './types';

// Focused slice hooks — prefer these in new code.
export {
  useDataSourceMetadata,
  useDataSourceMeasureGroup,
  useDataSourceMultiTable,
  useDataSourceSessionFilters,
  useDataSourceHivePartitions,
} from './hooks';
