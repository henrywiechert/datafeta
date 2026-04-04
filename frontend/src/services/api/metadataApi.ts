/**
 * Metadata API Service
 * 
 * Handles database metadata operations:
 * - List databases and tables
 * - List columns and their types
 * - Get field statistics (min/max/count)
 * - Get distinct values and ranges for filters
 * - Multi-table support (JOINs, UNIONs, relationships)
 */

import { 
  DatabaseListResponse,
  TableListResponse,
  ColumnListResponse,
  TableRelationshipsResponse,
  SuggestedJoinsResponse,
  SuggestedUnionsResponse,
  MergedColumnsResponse,
  VirtualColumnDefinition,
  VirtualTableDefinition,
  QueryResult,
  ForeignKeyRelationship
} from '../../types';
import { fetchWithErrorHandling, API_BASE_URL, createAbortController, buildUrl } from './apiClient';

export const metadataApi = {
  /**
   * List all databases
   */
  async listDatabases(signal?: AbortSignal): Promise<DatabaseListResponse> {
    const response = await fetchWithErrorHandling(`${API_BASE_URL}/databases`, {}, signal);
    return response.json();
  },

  /**
   * List tables in a database
   */
  async listTables(database?: string, signal?: AbortSignal): Promise<TableListResponse> {
    const url = buildUrl('/tables', database ? { database } : undefined);
    
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[metadataApi] listTables', { database, url });
    }
    
    const response = await fetchWithErrorHandling(url, {}, signal);
    return response.json();
  },

  /**
   * List columns in a table
   */
  async listColumns(
    table: string, 
    database?: string, 
    signal?: AbortSignal
  ): Promise<ColumnListResponse> {
    const url = buildUrl('/columns', { table, database });
    const response = await fetchWithErrorHandling(url, {}, signal);
    return response.json();
  },

  /**
   * Get table relationships (foreign keys)
   */
  async getTableRelationships(
    database: string, 
    signal?: AbortSignal
  ): Promise<TableRelationshipsResponse> {
    const url = buildUrl('/table-relationships', { database });
    const response = await fetchWithErrorHandling(url, {}, signal);
    return response.json();
  },

  /**
   * Get suggested joinable tables for a primary table
   */
  async getSuggestedJoins(
    database: string, 
    primaryTable: string, 
    joinedTables?: string[],
    customRelationships?: ForeignKeyRelationship[] | null,
    signal?: AbortSignal
  ): Promise<SuggestedJoinsResponse> {
    // Use POST when custom relationships are provided (non-null)
    if (customRelationships !== undefined && customRelationships !== null) {
      const url = buildUrl('/suggested-joins', { database });
      const response = await fetchWithErrorHandling(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primary_table: primaryTable,
          joined_tables: joinedTables && joinedTables.length > 0 ? joinedTables : null,
          custom_relationships: customRelationships,
        }),
      }, signal);
      return response.json();
    }

    // Fallback to GET for auto-detect
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

  /**
   * Get suggested union-compatible tables for a primary table
   */
  async getSuggestedUnions(
    database: string, 
    primaryTable: string, 
    signal?: AbortSignal
  ): Promise<SuggestedUnionsResponse> {
    const url = buildUrl('/suggested-unions', { database, primary_table: primaryTable });
    const response = await fetchWithErrorHandling(url, {}, signal);
    return response.json();
  },

  /**
   * Get merged columns from joined or unioned tables
   */
  async getMergedColumns(
    database: string,
    primaryTable: string,
    joinedTables?: string[],
    unionTables?: Array<{database: string, table_name: string}> | string[],
    autoDetect: boolean = true,
    customRelationships?: ForeignKeyRelationship[] | null,
    signal?: AbortSignal
  ): Promise<MergedColumnsResponse> {
    const body: Record<string, any> = {
      joined_tables: joinedTables || null,
      union_tables: unionTables || null,
      auto_detect: autoDetect,
    };
    if (customRelationships !== undefined && customRelationships !== null) {
      body.custom_relationships = customRelationships;
    }
    const response = await fetchWithErrorHandling(
      `${API_BASE_URL}/merged-columns?database=${database}&primary_table=${primaryTable}`, 
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }, 
      signal
    );

    return response.json();
  },

  /**
   * Get distinct values for a field (for discrete filters)
   */
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

  /**
   * Get count of distinct values for a field
   */
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
    signal?: AbortSignal,
    sourceTable?: string
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
    if (sourceTable) {
      requestBody.sourceTable = sourceTable;
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

  /**
   * Get min/max range for a continuous field
   */
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

  /**
   * Get min/max date range for a datetime field
   */
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

  /**
   * Get row count for a table with optional filters
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

  /**
   * Get field statistics (min, max, row count) for binning
   */
  async getFieldStats(
    table: string,
    field: string,
    database?: string,
    signal?: AbortSignal
  ): Promise<{ min: number; max: number; rowCount: number }> {
    const abortController = signal ? null : createAbortController();
    const requestSignal = signal || abortController?.signal;

    // Build a query to get min, max, and count values
    const queryDesc: any = {
      target_table: table,
      target_database: database,
      dimensions: [],
      measures: [
        { field, aggregation: 'min' as const, alias: 'min_value' },
        { field, aggregation: 'max' as const, alias: 'max_value' },
        { field, aggregation: 'count' as const, alias: 'row_count' },
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

    // Extract values from the result
    if (result.rows.length > 0) {
      return {
        min: result.rows[0].min_value,
        max: result.rows[0].max_value,
        rowCount: result.rows[0].row_count,
      };
    }

    throw new Error('No data available for field statistics');
  },
};

/**
 * Standalone export for fetching field statistics (used by binning dialog).
 * Convenience function that wraps metadataApi.getFieldStats.
 */
export async function fetchFieldStats(
  table: string,
  field: string,
  database?: string,
  signal?: AbortSignal
): Promise<{ min: number; max: number; rowCount: number }> {
  return metadataApi.getFieldStats(table, field, database, signal);
}
