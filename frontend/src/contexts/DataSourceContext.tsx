import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Database, Table, Field, VirtualTableDefinition } from '../types';
import { generateSyntheticFieldsForGroup } from '../utils/syntheticFields';

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
  // Single measure group (global) with independent field copies
  measureGroupFields: Field[];
  // Multi-table support - JOIN mode
  joinedTables: string[];  // List of additional tables joined to primary table
  suggestedJoinableTables: string[];  // Tables that can be joined
  // Multi-table support - UNION mode
  unionTables: Array<{database: string, table_name: string}>;  // List of tables to combine with UNION ALL (cross-database)
  suggestedUnionableTables: string[];  // DEPRECATED: Kept for backward compatibility
  // Virtual table definition
  virtualTable: VirtualTableDefinition | null;  // Current virtual table definition
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
