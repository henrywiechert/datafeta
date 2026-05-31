// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Query API Service
 * 
 * Handles data query operations:
 * - Execute queries with JSON transport
 * - Execute queries with Arrow IPC transport (optimized)
 * - Execute queries returning raw Arrow tables (for DuckDB caching)
 */

import { tableFromIPC, Table as ArrowTable } from 'apache-arrow';
import { QueryDescription, QueryResult } from '../../types';
import { arrowTableToRows } from '../arrowResultAdapter';
import { logSqlQuery } from '../../devtools/queryLog';
import { getTabId } from '../../utils/tabSession';
import { API_BASE_URL, createAbortController } from './apiClient';
import { devLog } from '../../utils/devLog';

export const queryApi = {
  /**
   * Execute a query with JSON transport
   */
  async executeQuery(
    queryDesc: QueryDescription, 
    signal?: AbortSignal
  ): Promise<QueryResult> {
    const abortController = signal ? null : createAbortController();
    const requestSignal = signal || abortController?.signal;

    const start = performance.now();
    
    const fetchOptions: RequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Tab-Id': getTabId(),
      },
      body: JSON.stringify(queryDesc),
      signal: requestSignal,
      credentials: 'include',
    };

    const response = await fetch(`${API_BASE_URL}/query`, fetchOptions);
    
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
   */
  async executeQueryArrowRaw(
    queryDesc: QueryDescription, 
    signal?: AbortSignal
  ): Promise<{
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
        'X-Tab-Id': getTabId(),
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

      devLog(`📊 Arrow raw fetch: ${arrayBuffer.byteLength} bytes → ${arrowTable.numRows} rows × ${columnCount} columns`);

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
   */
  async executeQueryArrow(
    queryDesc: QueryDescription, 
    signal?: AbortSignal
  ): Promise<QueryResult> {
    const abortController = signal ? null : createAbortController();
    const requestSignal = signal || abortController?.signal;

    const start = performance.now();
    const fetchOptions: RequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Tab-Id': getTabId(),
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

      devLog(`📊 Arrow transport: ${arrayBuffer.byteLength} bytes → ${numRows} rows × ${columnCount} columns`);

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
};
