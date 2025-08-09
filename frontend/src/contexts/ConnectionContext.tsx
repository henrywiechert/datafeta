import React, { createContext, useState, useContext, ReactNode, useCallback } from 'react';
import { ConnectionDetails } from '../types'; // Assuming types are defined in ../types
import { apiService } from '../apiService';

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

  const connect = useCallback(async (details: ConnectionDetails, file?: File) => {
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
  }, []);

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
      // Clear message/error related to disconnect action itself after clearing state?
      // setMessage(null); // Optional: Clear message after success/failure handled
      // setError(null); // Optional: Clear error
      setIsLoading(false);
    }
  }, []);

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