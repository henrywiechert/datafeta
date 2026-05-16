// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { generateSyntheticFieldsForGroup } from '../utils/syntheticFields';
import { mapBackendDataType } from '../utils/fieldUtils';
import { Database, Table, Field, VirtualTableDefinition, VirtualColumnDefinition, FilterConfig, FilterMetadata, ForeignKeyRelationship } from '../types';
import { apiService } from '../apiService';

type VirtualColumnPreference = {
  type?: 'dimension' | 'measure';
  flavour?: 'discrete' | 'continuous';
  aggregation?: string;
};

// Define the state interface for data source (shared across all sheets)
interface DataSourceState {
  selectedDatabase: string;
  selectedTable: string;
  availableFields: Field[];
  databases: Database[];
  tables: Table[];
  tablesCache: Record<string, Table[]>;  // Cache of tables by database name (for cross-database union)
  isLoadingMetadata: boolean;
  metadataError: string | null;
  // Measure group fields (session-scoped for synthetic field generation)
  // Note: VisualizationContext also has measureGroupFields for per-sheet scope.
  // The DataSourceContext version is used to rebuild availableFields with synthetic
  // MeasureNames/MeasureValues fields. This duplication exists because:
  // - availableFields is session-scoped (shared across sheets)
  // - But users may want different measure groups per sheet
  // Future improvement: Unify this by making synthetic field generation dynamic
  // based on the active sheet's measure group selection.
  measureGroupFields: Field[];
  // Multi-table support - JOIN mode
  joinedTables: string[];  // List of additional tables joined to primary table
  suggestedJoinableTables: string[];  // Tables that can be joined
  // Multi-table support - UNION mode
  unionTables: Array<{database: string, table_name: string}>;  // List of tables to combine with UNION ALL (cross-database)
  suggestedUnionableTables: string[];  // DEPRECATED: Kept for backward compatibility
  // Virtual table definition
  virtualTable: VirtualTableDefinition | null;  // Current virtual table definition
  // Virtual columns (session scoped)
  virtualColumns: VirtualColumnDefinition[];
  virtualColumnFieldPreferences: Record<string, VirtualColumnPreference>;
  // Field display aliases (columnName -> user-defined display name)
  fieldDisplayAliases: Record<string, string>;
  // Session-scoped (global) filters that apply across all sheets
  sessionFilterFields: Field[];
  sessionFilterConfigurations: Record<string, FilterConfig>;
  sessionAppliedFilterConfigurations: Record<string, FilterConfig>;
  sessionFilterMetadata: Record<string, FilterMetadata>;
  // Manual FK relationships (null = auto-detect, array = manual override)
  customRelationships: ForeignKeyRelationship[] | null;
  // Hive Parquet partition management
  hivePartitionFiles: Map<string, File[]>;  // partition name -> files to upload
  loadedPartitions: Set<string>;  // partitions that have been uploaded to backend
  isLoadingPartition: boolean;
  partitionLoadError: string | null;
}

