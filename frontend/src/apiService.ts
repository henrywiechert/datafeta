import { tableFromIPC, Table as ArrowTable } from 'apache-arrow';
import { 
    ConnectionDetails, 
    DatabaseListResponse, 
    TableListResponse, 
    ColumnListResponse, 
    QueryDescription, 
    QueryResult,
    TableRelationshipsResponse,
    SuggestedJoinsResponse,
    SuggestedUnionsResponse,
    KaggleSearchResponse,
    KaggleFilesResponse,
    MergedColumnsResponse,
    VirtualColumnDefinition,
    VirtualTableDefinition
} from './types';
import { arrowTableToRows } from './services/arrowResultAdapter';
import { logSqlQuery } from './devtools/queryLog';
import { getTabId } from './utils/tabSession';

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
  // Merge existing headers with the tab ID header
  const existingHeaders = options.headers instanceof Headers 
    ? Object.fromEntries(options.headers.entries())
    : (options.headers || {});
  
  const fetchOptions: RequestInit = {
    ...options,
    headers: {
      ...existingHeaders,
      'X-Tab-Id': getTabId(), // Include tab ID for per-tab session isolation
    },
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
        const response = await fetchWithErrorHandling(`${API_BASE_URL}/databases`, {}, signal);
        return response.json();
    },

  async listTables(database?: string, signal?: AbortSignal): Promise<TableListResponse> {
        
    // Support relative API_BASE_URL by using window.location.origin as base when needed
    const base = API_BASE_URL.startsWith('http') ? API_BASE_URL : `${window.location.origin}${API_BASE_URL}`;
    const url = new URL(`${base}/tables`);
        if (database) {
            url.searchParams.append('database', database);
        }
        if (process.env.NODE_ENV !== 'production') {
            console.debug('[apiService] listTables', { database, url: url.toString() });
        }
        
        const response = await fetchWithErrorHandling(url.toString(), {}, signal);
        return response.json();
    },

    async listColumns(table: string, database?: string, signal?: AbortSignal): Promise<ColumnListResponse> {
        
    const base = API_BASE_URL.startsWith('http') ? API_BASE_URL : `${window.location.origin}${API_BASE_URL}`;
    const url = new URL(`${base}/columns`);
        url.searchParams.append('table', table);
        if (database) {
            url.searchParams.append('database', database);
        }
        
        const response = await fetchWithErrorHandling(url.toString(), {}, signal);
        return response.json();
    },

    // --- Multi-Table Support Methods --- //

    async getTableRelationships(database: string, signal?: AbortSignal): Promise<TableRelationshipsResponse> {
        const base = API_BASE_URL.startsWith('http') ? API_BASE_URL : `${window.location.origin}${API_BASE_URL}`;
        const url = new URL(`${base}/table-relationships`);
        url.searchParams.append('database', database);
        
        const response = await fetchWithErrorHandling(url.toString(), {}, signal);
        return response.json();
    },

    async getSuggestedJoins(database: string, primaryTable: string, joinedTables?: string[], signal?: AbortSignal): Promise<SuggestedJoinsResponse> {
        const base = API_BASE_URL.startsWith('http') ? API_BASE_URL : `${window.location.origin}${API_BASE_URL}`;
        const url = new URL(`${base}/suggested-joins`);
        url.searchParams.append('database', database);
        url.searchParams.append('primary_table', primaryTable);
        
        // Add joined_tables parameter if provided (for transitive relationships)
        if (joinedTables && joinedTables.length > 0) {
            url.searchParams.append('joined_tables', joinedTables.join(','));
        }
        
        const response = await fetchWithErrorHandling(url.toString(), {}, signal);
        return response.json();
    },

    async getSuggestedUnions(database: string, primaryTable: string, signal?: AbortSignal): Promise<SuggestedUnionsResponse> {
        const base = API_BASE_URL.startsWith('http') ? API_BASE_URL : `${window.location.origin}${API_BASE_URL}`;
        const url = new URL(`${base}/suggested-unions`);
        url.searchParams.append('database', database);
        url.searchParams.append('primary_table', primaryTable);
        
        const response = await fetchWithErrorHandling(url.toString(), {}, signal);
        return response.json();
    },

    async getMergedColumns(
        database: string,
        primaryTable: string,
        joinedTables?: string[],
        unionTables?: Array<{database: string, table_name: string}> | string[],
        autoDetect: boolean = true,
        signal?: AbortSignal
    ): Promise<MergedColumnsResponse> {
        const response = await fetchWithErrorHandling(`${API_BASE_URL}/merged-columns?database=${database}&primary_table=${primaryTable}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                joined_tables: joinedTables || null,
                union_tables: unionTables || null,  // Can be new format or legacy format
                auto_detect: autoDetect
            }),
        }, signal);

        return response.json();
    },

    // --- End Multi-Table Support --- //

    async executeQuery(queryDesc: QueryDescription, signal?: AbortSignal): Promise<QueryResult> {
        const abortController = signal ? null : createAbortController();
        const requestSignal = signal || abortController?.signal;

        const start = performance.now();
        const response = await fetchWithErrorHandling(`${API_BASE_URL}/query`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(queryDesc),
        }, requestSignal);

        const result: QueryResult = await response.json();
        const durationMs = Math.round(performance.now() - start);
        
        // Check for backend errors returned within the QueryResult
        if (result.error) {
            throw new Error(result.error);
        }

        if (result.query_sql) {
            logSqlQuery({
                origin: 'remote',
                sql: result.query_sql,
                label: 'POST /data/query (JSON)',
                durationMs,
                meta: {
                    transport: 'json',
                    target_table: (queryDesc as any).target_table,
                    target_database: (queryDesc as any).target_database,
                    row_count: (result as any).row_count,
                }
            });
        }
        
        return result;
    },

    /**
     * Execute a query and return raw Arrow table (for DuckDB WASM caching).
     * 
     * Returns the Arrow table directly without converting to rows.
     * More efficient for caching scenarios where we want to pass data to DuckDB WASM.
     * 
     * @param queryDesc - Query description object
     * @param signal - Optional AbortSignal for cancellation
     * @returns Object containing Arrow table and metadata
     */
    async executeQueryArrowRaw(queryDesc: QueryDescription, signal?: AbortSignal): Promise<{
        arrowTable: ArrowTable;
        arrowBuffer: ArrayBuffer;
        rowCount: number;
        columnCount: number;
        columns: { name: string; type: string }[];
        querySql?: string;
    }> {
        const abortController = signal ? null : createAbortController();
        const requestSignal = signal || abortController?.signal;

        const start = performance.now();
        const fetchOptions: RequestInit = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Tab-Id': getTabId(), // Include tab ID for per-tab session isolation
            },
            body: JSON.stringify(queryDesc),
            signal: requestSignal,
            credentials: 'include',
        };

        try {
            const response = await fetch(`${API_BASE_URL}/query-arrow`, fetchOptions);
            
            if (!response.ok) {
                let errorMessage = `Request failed with status ${response.status}`;
                try {
                    const contentType = response.headers.get('content-type');
                    if (contentType && contentType.includes('application/json')) {
                        const errorData = await response.json();
                        errorMessage = errorData.detail || JSON.stringify(errorData);
                    } else {
                        const errorText = await response.text();
                        errorMessage = errorText || errorMessage;
                    }
                } catch (parseError) {
                    errorMessage = `Request failed with status ${response.status} (${response.statusText})`;
                }
                throw new Error(errorMessage);
            }

            const rowCount = parseInt(response.headers.get('X-Arrow-Row-Count') || '0', 10);
            const columnCount = parseInt(response.headers.get('X-Arrow-Column-Count') || '0', 10);
            
            // Decode SQL from base64 header
            const sqlBase64 = response.headers.get('X-Query-Sql-Base64');
            const querySql = sqlBase64 ? atob(sqlBase64) : undefined;
            const durationMs = Math.round(performance.now() - start);

            const arrayBuffer = await response.arrayBuffer();
            const arrowTable: ArrowTable = tableFromIPC(arrayBuffer);

            const columns = arrowTable.schema.fields.map(field => ({
                name: field.name,
                type: field.type.toString(),
            }));

            console.log(`📊 Arrow raw fetch: ${arrayBuffer.byteLength} bytes → ${arrowTable.numRows} rows × ${columnCount} columns`);

            if (querySql) {
                logSqlQuery({
                    origin: 'remote',
                    sql: querySql,
                    label: 'POST /data/query-arrow (Arrow raw)',
                    durationMs,
                    meta: {
                        transport: 'arrow',
                        raw: true,
                        target_table: (queryDesc as any).target_table,
                        target_database: (queryDesc as any).target_database,
                        arrow_rows: rowCount || arrowTable.numRows,
                        arrow_cols: columnCount || columns.length,
                        bytes: arrayBuffer.byteLength,
                    }
                });
            }

            return {
                arrowTable,
                arrowBuffer: arrayBuffer,
                rowCount: rowCount || arrowTable.numRows,
                columnCount: columnCount || columns.length,
                columns,
                querySql,
            };
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                throw new Error('Request was cancelled');
            }
            throw error;
        }
    },

    /**
     * Execute a query and return results using Apache Arrow IPC transport.
     * 
     * This is more efficient for large datasets compared to JSON:
     * - ~60-70% smaller payload (binary vs text)
     * - Faster parsing (binary vs JSON.parse)
     * - Type fidelity preserved (int64, float64, etc.)
     * 
     * @param queryDesc - Query description object
     * @param signal - Optional AbortSignal for cancellation
     * @returns QueryResult with data converted from Arrow format
     */
    async executeQueryArrow(queryDesc: QueryDescription, signal?: AbortSignal): Promise<QueryResult> {
        const abortController = signal ? null : createAbortController();
        const requestSignal = signal || abortController?.signal;

        const start = performance.now();
        const fetchOptions: RequestInit = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Tab-Id': getTabId(), // Include tab ID for per-tab session isolation
            },
            body: JSON.stringify(queryDesc),
            signal: requestSignal,
            credentials: 'include',
        };

        try {
            const response = await fetch(`${API_BASE_URL}/query-arrow`, fetchOptions);
            
            if (!response.ok) {
                // Handle error responses (still JSON)
                let errorMessage = `Request failed with status ${response.status}`;
                try {
                    const contentType = response.headers.get('content-type');
                    if (contentType && contentType.includes('application/json')) {
                        const errorData = await response.json();
                        errorMessage = errorData.detail || JSON.stringify(errorData);
                    } else {
                        const errorText = await response.text();
                        errorMessage = errorText || errorMessage;
                    }
                } catch (parseError) {
                    errorMessage = `Request failed with status ${response.status} (${response.statusText})`;
                }
                throw new Error(errorMessage);
            }

            // Get metadata from response headers
            const rowCount = parseInt(response.headers.get('X-Arrow-Row-Count') || '0', 10);
            const columnCount = parseInt(response.headers.get('X-Arrow-Column-Count') || '0', 10);
            
            // Decode SQL from base64 header
            const sqlBase64 = response.headers.get('X-Query-Sql-Base64');
            const querySql = sqlBase64 ? atob(sqlBase64) : undefined;
            const durationMs = Math.round(performance.now() - start);

            // Parse Arrow IPC stream
            const arrayBuffer = await response.arrayBuffer();
            const arrowTable: ArrowTable = tableFromIPC(arrayBuffer);

            // Convert Arrow table to QueryResult format
            const columns = arrowTable.schema.fields.map(field => ({
                name: field.name,
                type: field.type.toString(),
            }));

            // Convert Arrow rows to array of objects
            // This is where we bridge Arrow's columnar format to row-oriented for Observable Plot
            const rows = arrowTableToRows(arrowTable);
            const numRows = arrowTable.numRows;

            console.log(`📊 Arrow transport: ${arrayBuffer.byteLength} bytes → ${numRows} rows × ${columnCount} columns`);

            if (querySql) {
                logSqlQuery({
                    origin: 'remote',
                    sql: querySql,
                    label: 'POST /data/query-arrow (Arrow rows)',
                    durationMs,
                    meta: {
                        transport: 'arrow',
                        raw: false,
                        target_table: (queryDesc as any).target_table,
                        target_database: (queryDesc as any).target_database,
                        arrow_rows: rowCount || numRows,
                        arrow_cols: columnCount || columns.length,
                        bytes: arrayBuffer.byteLength,
                    }
                });
            }

            return {
                columns,
                rows,
                row_count: rowCount || numRows,
                query_sql: querySql,
                result_dimensions: {
                    rows: rowCount || numRows,
                    columns: columnCount || columns.length,
                    size_display: `${(rowCount || numRows).toLocaleString()} × ${columnCount || columns.length}`,
                },
            };
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                throw new Error('Request was cancelled');
            }
            throw error;
        }
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
        dateTimePart?: string,
        dateTimeMode?: string,
        regexPattern?: string,
        limit?: number,
        useRandomSample?: boolean,
        unionTables?: string[],
        virtualColumns?: VirtualColumnDefinition[],
        virtualTable?: VirtualTableDefinition,
        signal?: AbortSignal
    ): Promise<any[]> {
        const abortController = signal ? null : createAbortController();
        const requestSignal = signal || abortController?.signal;

        // Build a query to get distinct values
        const dimension: any = { 
            field, 
            flavour: 'discrete' as const 
        };
        
        // Add DateTime part information if provided
        if (dateTimePart && dateTimeMode) {
            dimension.date_part = dateTimePart;
            dimension.date_mode = dateTimeMode;
        }
        
        const queryDesc: any = {
            target_table: table,
            target_database: database,
            dimensions: [dimension],
            measures: [],
            fetch_filter_values: true,  // Explicit flag for filter value queries
        };
        
        // Add virtual columns if provided
        if (virtualColumns && virtualColumns.length > 0) {
            queryDesc.virtual_columns = virtualColumns;
        }
        
        // Add virtual table definition (for both UNION and JOIN queries)
        if (virtualTable) {
            queryDesc.virtual_table = virtualTable;
        } else if (unionTables && unionTables.length > 0) {
            // Legacy: build union virtual table if not provided
            queryDesc.virtual_table = {
                primary_table: table,
                mode: 'union',
                joined_tables: [],
                union_tables: unionTables.map((t: string) => ({ table_name: t })),
                name: `${table}_union`
            };
        }
        
        // Add regex filter if provided
        if (regexPattern) {
            queryDesc.distinct_value_regex = regexPattern;
        }
        
        // Add limit if provided
        if (limit !== undefined) {
            queryDesc.limit = limit;
        }
        
        // Add random sampling flag if needed
        if (useRandomSample) {
            queryDesc.use_random_sample = true;
        }

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
        // For DateTime parts, use the aliased column name
        const columnName = dateTimePart && dateTimeMode 
            ? `${field}_${dateTimePart}_${dateTimeMode}`
            : field;
        
        return result.rows.map(row => row[columnName]);
    },
    
    // Get count of distinct values for a field (used before fetching all values)
    async getDistinctValuesCount(
        field: string,
        table: string,
        database?: string,
        regexPattern?: string,
        dateTimePart?: string,
        dateTimeMode?: string,
        unionTables?: string[],
        virtualColumns?: VirtualColumnDefinition[],
        virtualTable?: VirtualTableDefinition,
        signal?: AbortSignal
    ): Promise<number> {
        const abortController = signal ? null : createAbortController();
        const requestSignal = signal || abortController?.signal;
        
        // Build request body
        const requestBody: any = {
            field,
            table,
        };
        
        if (database) {
            requestBody.database = database;
        }
        if (regexPattern) {
            requestBody.regexPattern = regexPattern;
        }
        if (dateTimePart) {
            requestBody.dateTimePart = dateTimePart;
        }
        if (dateTimeMode) {
            requestBody.dateTimeMode = dateTimeMode;
        }
        if (unionTables && unionTables.length > 0) {
            requestBody.unionTables = unionTables.join(',');
        }
        if (virtualColumns && virtualColumns.length > 0) {
            requestBody.virtualColumns = virtualColumns;
        }
        if (virtualTable) {
            requestBody.virtualTable = virtualTable;
        }
        
        const response = await fetchWithErrorHandling(
            `${API_BASE_URL}/distinct-count`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
            },
            requestSignal
        );
        
        const result = await response.json();
        return result.count || 0;
    },

    // Fetch min/max range for a continuous field (for filter configuration)
    async getFieldRange(
        field: string, 
        table: string, 
        database?: string,
        virtualColumns?: VirtualColumnDefinition[],
        unionTables?: string[],
        signal?: AbortSignal
    ): Promise<{ min: number; max: number }> {
        const abortController = signal ? null : createAbortController();
        const requestSignal = signal || abortController?.signal;

        // Build a query to get min and max values
        const queryDesc: any = {
            target_table: table,
            target_database: database,
            dimensions: [],
            measures: [
                { field, aggregation: 'min' as const, alias: 'min_value' },
                { field, aggregation: 'max' as const, alias: 'max_value' },
            ],
        };

        // Add virtual columns if provided
        if (virtualColumns && virtualColumns.length > 0) {
            queryDesc.virtual_columns = virtualColumns;
        }

        // Add virtual table definition for union queries
        if (unionTables && unionTables.length > 0) {
            queryDesc.virtual_table = {
                primary_table: table,
                mode: 'union',
                joined_tables: [],
                union_tables: unionTables.map((t: string) => ({ table_name: t })),
                name: `${table}_union`
            };
        }

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
        virtualColumns?: VirtualColumnDefinition[],
        unionTables?: string[],
        signal?: AbortSignal
    ): Promise<{ min: string; max: string }> {
        const abortController = signal ? null : createAbortController();
        const requestSignal = signal || abortController?.signal;

        // Build a query to get min and max datetime values
        const queryDesc: any = {
            target_table: table,
            target_database: database,
            dimensions: [],
            measures: [
                { field, aggregation: 'min' as const, alias: 'min_date' },
                { field, aggregation: 'max' as const, alias: 'max_date' },
            ],
        };

        // Add virtual columns if provided
        if (virtualColumns && virtualColumns.length > 0) {
            queryDesc.virtual_columns = virtualColumns;
        }

        // Add virtual table definition for union queries
        if (unionTables && unionTables.length > 0) {
            queryDesc.virtual_table = {
                primary_table: table,
                mode: 'union',
                joined_tables: [],
                union_tables: unionTables.map((t: string) => ({ table_name: t })),
                name: `${table}_union`
            };
        }

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
    },

    // --- Row Count Probing (for Query Decision Engine) --- //

    /**
     * Get the total row count for a table with optional filters applied.
     * 
     * Used by QueryDecisionEngine to determine query strategy:
     * - Small datasets: Fetch raw columns for local caching
     * - Large datasets: Fetch pre-aggregated data
     * 
     * @param table - Table name
     * @param database - Database name (required for ClickHouse)
     * @param filters - Optional filter configurations to apply
     * @param signal - Optional AbortSignal for cancellation
     * @returns Row count number
     */
    async getRowCount(
        table: string,
        database?: string,
        filters?: Record<string, any>,
        virtualColumns?: VirtualColumnDefinition[],
        virtualTable?: VirtualTableDefinition,
        signal?: AbortSignal
    ): Promise<number> {
        const abortController = signal ? null : createAbortController();
        const requestSignal = signal || abortController?.signal;

        const requestBody: any = {
            table,
        };

        if (database) {
            requestBody.database = database;
        }
        if (filters && Object.keys(filters).length > 0) {
            requestBody.filters = filters;
        }
        if (virtualColumns && virtualColumns.length > 0) {
            requestBody.virtualColumns = virtualColumns;
        }
        if (virtualTable) {
            requestBody.virtualTable = virtualTable;
        }

        const response = await fetchWithErrorHandling(
            `${API_BASE_URL}/row-count`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
            },
            requestSignal
        );

        const result = await response.json();
        return result.count || 0;
    },

    // --- Snapshot Storage Methods --- //

    /**
     * List all saved snapshots.
     * Returns metadata only (id, name, timestamps) for display in a gallery.
     */
    async listSnapshots(signal?: AbortSignal): Promise<Array<{
        id: string;
        name: string;
        createdAt: string;
        updatedAt: string;
    }>> {
        const response = await fetchWithErrorHandling(
            `${apiBasePrefix}/snapshots`,
            {},
            signal
        );
        return response.json();
    },

    /**
     * Save a new snapshot with the given name and configuration.
     */
    async saveSnapshot(
        name: string,
        configuration: any,
        signal?: AbortSignal
    ): Promise<{ id: string; name: string; createdAt: string; updatedAt: string }> {
        const response = await fetchWithErrorHandling(
            `${apiBasePrefix}/snapshots`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, configuration }),
            },
            signal
        );
        return response.json();
    },

    /**
     * Load a specific snapshot by ID.
     * Returns the full snapshot data including configuration.
     */
    async loadSnapshot(
        snapshotId: string,
        signal?: AbortSignal
    ): Promise<{
        id: string;
        name: string;
        createdAt: string;
        updatedAt: string;
        configuration: any;
    }> {
        const response = await fetchWithErrorHandling(
            `${apiBasePrefix}/snapshots/${encodeURIComponent(snapshotId)}`,
            {},
            signal
        );
        return response.json();
    },

    /**
     * Delete a snapshot by ID.
     */
    async deleteSnapshot(snapshotId: string, signal?: AbortSignal): Promise<void> {
        await fetchWithErrorHandling(
            `${apiBasePrefix}/snapshots/${encodeURIComponent(snapshotId)}`,
            { method: 'DELETE' },
            signal
        );
    },

    /**
     * Rename a snapshot.
     */
    async renameSnapshot(
        snapshotId: string,
        newName: string,
        signal?: AbortSignal
    ): Promise<{ id: string; name: string; createdAt: string; updatedAt: string }> {
        const response = await fetchWithErrorHandling(
            `${apiBasePrefix}/snapshots/${encodeURIComponent(snapshotId)}`,
            {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName }),
            },
            signal
        );
        return response.json();
    },

    /**
     * Overwrite a snapshot's configuration (keeping the same name).
     */
    async overwriteSnapshot(
        snapshotId: string,
        configuration: any,
        signal?: AbortSignal
    ): Promise<{ id: string; name: string; createdAt: string; updatedAt: string }> {
        const response = await fetchWithErrorHandling(
            `${apiBasePrefix}/snapshots/${encodeURIComponent(snapshotId)}`,
            {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ configuration }),
            },
            signal
        );
        return response.json();
    },

    // --- Kaggle-Specific Methods --- //

    async searchKaggleDatasets(username: string, apiKey: string, searchQuery: string): Promise<KaggleSearchResponse> {
        const response = await fetchWithErrorHandling(`${API_BASE_URL}/kaggle/search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username,
                api_key: apiKey,
                search_query: searchQuery
            })
        });
        return response.json();
    },

    async listKaggleFiles(username: string, apiKey: string, dataset: string): Promise<KaggleFilesResponse> {
        const response = await fetchWithErrorHandling(`${API_BASE_URL}/kaggle/files`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username,
                api_key: apiKey,
                dataset
            })
        });
        return response.json();
    }
}; 