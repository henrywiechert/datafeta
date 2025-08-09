import { ConnectionDetails, DatabaseListResponse, TableListResponse, ColumnListResponse, QueryDescription, QueryResult } from './types';

const API_BASE_URL = 'http://localhost:8000/api/v1/data'; // Ensure your backend runs on port 8000

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

        const formData = new FormData();

        // Append the connection details as a PLAIN JSON STRING
        // (Instead of a Blob)
        formData.append('connection_details_json', JSON.stringify(details));

        // Append the file if provided (FastAPI expects it under the 'uploaded_file' key)
        if (details.type === 'csv' && file) {
            formData.append('uploaded_file', file, file.name);
        } else if (details.type === 'csv' && !file) {
             throw new Error('CSV file must be provided for connection type csv.');
        }

        const response = await fetchWithErrorHandling(`${API_BASE_URL}/connect`, {
            method: 'POST',
            // 'Content-Type' header is set automatically by the browser when using FormData
            body: formData,
        }, requestSignal);

        return response.json();
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

        const url = new URL(`${API_BASE_URL}/tables`);
        if (database) {
            url.searchParams.append('database', database);
        }
        
        const response = await fetchWithErrorHandling(url.toString(), {}, requestSignal);
        return response.json();
    },

    async listColumns(table: string, database?: string, signal?: AbortSignal): Promise<ColumnListResponse> {
        const abortController = signal ? null : createAbortController();
        const requestSignal = signal || abortController?.signal;

        const url = new URL(`${API_BASE_URL}/columns`);
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
    }
}; 