// Context interface
interface DataSourceContextType {
  dataSource: DataSourceState;
  setSelectedDatabase: (database: string) => void;
  setSelectedTable: (table: string) => void;
  setAvailableFields: (fields: Field[]) => void;
  setDatabases: (databases: Database[]) => void;
  setTables: (tables: Table[]) => void;
  setTablesForDatabase: (database: string, tables: Table[]) => void;
  setIsLoadingMetadata: (loading: boolean) => void;
  setMetadataError: (error: string | null) => void;
  setMeasureGroupFields: (fields: Field[]) => void;
  addMeasureToGroup: (field: Field) => void;
  removeMeasureFromGroup: (fieldIds: string[]) => void;
  clearMeasureGroup: () => void;
  setJoinedTables: (tables: string[]) => void;
  setSuggestedJoinableTables: (tables: string[]) => void;
  setUnionTables: (tables: Array<{database: string, table_name: string}>) => void;
  setSuggestedUnionableTables: (tables: string[]) => void;
  setVirtualTable: (virtualTable: VirtualTableDefinition | null) => void;
  toggleJoinedTable: (tableName: string) => void;
  addUnionTable: (database: string, tableName: string) => void;
  removeUnionTable: (database: string, tableName: string) => void;
  setVirtualColumns: (columns: VirtualColumnDefinition[]) => void;
  addVirtualColumn: (column: VirtualColumnDefinition) => void;
  updateVirtualColumn: (index: number, column: VirtualColumnDefinition) => void;
  removeVirtualColumn: (index: number) => void;
  setVirtualColumnFieldPreference: (columnName: string, preference: VirtualColumnPreference) => void;
  setVirtualColumnFieldPreferences: (preferences: Record<string, VirtualColumnPreference>) => void;
  setFieldAlias: (columnName: string, alias: string | undefined) => void;
  clearAllFieldAliases: () => void;
  // Manual FK relationships
  setCustomRelationships: (relationships: ForeignKeyRelationship[] | null) => void;
  // Session-scoped filters
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
  // Hive Parquet partition management
  setHivePartitionFiles: (partitionFiles: Map<string, File[]>) => void;
  loadHivePartition: (partitionName: string, setAsPrimary?: boolean, filesOverride?: File[]) => Promise<Field[]>;
  isPartitionLoaded: (partitionName: string) => boolean;
  clearHivePartitionState: () => void;
  // Reset all metadata state (used on connect/disconnect)
  resetMetadata: () => void;
}

const DataSourceContext = createContext<DataSourceContextType | undefined>(undefined);

