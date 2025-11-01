import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Database, Table, Field, VirtualTableDefinition } from '../types';

// Define the state interface for data source (shared across all sheets)
interface DataSourceState {
  selectedDatabase: string;
  selectedTable: string;
  availableFields: Field[];
  databases: Database[];
  tables: Table[];
  isLoadingMetadata: boolean;
  metadataError: string | null;
  // Multi-table support - JOIN mode
  joinedTables: string[];  // List of additional tables joined to primary table
  suggestedJoinableTables: string[];  // Tables that can be joined
  // Multi-table support - UNION mode
  unionTables: string[];  // List of tables to combine with UNION ALL
  suggestedUnionableTables: string[];  // Tables with matching schemas
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
  setIsLoadingMetadata: (loading: boolean) => void;
  setMetadataError: (error: string | null) => void;
  setJoinedTables: (tables: string[]) => void;
  setSuggestedJoinableTables: (tables: string[]) => void;
  setUnionTables: (tables: string[]) => void;
  setSuggestedUnionableTables: (tables: string[]) => void;
  setVirtualTable: (virtualTable: VirtualTableDefinition | null) => void;
  toggleJoinedTable: (tableName: string) => void;
  toggleUnionTable: (tableName: string) => void;
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
    isLoadingMetadata: false,
    metadataError: null,
    joinedTables: [],
    suggestedJoinableTables: [],
    unionTables: [],
    suggestedUnionableTables: [],
    virtualTable: null,
  });

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
    setDataSource(prev => ({ ...prev, tables }));
  };

  const setIsLoadingMetadata = (loading: boolean) => {
    setDataSource(prev => ({ ...prev, isLoadingMetadata: loading }));
  };

  const setMetadataError = (error: string | null) => {
    setDataSource(prev => ({ ...prev, metadataError: error }));
  };

  const setJoinedTables = (tables: string[]) => {
    setDataSource(prev => ({ ...prev, joinedTables: tables }));
  };

  const setSuggestedJoinableTables = (tables: string[]) => {
    setDataSource(prev => ({ ...prev, suggestedJoinableTables: tables }));
  };

  const setUnionTables = (tables: string[]) => {
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

  const toggleUnionTable = (tableName: string) => {
    setDataSource(prev => {
      const isCurrentlyUnioned = prev.unionTables.includes(tableName);
      const newUnionTables = isCurrentlyUnioned
        ? prev.unionTables.filter(t => t !== tableName)
        : [...prev.unionTables, tableName];
      return { ...prev, unionTables: newUnionTables };
    });
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
        setIsLoadingMetadata,
        setMetadataError,
        setJoinedTables,
        setSuggestedJoinableTables,
        setUnionTables,
        setSuggestedUnionableTables,
        setVirtualTable,
        toggleJoinedTable,
        toggleUnionTable,
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
