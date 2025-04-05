import { ConnectionDetails, DatabaseListResponse, TableListResponse, ColumnListResponse } from './types';

const API_BASE_URL = 'http://localhost:8000/api/v1/data'; // Ensure your backend runs on port 8000

export const apiService = {
    async connect(details: ConnectionDetails, file?: File): Promise<{ message: string, file_path?: string }> {
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

        const response = await fetch(`${API_BASE_URL}/connect`, {
            method: 'POST',
            // 'Content-Type' header is set automatically by the browser when using FormData
            // headers: {
            //     'Content-Type': 'multipart/form-data', // DON'T set this manually
            // },
            body: formData,
        });

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
        return response.json();
    },

    async disconnect(): Promise<{ message: string }> {
        const response = await fetch(`${API_BASE_URL}/disconnect`, {
            method: 'POST',
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Failed to disconnect');
        }
        return response.json();
    },

    async listDatabases(): Promise<DatabaseListResponse> {
        const response = await fetch(`${API_BASE_URL}/databases`);
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Failed to list databases');
        }
        return response.json();
    },

    async listTables(database?: string): Promise<TableListResponse> {
        const url = new URL(`${API_BASE_URL}/tables`);
        if (database) {
            url.searchParams.append('database', database);
        }
        const response = await fetch(url.toString());
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Failed to list tables');
        }
        return response.json();
    },

    async listColumns(table: string, database?: string): Promise<ColumnListResponse> {
        const url = new URL(`${API_BASE_URL}/columns`);
        url.searchParams.append('table', table);
        if (database) {
            url.searchParams.append('database', database);
        }
        const response = await fetch(url.toString());
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Failed to list columns');
        }
        return response.json();
    },
}; 