// Provider component
export function DataSourceProvider({ children }: { children: ReactNode }) {
  const [dataSource, setDataSource] = useState<DataSourceState>({
    selectedDatabase: '',
    selectedTable: '',
    availableFields: [],
    databases: [],
    tables: [],
    tablesCache: {},
    isLoadingMetadata: false,
    metadataError: null,
    measureGroupFields: [],
    joinedTables: [],
    suggestedJoinableTables: [],
    unionTables: [],
    suggestedUnionableTables: [],
    virtualTable: null,
    virtualColumns: [],
    virtualColumnFieldPreferences: {},
    fieldDisplayAliases: {},
    customRelationships: null,
    sessionFilterFields: [],
    sessionFilterConfigurations: {},
    sessionAppliedFilterConfigurations: {},
    sessionFilterMetadata: {},
    hivePartitionFiles: new Map(),
    loadedPartitions: new Set(),
    isLoadingPartition: false,
    partitionLoadError: null,
  });

  const getBaseFields = (fields: Field[]) => fields.filter(field => !field.isSynthetic);

  const rebuildAvailableFieldsForGroup = (
    fields: Field[],
    measureGroupFields: Field[]
  ) => {
    const baseFields = getBaseFields(fields);
    if (baseFields.length === 0) {
      return fields;
    }
    const measureNames = measureGroupFields.map(field => field.columnName);
    const syntheticFields = generateSyntheticFieldsForGroup(baseFields, measureNames);
    return [...baseFields, ...syntheticFields];
  };

  const setSelectedDatabase = (database: string) => {
    setDataSource(prev => ({ ...prev, selectedDatabase: database }));
  };

  const setSelectedTable = (table: string) => {
    setDataSource(prev => ({ 
      ...prev, 
      selectedTable: table,
      // Reset multi-table state when primary table changes
      joinedTables: [],
      suggestedJoinableTables: [],
      unionTables: [],
      suggestedUnionableTables: [],
      virtualTable: null,
      customRelationships: null,
    }));
  };

  const setAvailableFields = (fields: Field[]) => {
    setDataSource(prev => ({ ...prev, availableFields: fields }));
  };

  const setDatabases = (databases: Database[]) => {
    setDataSource(prev => ({ ...prev, databases }));
  };

  const setTables = (tables: Table[]) => {
    setDataSource(prev => ({ 
      ...prev, 
      tables,
      // Also update cache for current database
      tablesCache: prev.selectedDatabase 
        ? { ...prev.tablesCache, [prev.selectedDatabase]: tables }
        : prev.tablesCache
    }));
  };

  const setTablesForDatabase = (database: string, tables: Table[]) => {
    setDataSource(prev => ({
      ...prev,
      tablesCache: { ...prev.tablesCache, [database]: tables }
    }));
  };

  const setIsLoadingMetadata = (loading: boolean) => {
    setDataSource(prev => ({ ...prev, isLoadingMetadata: loading }));
  };

  const setMetadataError = (error: string | null) => {
    setDataSource(prev => ({ ...prev, metadataError: error }));
  };

  const setMeasureGroupFields = (fields: Field[]) => {
    setDataSource(prev => ({
      ...prev,
      measureGroupFields: fields,
      availableFields: rebuildAvailableFieldsForGroup(
        prev.availableFields,
        fields
      ),
    }));
  };

  const addMeasureToGroup = (field: Field) => {
    setDataSource(prev => {
      if (prev.measureGroupFields.some(item => item.columnName === field.columnName)) {
        return prev;
      }
      const nextFields = [...prev.measureGroupFields, field];
      return {
        ...prev,
        measureGroupFields: nextFields,
        availableFields: rebuildAvailableFieldsForGroup(prev.availableFields, nextFields),
      };
    });
  };

  const removeMeasureFromGroup = (fieldIds: string[]) => {
    setDataSource(prev => {
      const idSet = new Set(fieldIds);
      const nextFields = prev.measureGroupFields.filter(item => !idSet.has(item.id));
      return {
        ...prev,
        measureGroupFields: nextFields,
        availableFields: rebuildAvailableFieldsForGroup(prev.availableFields, nextFields),
      };
    });
  };

  const clearMeasureGroup = () => {
    setDataSource(prev => ({
      ...prev,
      measureGroupFields: [],
      availableFields: rebuildAvailableFieldsForGroup(prev.availableFields, []),
    }));
  };

  const setJoinedTables = (tables: string[]) => {
    setDataSource(prev => ({ ...prev, joinedTables: tables }));
  };

  const setSuggestedJoinableTables = (tables: string[]) => {
    setDataSource(prev => ({ ...prev, suggestedJoinableTables: tables }));
  };

  const setUnionTables = (tables: Array<{database: string, table_name: string}>) => {
    setDataSource(prev => ({ ...prev, unionTables: tables }));
  };

  const setSuggestedUnionableTables = (tables: string[]) => {
    setDataSource(prev => ({ ...prev, suggestedUnionableTables: tables }));
  };

  const setVirtualTable = (virtualTable: VirtualTableDefinition | null) => {
    setDataSource(prev => ({ ...prev, virtualTable }));
  };

  const toggleJoinedTable = (tableName: string) => {
    setDataSource(prev => {
      const isCurrentlyJoined = prev.joinedTables.includes(tableName);
      const newJoinedTables = isCurrentlyJoined
        ? prev.joinedTables.filter(t => t !== tableName)
        : [...prev.joinedTables, tableName];
      return { ...prev, joinedTables: newJoinedTables };
    });
  };

  const addUnionTable = (database: string, tableName: string) => {
    setDataSource(prev => {
      // Check if table is already in the union
      const exists = prev.unionTables.some(
        ut => ut.database === database && ut.table_name === tableName
      );
      if (exists) return prev;
      
      return {
        ...prev,
        unionTables: [...prev.unionTables, { database, table_name: tableName }]
      };
    });
  };

  const removeUnionTable = (database: string, tableName: string) => {
    setDataSource(prev => ({
      ...prev,
      unionTables: prev.unionTables.filter(
        ut => !(ut.database === database && ut.table_name === tableName)
      )
    }));
  };

  const setVirtualColumns = (columns: VirtualColumnDefinition[]) => {
    setDataSource(prev => ({
      ...prev,
      virtualColumns: columns,
    }));
  };

  const addVirtualColumn = (column: VirtualColumnDefinition) => {
    setDataSource(prev => ({
      ...prev,
      virtualColumns: [...prev.virtualColumns, column],
    }));
  };

  const updateVirtualColumn = (index: number, column: VirtualColumnDefinition) => {
    setDataSource(prev => {
      if (index < 0 || index >= prev.virtualColumns.length) return prev;
      const next = [...prev.virtualColumns];
      next[index] = column;
      return {
        ...prev,
        virtualColumns: next,
      };
    });
  };

  const removeVirtualColumn = (index: number) => {
    setDataSource(prev => {
      if (index < 0 || index >= prev.virtualColumns.length) return prev;
      const removed = prev.virtualColumns[index];
      const nextPrefs = { ...prev.virtualColumnFieldPreferences };
      if (removed?.name) {
        delete nextPrefs[removed.name];
      }
      return {
        ...prev,
        virtualColumns: prev.virtualColumns.filter((_, i) => i !== index),
        virtualColumnFieldPreferences: nextPrefs,
      };
    });
  };

  const setVirtualColumnFieldPreference = (columnName: string, preference: VirtualColumnPreference) => {
    if (!columnName) return;
    setDataSource(prev => ({
      ...prev,
      virtualColumnFieldPreferences: {
        ...prev.virtualColumnFieldPreferences,
        [columnName]: {
          ...prev.virtualColumnFieldPreferences[columnName],
          ...preference,
        },
      },
    }));
  };

  const setVirtualColumnFieldPreferences = (preferences: Record<string, VirtualColumnPreference>) => {
    setDataSource(prev => ({
      ...prev,
      virtualColumnFieldPreferences: preferences || {},
    }));
  };

  // Session filter methods
  const setSessionFilterFields = (fields: Field[]) => {
    setDataSource(prev => ({ ...prev, sessionFilterFields: fields }));
  };

  const addSessionFilterField = (field: Field) => {
    setDataSource(prev => {
      // Prevent duplicates
      if (prev.sessionFilterFields.some(f => f.id === field.id)) {
        return prev;
      }
      return {
        ...prev,
        sessionFilterFields: [...prev.sessionFilterFields, field],
      };
    });
  };

  const removeSessionFilterField = (fieldId: string) => {
    setDataSource(prev => {
      const { [fieldId]: _removedConfig, ...remainingConfigs } = prev.sessionFilterConfigurations;
      const { [fieldId]: _removedApplied, ...remainingApplied } = prev.sessionAppliedFilterConfigurations;
      const { [fieldId]: _removedMeta, ...remainingMeta } = prev.sessionFilterMetadata;
      return {
        ...prev,
        sessionFilterFields: prev.sessionFilterFields.filter(f => f.id !== fieldId),
        sessionFilterConfigurations: remainingConfigs,
        sessionAppliedFilterConfigurations: remainingApplied,
        sessionFilterMetadata: remainingMeta,
      };
    });
  };

  const setSessionFilterConfiguration = (fieldId: string, config: FilterConfig) => {
    setDataSource(prev => ({
      ...prev,
      sessionFilterConfigurations: {
        ...prev.sessionFilterConfigurations,
        [fieldId]: { ...config, scope: 'session' as const },
      },
    }));
  };

  // Set session filter configuration AND apply it in a single atomic update.
  // This prevents race conditions when marking filters as global.
  const setAndApplySessionFilterConfiguration = (fieldId: string, config: FilterConfig) => {
    const sessionConfig = { ...config, scope: 'session' as const };
    setDataSource(prev => ({
      ...prev,
      sessionFilterConfigurations: {
        ...prev.sessionFilterConfigurations,
        [fieldId]: sessionConfig,
      },
      sessionAppliedFilterConfigurations: {
        ...prev.sessionAppliedFilterConfigurations,
        [fieldId]: sessionConfig,
      },
    }));
  };

  const removeSessionFilterConfiguration = (fieldId: string) => {
    setDataSource(prev => {
      const { [fieldId]: _removed, ...remaining } = prev.sessionFilterConfigurations;
      return {
        ...prev,
        sessionFilterConfigurations: remaining,
      };
    });
  };

  const applySessionFilters = () => {
    setDataSource(prev => ({
      ...prev,
      sessionAppliedFilterConfigurations: { ...prev.sessionFilterConfigurations },
    }));
  };

  const setSessionFilterMetadata = (fieldId: string, metadata: FilterMetadata) => {
    setDataSource(prev => ({
      ...prev,
      sessionFilterMetadata: {
        ...prev.sessionFilterMetadata,
        [fieldId]: metadata,
      },
    }));
  };

  const clearSessionFilters = () => {
    setDataSource(prev => ({
      ...prev,
      sessionFilterFields: [],
      sessionFilterConfigurations: {},
      sessionAppliedFilterConfigurations: {},
      sessionFilterMetadata: {},
    }));
  };

  const restoreSessionFilters = (fields: Field[], configurations: Record<string, FilterConfig>) => {
    setDataSource(prev => ({
      ...prev,
      sessionFilterFields: fields,
      sessionFilterConfigurations: configurations,
      sessionAppliedFilterConfigurations: configurations,
      sessionFilterMetadata: {},
    }));
  };

  // Hive Parquet partition management
  const setHivePartitionFiles = (partitionFiles: Map<string, File[]>) => {
    setDataSource(prev => ({
      ...prev,
      hivePartitionFiles: partitionFiles,
    }));
  };

  const loadHivePartition = useCallback(async (partitionName: string, setAsPrimary: boolean = true, filesOverride?: File[]): Promise<Field[]> => {
    // Check if already loaded
    if (dataSource.loadedPartitions.has(partitionName)) {
      return [];
    }

    // Get files for this partition (use filesOverride when restoring from snapshot)
    const files = filesOverride ?? dataSource.hivePartitionFiles.get(partitionName);
    if (!files || files.length === 0) {
      throw new Error(`No files found for partition '${partitionName}'`);
    }

    // Use flushSync to ensure loading state renders before async upload starts
    // Without this, React 18's automatic batching might batch the true/false updates together
    console.log('[loadHivePartition] Setting isLoadingPartition = true');
    flushSync(() => {
      setDataSource(prev => ({
        ...prev,
        isLoadingPartition: true,
        partitionLoadError: null,
      }));
    });

    try {
      console.log('[loadHivePartition] Starting API call...');
      const response = await apiService.loadPartition(partitionName, files);
      console.log('[loadHivePartition] API call completed');
      
      // Convert response columns to Field objects
      const fields: Field[] = response.columns.map((col: { name: string; data_type: string; is_datetime: boolean }) => {
        const dataType = mapBackendDataType(col.data_type);
        const isNumeric = dataType === 'integer' || dataType === 'float';
        return {
          id: `${partitionName}.${col.name}`,
          columnName: col.name,
          dataType,
          type: col.is_datetime ? 'dimension' : (isNumeric ? 'measure' : 'dimension'),
          flavour: isNumeric ? 'continuous' : 'discrete',
          tableName: partitionName,
        };
      });

      setDataSource(prev => {
        const newLoadedPartitions = new Set(prev.loadedPartitions);
        newLoadedPartitions.add(partitionName);
        
        if (setAsPrimary) {
          // Set as primary table
          return {
            ...prev,
            loadedPartitions: newLoadedPartitions,
            isLoadingPartition: false,
            selectedTable: partitionName,
            availableFields: fields,
          };
        } else {
          // Add as UNION table (don't change primary)
          const newUnionTables = [...prev.unionTables, { database: '', table_name: partitionName }];
          return {
            ...prev,
            loadedPartitions: newLoadedPartitions,
            isLoadingPartition: false,
            unionTables: newUnionTables,
          };
        }
      });

      return fields;
    } catch (err: any) {
      setDataSource(prev => ({
        ...prev,
        isLoadingPartition: false,
        partitionLoadError: err.message || 'Failed to load partition',
      }));
      throw err;
    }
  }, [dataSource.loadedPartitions, dataSource.hivePartitionFiles]);

  const isPartitionLoaded = useCallback((partitionName: string): boolean => {
    return dataSource.loadedPartitions.has(partitionName);
  }, [dataSource.loadedPartitions]);

  const clearHivePartitionState = () => {
    setDataSource(prev => ({
      ...prev,
      hivePartitionFiles: new Map(),
      loadedPartitions: new Set(),
      isLoadingPartition: false,
      partitionLoadError: null,
    }));
  };

  // Reset all metadata state - used when connecting/disconnecting from data source
  const resetMetadata = () => {
    setDataSource(prev => ({
      ...prev,
      databases: [],
      tables: [],
      tablesCache: {},
      selectedDatabase: '',
      selectedTable: '',
      availableFields: [],
      isLoadingMetadata: false,
      metadataError: null,
      measureGroupFields: [],
      joinedTables: [],
      suggestedJoinableTables: [],
      unionTables: [],
      suggestedUnionableTables: [],
      virtualTable: null,
      customRelationships: null,
      // Clear session filters on disconnect
      sessionFilterFields: [],
      sessionFilterConfigurations: {},
      sessionAppliedFilterConfigurations: {},
      sessionFilterMetadata: {},
      // Clear Hive Parquet state
      hivePartitionFiles: new Map(),
      loadedPartitions: new Set(),
      isLoadingPartition: false,
      partitionLoadError: null,
      // Note: virtualColumns and virtualColumnFieldPreferences are intentionally preserved
      // as they may be reused across connections
    }));
  };

  // Set or clear display alias for a field (by column name)
  // Aliases are looked up at render time, so we only need to update the map
  const setFieldAlias = (columnName: string, alias: string | undefined) => {
    setDataSource(prev => {
      if (!alias) {
        // Clear alias
        const { [columnName]: _, ...rest } = prev.fieldDisplayAliases;
        return { ...prev, fieldDisplayAliases: rest };
      }
      // Set alias
      return {
        ...prev,
        fieldDisplayAliases: {
          ...prev.fieldDisplayAliases,
          [columnName]: alias,
        },
      };
    });
  };

  // Clear all field aliases
  const clearAllFieldAliases = () => {
    setDataSource(prev => ({
      ...prev,
      fieldDisplayAliases: {},
    }));
  };

  // Set custom FK relationships (null = auto-detect, array = manual)
  const setCustomRelationships = (relationships: ForeignKeyRelationship[] | null) => {
    setDataSource(prev => ({
      ...prev,
      customRelationships: relationships,
    }));
  };

  return (
    <DataSourceContext.Provider
      value={{
        dataSource,
        setSelectedDatabase,
        setSelectedTable,
        setAvailableFields,
        setDatabases,
        setTables,
        setTablesForDatabase,
        setIsLoadingMetadata,
        setMetadataError,
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
        setVirtualColumns,
        addVirtualColumn,
        updateVirtualColumn,
        removeVirtualColumn,
        setVirtualColumnFieldPreference,
        setVirtualColumnFieldPreferences,
        setFieldAlias,
        clearAllFieldAliases,
        setCustomRelationships,
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
        resetMetadata,
      }}
    >
      {children}
    </DataSourceContext.Provider>
  );
}

// Custom hook to use the context
export function useDataSource() {
  const context = useContext(DataSourceContext);
  if (context === undefined) {
    throw new Error('useDataSource must be used within a DataSourceProvider');
  }
  return context;
}
