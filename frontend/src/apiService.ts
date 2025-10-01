import { ConnectionDetails, DatabaseListResponse, TableListResponse, ColumnListResponse, QueryDescription, QueryResult } from './types';

// Derive API base: Prefer explicit env var (REACT_APP_API_BASE, e.g. "/api/v1"), else fall back to
// same-origin relative path (when frontend served by backend) and append /data segment used by router.
// This avoids hard-coded localhost:8000 which breaks when containerized behind another host/port.
const apiBasePrefix = (process.env.REACT_APP_API_BASE || '/api/v1').replace(/\/$/, '');
const API_BASE_URL = `${apiBasePrefix}/data`;

// Global abort controller for managing cancellable requests
let currentAbortController: AbortController | null = null;

// Helper function to create and manage abort controllers
function createAbortController(): AbortController {
  // Cancel any existing request
  if (currentAbortController) {
    currentAbortController.abort();
  }
  
  // Create new controller
  currentAbortController = new AbortController();
  return currentAbortController;
}

// Helper function to handle fetch with improved error handling
async function fetchWithErrorHandling(
  url: string, 
  options: RequestInit = {}, 
  signal?: AbortSignal
): Promise<Response> {
  const fetchOptions: RequestInit = {
    ...options,
    signal: signal || (options.signal),
    credentials: 'include', // Include cookies in all requests
  };

  try {
    const response = await fetch(url, fetchOptions);
    
    if (!response.ok) {
      // Better error handling: Check content type before parsing JSON
      let errorMessage = `Request failed with status ${response.status}`;
      try {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json();
          // Use the detail field if available, otherwise stringify the whole object
          errorMessage = errorData.detail || JSON.stringify(errorData);
        } else {
          // If not JSON, try to get the raw text response
          const errorText = await response.text();
          errorMessage = errorText || errorMessage; // Use text if available
        }
      } catch (parseError) {
        console.error("Failed to parse error response:", parseError);
        // Fallback if parsing fails or text() fails
        errorMessage = `Request failed with status ${response.status} (${response.statusText})`;
      }
      throw new Error(errorMessage);
    }
    
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request was cancelled');
    }
    throw error;
  }
}

