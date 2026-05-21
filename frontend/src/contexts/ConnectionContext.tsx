// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { createContext, useState, useContext, ReactNode, useCallback } from 'react';
import { ConnectionDetails } from '../types'; // Assuming types are defined in ../types
import { apiService } from '../apiService';
import { useDataSource } from './DataSourceContext';
import { useVisualizationContext } from './VisualizationContext';

interface ConnectionState {
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  message: string | null;
  connectionDetails: ConnectionDetails | null; // Store details of the active connection
  connect: (details: ConnectionDetails, files?: File[]) => Promise<void>;
  connectDemoDataset: (datasetId: string) => Promise<{ database: string; table: string }>;
  disconnect: () => Promise<void>;
}

const ConnectionContext = createContext<ConnectionState | undefined>(undefined);

interface ConnectionProviderProps {
  children: ReactNode;
}

export const ConnectionProvider: React.FC<ConnectionProviderProps> = ({ children }) => {
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [connectionDetails, setConnectionDetails] = useState<ConnectionDetails | null>(null);
  const { resetMetadata, setSelectedDatabase, setSelectedTable } = useDataSource();
  const { dispatch } = useVisualizationContext();

  const connect = useCallback(async (details: ConnectionDetails, files?: File[]) => {
    // If already connected, disconnect first to clean up resources
    if (isConnected) {
      try {
        await apiService.disconnect();
      } catch (err) {
        console.warn('Failed to disconnect from previous connection:', err);
        // Continue anyway - attempt new connection
      }
    }

    setIsLoading(true);
    setError(null);
    setMessage(null);
    setConnectionDetails(null); // Clear previous details
    setIsConnected(false);

    try {
      let response;
      
      if (details.type === 'hive_parquet') {
        // Use Hive Parquet-specific connection endpoint
        if (!details.hive_file_structure || details.hive_file_structure.length === 0) {
          throw new Error('hive_file_structure is required for Hive Parquet connection');
        }
        response = await apiService.connectHive(details.hive_file_structure);
        setMessage(`${response.message} (Partition column: ${response.partition_column})`);
      } else {
        response = await apiService.connect(details, files);
        // Build message - handle both single file_path (legacy) and file_paths (multi-file)
        let pathInfo = '';
        if (response.file_paths && response.file_paths.length > 0) {
          pathInfo = ` (${response.file_paths.length} file(s) uploaded)`;
        }
        setMessage(`${response.message}${pathInfo}`);
      }
      
      setConnectionDetails(details); // Store successful connection details
      setIsConnected(true);
      setError(null);
      // Reset metadata in DataSourceContext to trigger refresh
      // This clears databases, tables, availableFields, selectedDatabase, selectedTable
      resetMetadata();
      // Clear query results to free memory (still in VisualizationContext)
      dispatch({ type: 'RESET_QUERY_STATE' });
      // Don't navigate here
    } catch (err: any) {
        let errorMessage = 'Connection failed';
        try {
            const errorObj = JSON.parse(err.message);
            if (errorObj && errorObj.detail) {
                if (Array.isArray(errorObj.detail)) {
                    // Handle Pydantic's validation error format
                    errorMessage = errorObj.detail
                        .map((e: any) => `${e.loc.join(' -> ')}: ${e.msg}`)
                        .join('; ');
                } else if (typeof errorObj.detail === 'object') {
                    errorMessage = JSON.stringify(errorObj.detail);
                } else {
                    errorMessage = errorObj.detail;
                }
            } else {
                errorMessage = err.message;
            }
        } catch (parseError) {
            errorMessage = err.message || errorMessage;
        }
        setError(errorMessage);
        setIsConnected(false);
        setConnectionDetails(null);
        throw err; // Re-throw error so calling component knows it failed
    } finally {
      setIsLoading(false);
    }
  }, [dispatch, resetMetadata, isConnected]);

  const connectDemoDataset = useCallback(async (datasetId: string) => {
    if (isConnected) {
      try {
        await apiService.disconnect();
      } catch (err) {
        console.warn('Failed to disconnect from previous connection:', err);
      }
    }

    setIsLoading(true);
    setError(null);
    setMessage(null);
    setConnectionDetails(null);
    setIsConnected(false);

    try {
      const response = await apiService.connectDemoDataset(datasetId);
      const details: ConnectionDetails = {
        type: 'clickhouse',
        database: response.dataset.database,
      };
      setConnectionDetails(details);
      setIsConnected(true);
      setMessage(response.message);
      resetMetadata();
      setSelectedDatabase(response.dataset.database);
      setSelectedTable(response.dataset.table);
      dispatch({ type: 'RESET_QUERY_STATE' });
      return { database: response.dataset.database, table: response.dataset.table };
    } catch (err: any) {
      setError(err.message || 'Demo dataset connection failed');
      setIsConnected(false);
      setConnectionDetails(null);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [dispatch, isConnected, resetMetadata, setSelectedDatabase, setSelectedTable]);

  const disconnect = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setMessage(null);
    try {
      const response = await apiService.disconnect();
      setMessage(response.message);
    } catch (err: any) {
      setError(err.message || 'Disconnection failed');
      // Still proceed to clear state even if backend disconnect fails
    } finally {
      setIsConnected(false);
      setConnectionDetails(null);
      
      // Reset metadata in DataSourceContext
      // This clears databases, tables, availableFields, selectedDatabase, selectedTable
      resetMetadata();
      // Clear query results to free memory (still in VisualizationContext)
      dispatch({ type: 'RESET_QUERY_STATE' });
      
      setIsLoading(false);
    }
  }, [dispatch, resetMetadata]);

  const value = {
    isConnected,
    isLoading,
    error,
    message,
    connectionDetails,
    connect,
    connectDemoDataset,
    disconnect,
  };

  return <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>;
};

export const useConnection = (): ConnectionState => {
  const context = useContext(ConnectionContext);
  if (context === undefined) {
    throw new Error('useConnection must be used within a ConnectionProvider');
  }
  return context;
}; 