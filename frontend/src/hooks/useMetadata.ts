// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { useDataSource } from '../contexts/DataSourceContext';
import { Database, Table, Field } from '../types';

/**
 * Convenience hook for reading metadata from DataSourceContext.
 * This provides a simpler interface for components that only need to read metadata
 * without needing to access the full DataSourceContext.
 * 
 * Note: Metadata (databases, tables, selectedDatabase, selectedTable, availableFields)
 * is session-scoped (shared across all sheets). It was previously duplicated in
 * VisualizationContext but has been consolidated here.
 */
export interface MetadataState {
  databases: Database[];
  tables: Table[];
  selectedDatabase: string;
  selectedTable: string;
  availableFields: Field[];
  isLoadingMetadata: boolean;
  metadataError: string | null;
}

export function useMetadata(): MetadataState {
  const { dataSource } = useDataSource();
  return {
    databases: dataSource.databases,
    tables: dataSource.tables,
    selectedDatabase: dataSource.selectedDatabase,
    selectedTable: dataSource.selectedTable,
    availableFields: dataSource.availableFields,
    isLoadingMetadata: dataSource.isLoadingMetadata,
    metadataError: dataSource.metadataError,
  };
}