export const apiService = {
    async connect(details: ConnectionDetails, file?: File, signal?: AbortSignal): Promise<{ message: string, file_path?: string }> {
        const abortController = signal ? null : createAbortController();
        const requestSignal = signal || abortController?.signal;

        if (details.type === 'csv') {
            const formData = new FormData();
            formData.append('connection_details_json', JSON.stringify(details));
            if (file) {
                formData.append('uploaded_file', file, file.name);
            } else {
                throw new Error('CSV file must be provided for connection type csv.');
            }
            const response = await fetchWithErrorHandling(`${API_BASE_URL}/connect`, {
                method: 'POST',
                body: formData,
            }, requestSignal);
            return response.json();
        } else {
            const response = await fetchWithErrorHandling(`${API_BASE_URL}/connect/json`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(details),
            }, requestSignal);
            return response.json();
        }
    },

    async disconnect(signal?: AbortSignal): Promise<{ message: string }> {
        const abortController = signal ? null : createAbortController();
        const requestSignal = signal || abortController?.signal;

        const response = await fetchWithErrorHandling(`${API_BASE_URL}/disconnect`, {
            method: 'POST',
        }, requestSignal);

        return response.json();
    },

    async listDatabases(signal?: AbortSignal): Promise<DatabaseListResponse> {
        const abortController = signal ? null : createAbortController();
        const requestSignal = signal || abortController?.signal;

        const response = await fetchWithErrorHandling(`${API_BASE_URL}/databases`, {}, requestSignal);
        return response.json();
    },

  async listTables(database?: string, signal?: AbortSignal): Promise<TableListResponse> {
        const abortController = signal ? null : createAbortController();
        const requestSignal = signal || abortController?.signal;
    // Support relative API_BASE_URL by using window.location.origin as base when needed
    const base = API_BASE_URL.startsWith('http') ? API_BASE_URL : `${window.location.origin}${API_BASE_URL}`;
    const url = new URL(`${base}/tables`);
        if (database) {
            url.searchParams.append('database', database);
        }
        
        const response = await fetchWithErrorHandling(url.toString(), {}, requestSignal);
        return response.json();
    },

    async listColumns(table: string, database?: string, signal?: AbortSignal): Promise<ColumnListResponse> {
        const abortController = signal ? null : createAbortController();
        const requestSignal = signal || abortController?.signal;
    const base = API_BASE_URL.startsWith('http') ? API_BASE_URL : `${window.location.origin}${API_BASE_URL}`;
    const url = new URL(`${base}/columns`);
        url.searchParams.append('table', table);
        if (database) {
            url.searchParams.append('database', database);
        }
        
        const response = await fetchWithErrorHandling(url.toString(), {}, requestSignal);
        return response.json();
    },

    async executeQuery(queryDesc: QueryDescription, signal?: AbortSignal): Promise<QueryResult> {
        const abortController = signal ? null : createAbortController();
        const requestSignal = signal || abortController?.signal;

        const response = await fetchWithErrorHandling(`${API_BASE_URL}/query`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(queryDesc),
        }, requestSignal);

        const result: QueryResult = await response.json();
        
        // Check for backend errors returned within the QueryResult
        if (result.error) {
            throw new Error(result.error);
        }
        
        return result;
    },

    // New method to cancel all ongoing requests
    cancelAllRequests(): void {
        if (currentAbortController) {
            currentAbortController.abort();
            currentAbortController = null;
        }
    },

    // New method to get current abort controller (for external use)
    getCurrentAbortController(): AbortController | null {
        return currentAbortController;
    },

    // New method to create a new abort controller (for external use)
    createNewAbortController(): AbortController {
        return createAbortController();
    },

    // Fetch distinct values for a discrete field (for filter configuration)
    async getDistinctValues(
        field: string, 
        table: string, 
        database?: string,
        signal?: AbortSignal
    ): Promise<any[]> {
        const abortController = signal ? null : createAbortController();
        const requestSignal = signal || abortController?.signal;

        // Build a query to get distinct values
        const queryDesc = {
            target_table: table,
            target_database: database,
            dimensions: [{ field, flavour: 'discrete' as const }],
            measures: [],
        };

        const response = await fetchWithErrorHandling(`${API_BASE_URL}/query`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(queryDesc),
        }, requestSignal);

        const result: QueryResult = await response.json();
        
        if (result.error) {
            throw new Error(result.error);
        }

        // Extract the values from the result
        return result.rows.map(row => row[field]);
    },

    // Fetch min/max range for a continuous field (for filter configuration)
    async getFieldRange(
        field: string, 
        table: string, 
        database?: string,
        signal?: AbortSignal
    ): Promise<{ min: number; max: number }> {
        const abortController = signal ? null : createAbortController();
        const requestSignal = signal || abortController?.signal;

        // Build a query to get min and max values
        const queryDesc = {
            target_table: table,
            target_database: database,
            dimensions: [],
            measures: [
                { field, aggregation: 'min' as const, alias: 'min_value' },
                { field, aggregation: 'max' as const, alias: 'max_value' },
            ],
        };

        const response = await fetchWithErrorHandling(`${API_BASE_URL}/query`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(queryDesc),
        }, requestSignal);

        const result: QueryResult = await response.json();
        
        if (result.error) {
            throw new Error(result.error);
        }

        // Extract min and max from the result
        if (result.rows.length > 0) {
            return {
                min: result.rows[0].min_value,
                max: result.rows[0].max_value,
            };
        }

        throw new Error('No data available for range calculation');
    },

    // Fetch min/max date range for a datetime field (for filter configuration)
    async getDateTimeRange(
        field: string, 
        table: string, 
        database?: string,
        signal?: AbortSignal
    ): Promise<{ min: string; max: string }> {
        const abortController = signal ? null : createAbortController();
        const requestSignal = signal || abortController?.signal;

        // Build a query to get min and max datetime values
        const queryDesc = {
            target_table: table,
            target_database: database,
            dimensions: [],
            measures: [
                { field, aggregation: 'min' as const, alias: 'min_date' },
                { field, aggregation: 'max' as const, alias: 'max_date' },
            ],
        };

        const response = await fetchWithErrorHandling(`${API_BASE_URL}/query`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(queryDesc),
        }, requestSignal);

        const result: QueryResult = await response.json();
        
        if (result.error) {
            throw new Error(result.error);
        }

        // Extract min and max from the result
        if (result.rows.length > 0) {
            return {
                min: result.rows[0].min_date,
                max: result.rows[0].max_date,
            };
        }

        throw new Error('No data available for date range calculation');
    }
}; 