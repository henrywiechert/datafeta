import React, { createContext, useState, useContext, ReactNode, useCallback } from 'react';
import { ConnectionDetails } from '../types'; // Assuming types are defined in ../types
import { apiService } from '../apiService';
import { useVisualizationContext } from './VisualizationContext';

interface ConnectionState {
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  message: string | null;
  connectionDetails: ConnectionDetails | null; // Store details of the active connection
  connect: (details: ConnectionDetails, file?: File) => Promise<void>;
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
  const { dispatch } = useVisualizationContext();

  const connect = useCallback(async (details: ConnectionDetails, file?: File) => {
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
      const response = await apiService.connect(details, file);
      setMessage(`${response.message}${response.file_path ? ` (Server Path: ${response.file_path})` : ''}`);
      setConnectionDetails(details); // Store successful connection details
      setIsConnected(true);
      setError(null);
      // Reset metadata to trigger refresh without touching axis fields
      dispatch({ type: 'SET_DATABASES', payload: [] });
      dispatch({ type: 'SET_TABLES', payload: [] });
      dispatch({ type: 'SET_AVAILABLE_FIELDS', payload: [] });
      dispatch({ type: 'SET_SELECTED_DATABASE', payload: '' });
      dispatch({ type: 'SET_SELECTED_TABLE', payload: '' });
      // Clear query results to free memory
      dispatch({ type: 'SET_QUERY_RESULT', payload: null });
      dispatch({ type: 'SET_QUERY_ERROR', payload: null });
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
  }, [dispatch]);

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
      
      // Clear all visualization state to free memory - don't use RESET_STATE as it clears axis fields too
      // Just clear metadata and query results
      dispatch({ type: 'SET_DATABASES', payload: [] });
      dispatch({ type: 'SET_TABLES', payload: [] });
      dispatch({ type: 'SET_AVAILABLE_FIELDS', payload: [] });
      dispatch({ type: 'SET_SELECTED_DATABASE', payload: '' });
      dispatch({ type: 'SET_SELECTED_TABLE', payload: '' });
      dispatch({ type: 'SET_QUERY_RESULT', payload: null });
      dispatch({ type: 'SET_QUERY_ERROR', payload: null });
      
      setIsLoading(false);
    }
  }, [dispatch]);

  const value = {
    isConnected,
    isLoading,
    error,
    message,
    connectionDetails,
    connect,
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