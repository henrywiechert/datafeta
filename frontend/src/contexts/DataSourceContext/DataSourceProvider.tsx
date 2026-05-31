// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, {
  createContext,
  ReactNode,
  useCallback,
  useMemo,
  useReducer,
  useRef,
  useEffect,
} from 'react';
import { flushSync } from 'react-dom';
import {
  Database,
  Table,
  Field,
  VirtualTableDefinition,
  VirtualColumnDefinition,
  FilterConfig,
  FilterMetadata,
  ForeignKeyRelationship,
} from '../../types';
import { apiService } from '../../apiService';
import { mapBackendDataType } from '../../utils/fieldUtils';
import { dataSourceReducer, initialDataSourceState } from './reducer';
import { DataSourceState, VirtualColumnPreference } from './types';

// Public context shape — preserved exactly to keep existing consumers compiling.
export interface DataSourceContextType {
  dataSource: DataSourceState;
  // ----- METADATA -----
  setSelectedDatabase: (database: string) => void;
  setSelectedTable: (table: string) => void;
  setAvailableFields: (fields: Field[]) => void;
  setDatabases: (databases: Database[]) => void;
  setTables: (tables: Table[]) => void;
  setTablesForDatabase: (database: string, tables: Table[]) => void;
  setIsLoadingMetadata: (loading: boolean) => void;
  setMetadataError: (error: string | null) => void;
  resetMetadata: () => void;
  // ----- MEASURE-GROUP -----
  setMeasureGroupFields: (fields: Field[]) => void;
  addMeasureToGroup: (field: Field) => void;
  removeMeasureFromGroup: (fieldIds: string[]) => void;
  clearMeasureGroup: () => void;
  // ----- MULTI-TABLE -----
  setJoinedTables: (tables: string[]) => void;
  setSuggestedJoinableTables: (tables: string[]) => void;
  setUnionTables: (tables: Array<{ database: string; table_name: string }>) => void;
  setSuggestedUnionableTables: (tables: string[]) => void;
  setVirtualTable: (virtualTable: VirtualTableDefinition | null) => void;
  toggleJoinedTable: (tableName: string) => void;
  addUnionTable: (database: string, tableName: string) => void;
  removeUnionTable: (database: string, tableName: string) => void;
  setCustomRelationships: (relationships: ForeignKeyRelationship[] | null) => void;
  // ----- VIRTUAL-COLUMNS / aliases -----
  setVirtualColumns: (columns: VirtualColumnDefinition[]) => void;
  addVirtualColumn: (column: VirtualColumnDefinition) => void;
  updateVirtualColumn: (index: number, column: VirtualColumnDefinition) => void;
  removeVirtualColumn: (index: number) => void;
  setVirtualColumnFieldPreference: (columnName: string, preference: VirtualColumnPreference) => void;
  setVirtualColumnFieldPreferences: (preferences: Record<string, VirtualColumnPreference>) => void;
  setFieldAlias: (columnName: string, alias: string | undefined) => void;
  clearAllFieldAliases: () => void;
  // ----- SESSION-FILTERS -----
  setSessionFilterFields: (fields: Field[]) => void;
  addSessionFilterField: (field: Field) => void;
  removeSessionFilterField: (fieldId: string) => void;
  setSessionFilterConfiguration: (fieldId: string, config: FilterConfig) => void;
  setAndApplySessionFilterConfiguration: (fieldId: string, config: FilterConfig) => void;
  removeSessionFilterConfiguration: (fieldId: string) => void;
  applySessionFilters: () => void;
  setSessionFilterMetadata: (fieldId: string, metadata: FilterMetadata) => void;
  clearSessionFilters: () => void;
  restoreSessionFilters: (fields: Field[], configurations: Record<string, FilterConfig>) => void;
  // ----- HIVE-PARTITION -----
  setHivePartitionFiles: (partitionFiles: Map<string, File[]>) => void;
  loadHivePartition: (
    partitionName: string,
    setAsPrimary?: boolean,
    filesOverride?: File[],
  ) => Promise<Field[]>;
  isPartitionLoaded: (partitionName: string) => boolean;
  clearHivePartitionState: () => void;
}

export const DataSourceContext = createContext<DataSourceContextType | undefined>(undefined);

