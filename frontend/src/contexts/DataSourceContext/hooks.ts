// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
//
// Focused selector hooks for DataSourceContext. Each hook returns only the
// slice of state and setters relevant to its concern. Use these in new code
// instead of `useDataSource()` to make data dependencies explicit at the
// call site.
//
// All hooks read from the same underlying context — they do NOT subscribe
// independently. A consumer of `useDataSourceMeasureGroup` still re-renders
// when any DataSource state changes. The win is narrower typing,
// discoverability, and a cleaner migration path to per-slice contexts later
// if/when that becomes warranted.

import { useMemo } from 'react';
import { useDataSource } from './useDataSource';

export function useDataSourceMetadata() {
  const c = useDataSource();
  return useMemo(
    () => ({
      selectedDatabase: c.dataSource.selectedDatabase,
      selectedTable: c.dataSource.selectedTable,
      availableFields: c.dataSource.availableFields,
      databases: c.dataSource.databases,
      tables: c.dataSource.tables,
      tablesCache: c.dataSource.tablesCache,
      isLoadingMetadata: c.dataSource.isLoadingMetadata,
      metadataError: c.dataSource.metadataError,
      setSelectedDatabase: c.setSelectedDatabase,
      setSelectedTable: c.setSelectedTable,
      setAvailableFields: c.setAvailableFields,
      setDatabases: c.setDatabases,
      setTables: c.setTables,
      setTablesForDatabase: c.setTablesForDatabase,
      setIsLoadingMetadata: c.setIsLoadingMetadata,
      setMetadataError: c.setMetadataError,
      resetMetadata: c.resetMetadata,
    }),
    [c],
  );
}

export function useDataSourceMeasureGroup() {
  const c = useDataSource();
  return useMemo(
    () => ({
      measureGroupFields: c.dataSource.measureGroupFields,
      setMeasureGroupFields: c.setMeasureGroupFields,
      addMeasureToGroup: c.addMeasureToGroup,
      removeMeasureFromGroup: c.removeMeasureFromGroup,
      clearMeasureGroup: c.clearMeasureGroup,
    }),
    [c],
  );
}

export function useDataSourceMultiTable() {
  const c = useDataSource();
  return useMemo(
    () => ({
      joinedTables: c.dataSource.joinedTables,
      suggestedJoinableTables: c.dataSource.suggestedJoinableTables,
      unionTables: c.dataSource.unionTables,
      suggestedUnionableTables: c.dataSource.suggestedUnionableTables,
      virtualTable: c.dataSource.virtualTable,
      customRelationships: c.dataSource.customRelationships,
      setJoinedTables: c.setJoinedTables,
      setSuggestedJoinableTables: c.setSuggestedJoinableTables,
      setUnionTables: c.setUnionTables,
      setSuggestedUnionableTables: c.setSuggestedUnionableTables,
      setVirtualTable: c.setVirtualTable,
      toggleJoinedTable: c.toggleJoinedTable,
      addUnionTable: c.addUnionTable,
      removeUnionTable: c.removeUnionTable,
      setCustomRelationships: c.setCustomRelationships,
    }),
    [c],
  );
}

export function useDataSourceSessionFilters() {
  const c = useDataSource();
  return useMemo(
    () => ({
      sessionFilterFields: c.dataSource.sessionFilterFields,
      sessionFilterConfigurations: c.dataSource.sessionFilterConfigurations,
      sessionAppliedFilterConfigurations: c.dataSource.sessionAppliedFilterConfigurations,
      sessionFilterMetadata: c.dataSource.sessionFilterMetadata,
      setSessionFilterFields: c.setSessionFilterFields,
      addSessionFilterField: c.addSessionFilterField,
      removeSessionFilterField: c.removeSessionFilterField,
      setSessionFilterConfiguration: c.setSessionFilterConfiguration,
      setAndApplySessionFilterConfiguration: c.setAndApplySessionFilterConfiguration,
      removeSessionFilterConfiguration: c.removeSessionFilterConfiguration,
      applySessionFilters: c.applySessionFilters,
      setSessionFilterMetadata: c.setSessionFilterMetadata,
      clearSessionFilters: c.clearSessionFilters,
      restoreSessionFilters: c.restoreSessionFilters,
    }),
    [c],
  );
}

export function useDataSourceHivePartitions() {
  const c = useDataSource();
  return useMemo(
    () => ({
      hivePartitionFiles: c.dataSource.hivePartitionFiles,
      loadedPartitions: c.dataSource.loadedPartitions,
      isLoadingPartition: c.dataSource.isLoadingPartition,
      partitionLoadError: c.dataSource.partitionLoadError,
      setHivePartitionFiles: c.setHivePartitionFiles,
      loadHivePartition: c.loadHivePartition,
      isPartitionLoaded: c.isPartitionLoaded,
      clearHivePartitionState: c.clearHivePartitionState,
    }),
    [c],
  );
}
