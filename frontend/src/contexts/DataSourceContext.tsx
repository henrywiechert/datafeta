import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Database, Table, Field } from '../types';

// Define the state interface for data source (shared across all sheets)
interface DataSourceState {
  selectedDatabase: string;
  selectedTable: string;
  availableFields: Field[];
  databases: Database[];
  tables: Table[];
  isLoadingMetadata: boolean;
  metadataError: string | null;
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
  });

  const setSelectedDatabase = (database: string) => {
    setDataSource(prev => ({ ...prev, selectedDatabase: database }));
  };

  const setSelectedTable = (table: string) => {
    setDataSource(prev => ({ ...prev, selectedTable: table }));
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