export function DataSourceProvider({ children }: { children: ReactNode }) {
  const [dataSource, dispatch] = useReducer(dataSourceReducer, initialDataSourceState);

  // Keep a ref to the latest state so async callbacks (loadHivePartition,
  // isPartitionLoaded) can read fresh state without re-creating on every
  // render. dispatch itself is already stable.
  const stateRef = useRef(dataSource);
  useEffect(() => {
    stateRef.current = dataSource;
  });

  // ----- METADATA -----
  const setSelectedDatabase = useCallback(
    (database: string) => dispatch({ type: 'SET_SELECTED_DATABASE', payload: database }),
    [],
  );
  const setSelectedTable = useCallback(
    (table: string) => dispatch({ type: 'SET_SELECTED_TABLE', payload: table }),
    [],
  );
  const setAvailableFields = useCallback(
    (fields: Field[]) => dispatch({ type: 'SET_AVAILABLE_FIELDS', payload: fields }),
    [],
  );
  const setDatabases = useCallback(
    (databases: Database[]) => dispatch({ type: 'SET_DATABASES', payload: databases }),
    [],
  );
  const setTables = useCallback(
    (tables: Table[]) => dispatch({ type: 'SET_TABLES', payload: tables }),
    [],
  );
  const setTablesForDatabase = useCallback(
    (database: string, tables: Table[]) =>
      dispatch({ type: 'SET_TABLES_FOR_DATABASE', payload: { database, tables } }),
    [],
  );
  const setIsLoadingMetadata = useCallback(
    (loading: boolean) => dispatch({ type: 'SET_IS_LOADING_METADATA', payload: loading }),
    [],
  );
  const setMetadataError = useCallback(
    (error: string | null) => dispatch({ type: 'SET_METADATA_ERROR', payload: error }),
    [],
  );
  const resetMetadata = useCallback(() => dispatch({ type: 'RESET_METADATA' }), []);

  // ----- MEASURE-GROUP -----
  const setMeasureGroupFields = useCallback(
    (fields: Field[]) => dispatch({ type: 'SET_MEASURE_GROUP_FIELDS', payload: fields }),
    [],
  );
  const addMeasureToGroup = useCallback(
    (field: Field) => dispatch({ type: 'ADD_MEASURE_TO_GROUP', payload: field }),
    [],
  );
  const removeMeasureFromGroup = useCallback(
    (fieldIds: string[]) => dispatch({ type: 'REMOVE_MEASURES_FROM_GROUP', payload: fieldIds }),
    [],
  );
  const clearMeasureGroup = useCallback(() => dispatch({ type: 'CLEAR_MEASURE_GROUP' }), []);

  // ----- MULTI-TABLE -----
  const setJoinedTables = useCallback(
    (tables: string[]) => dispatch({ type: 'SET_JOINED_TABLES', payload: tables }),
    [],
  );
  const setSuggestedJoinableTables = useCallback(
    (tables: string[]) => dispatch({ type: 'SET_SUGGESTED_JOINABLE_TABLES', payload: tables }),
    [],
  );
  const setUnionTables = useCallback(
    (tables: Array<{ database: string; table_name: string }>) =>
      dispatch({ type: 'SET_UNION_TABLES', payload: tables }),
    [],
  );
  const setSuggestedUnionableTables = useCallback(
    (tables: string[]) => dispatch({ type: 'SET_SUGGESTED_UNIONABLE_TABLES', payload: tables }),
    [],
  );
  const setVirtualTable = useCallback(
    (virtualTable: VirtualTableDefinition | null) =>
      dispatch({ type: 'SET_VIRTUAL_TABLE', payload: virtualTable }),
    [],
  );
  const toggleJoinedTable = useCallback(
    (tableName: string) => dispatch({ type: 'TOGGLE_JOINED_TABLE', payload: tableName }),
    [],
  );
  const addUnionTable = useCallback(
    (database: string, tableName: string) =>
      dispatch({ type: 'ADD_UNION_TABLE', payload: { database, tableName } }),
    [],
  );
  const removeUnionTable = useCallback(
    (database: string, tableName: string) =>
      dispatch({ type: 'REMOVE_UNION_TABLE', payload: { database, tableName } }),
    [],
  );
  const setCustomRelationships = useCallback(
    (relationships: ForeignKeyRelationship[] | null) =>
      dispatch({ type: 'SET_CUSTOM_RELATIONSHIPS', payload: relationships }),
    [],
  );

  // ----- VIRTUAL-COLUMNS / aliases -----
  const setVirtualColumns = useCallback(
    (columns: VirtualColumnDefinition[]) =>
      dispatch({ type: 'SET_VIRTUAL_COLUMNS', payload: columns }),
    [],
  );
  const addVirtualColumn = useCallback(
    (column: VirtualColumnDefinition) => dispatch({ type: 'ADD_VIRTUAL_COLUMN', payload: column }),
    [],
  );
  const updateVirtualColumn = useCallback(
    (index: number, column: VirtualColumnDefinition) =>
      dispatch({ type: 'UPDATE_VIRTUAL_COLUMN', payload: { index, column } }),
    [],
  );
  const removeVirtualColumn = useCallback(
    (index: number) => dispatch({ type: 'REMOVE_VIRTUAL_COLUMN', payload: index }),
    [],
  );
  const setVirtualColumnFieldPreference = useCallback(
    (columnName: string, preference: VirtualColumnPreference) =>
      dispatch({ type: 'SET_VC_FIELD_PREFERENCE', payload: { columnName, preference } }),
    [],
  );
  const setVirtualColumnFieldPreferences = useCallback(
    (preferences: Record<string, VirtualColumnPreference>) =>
      dispatch({ type: 'SET_VC_FIELD_PREFERENCES', payload: preferences }),
    [],
  );
  const setFieldAlias = useCallback(
    (columnName: string, alias: string | undefined) =>
      dispatch({ type: 'SET_FIELD_ALIAS', payload: { columnName, alias } }),
    [],
  );
  const clearAllFieldAliases = useCallback(
    () => dispatch({ type: 'CLEAR_ALL_FIELD_ALIASES' }),
    [],
  );

  // ----- SESSION-FILTERS -----
  const setSessionFilterFields = useCallback(
    (fields: Field[]) => dispatch({ type: 'SET_SESSION_FILTER_FIELDS', payload: fields }),
    [],
  );
  const addSessionFilterField = useCallback(
    (field: Field) => dispatch({ type: 'ADD_SESSION_FILTER_FIELD', payload: field }),
    [],
  );
  const removeSessionFilterField = useCallback(
    (fieldId: string) => dispatch({ type: 'REMOVE_SESSION_FILTER_FIELD', payload: fieldId }),
    [],
  );
  const setSessionFilterConfiguration = useCallback(
    (fieldId: string, config: FilterConfig) =>
      dispatch({ type: 'SET_SESSION_FILTER_CONFIG', payload: { fieldId, config } }),
    [],
  );
  const setAndApplySessionFilterConfiguration = useCallback(
    (fieldId: string, config: FilterConfig) =>
      dispatch({ type: 'SET_AND_APPLY_SESSION_FILTER_CONFIG', payload: { fieldId, config } }),
    [],
  );
  const removeSessionFilterConfiguration = useCallback(
    (fieldId: string) => dispatch({ type: 'REMOVE_SESSION_FILTER_CONFIG', payload: fieldId }),
    [],
  );
  const applySessionFilters = useCallback(() => dispatch({ type: 'APPLY_SESSION_FILTERS' }), []);
  const setSessionFilterMetadata = useCallback(
    (fieldId: string, metadata: FilterMetadata) =>
      dispatch({ type: 'SET_SESSION_FILTER_METADATA', payload: { fieldId, metadata } }),
    [],
  );
  const clearSessionFilters = useCallback(
    () => dispatch({ type: 'CLEAR_SESSION_FILTERS' }),
    [],
  );
  const restoreSessionFilters = useCallback(
    (fields: Field[], configurations: Record<string, FilterConfig>) =>
      dispatch({ type: 'RESTORE_SESSION_FILTERS', payload: { fields, configurations } }),
    [],
  );

  // ----- HIVE-PARTITION -----
  const setHivePartitionFiles = useCallback(
    (partitionFiles: Map<string, File[]>) =>
      dispatch({ type: 'SET_HIVE_PARTITION_FILES', payload: partitionFiles }),
    [],
  );

  const loadHivePartition = useCallback(
    async (
      partitionName: string,
      setAsPrimary: boolean = true,
      filesOverride?: File[],
    ): Promise<Field[]> => {
      const current = stateRef.current;

      if (current.loadedPartitions.has(partitionName)) {
        return [];
      }

      const files = filesOverride ?? current.hivePartitionFiles.get(partitionName);
      if (!files || files.length === 0) {
        throw new Error(`No files found for partition '${partitionName}'`);
      }

      // flushSync ensures the loading state renders before the async upload
      // starts; without it, React 18's automatic batching could merge the
      // true/false updates.
      flushSync(() => {
        dispatch({ type: 'HIVE_PARTITION_LOAD_START' });
      });

      try {
        const response = await apiService.loadPartition(partitionName, files);

        const fields: Field[] = response.columns.map(
          (col: { name: string; data_type: string; is_datetime: boolean }) => {
            const dataType = mapBackendDataType(col.data_type);
            const isNumeric = dataType === 'integer' || dataType === 'float';
            return {
              id: `${partitionName}.${col.name}`,
              columnName: col.name,
              dataType,
              type: col.is_datetime ? 'dimension' : isNumeric ? 'measure' : 'dimension',
              flavour: isNumeric ? 'continuous' : 'discrete',
              tableName: partitionName,
            };
          },
        );

        dispatch({
          type: 'HIVE_PARTITION_LOAD_SUCCESS',
          payload: { partitionName, fields, setAsPrimary },
        });

        return fields;
      } catch (err: any) {
        dispatch({
          type: 'HIVE_PARTITION_LOAD_ERROR',
          payload: err?.message || 'Failed to load partition',
        });
        throw err;
      }
    },
    [],
  );

  const isPartitionLoaded = useCallback(
    (partitionName: string): boolean => stateRef.current.loadedPartitions.has(partitionName),
    [],
  );

  const clearHivePartitionState = useCallback(
    () => dispatch({ type: 'CLEAR_HIVE_PARTITION_STATE' }),
    [],
  );

  // Memoize the value object so consumers wrapped in React.memo don't see a
  // new reference unless `dataSource` actually changed (all setters are
  // useCallback-stable).
  const value = useMemo<DataSourceContextType>(
    () => ({
      dataSource,
      setSelectedDatabase,
      setSelectedTable,
      setAvailableFields,
      setDatabases,
      setTables,
      setTablesForDatabase,
      setIsLoadingMetadata,
      setMetadataError,
      resetMetadata,
      setMeasureGroupFields,
      addMeasureToGroup,
      removeMeasureFromGroup,
      clearMeasureGroup,
      setJoinedTables,
      setSuggestedJoinableTables,
      setUnionTables,
      setSuggestedUnionableTables,
      setVirtualTable,
      toggleJoinedTable,
      addUnionTable,
      removeUnionTable,
      setCustomRelationships,
      setVirtualColumns,
      addVirtualColumn,
      updateVirtualColumn,
      removeVirtualColumn,
      setVirtualColumnFieldPreference,
      setVirtualColumnFieldPreferences,
      setFieldAlias,
      clearAllFieldAliases,
      setSessionFilterFields,
      addSessionFilterField,
      removeSessionFilterField,
      setSessionFilterConfiguration,
      setAndApplySessionFilterConfiguration,
      removeSessionFilterConfiguration,
      applySessionFilters,
      setSessionFilterMetadata,
      clearSessionFilters,
      restoreSessionFilters,
      setHivePartitionFiles,
      loadHivePartition,
      isPartitionLoaded,
      clearHivePartitionState,
    }),
    [
      dataSource,
      setSelectedDatabase,
      setSelectedTable,
      setAvailableFields,
      setDatabases,
      setTables,
      setTablesForDatabase,
      setIsLoadingMetadata,
      setMetadataError,
      resetMetadata,
      setMeasureGroupFields,
      addMeasureToGroup,
      removeMeasureFromGroup,
      clearMeasureGroup,
      setJoinedTables,
      setSuggestedJoinableTables,
      setUnionTables,
      setSuggestedUnionableTables,
      setVirtualTable,
      toggleJoinedTable,
      addUnionTable,
      removeUnionTable,
      setCustomRelationships,
      setVirtualColumns,
      addVirtualColumn,
      updateVirtualColumn,
      removeVirtualColumn,
      setVirtualColumnFieldPreference,
      setVirtualColumnFieldPreferences,
      setFieldAlias,
      clearAllFieldAliases,
      setSessionFilterFields,
      addSessionFilterField,
      removeSessionFilterField,
      setSessionFilterConfiguration,
      setAndApplySessionFilterConfiguration,
      removeSessionFilterConfiguration,
      applySessionFilters,
      setSessionFilterMetadata,
      clearSessionFilters,
      restoreSessionFilters,
      setHivePartitionFiles,
      loadHivePartition,
      isPartitionLoaded,
      clearHivePartitionState,
    ],
  );

  return <DataSourceContext.Provider value={value}>{children}</DataSourceContext.Provider>;
}
