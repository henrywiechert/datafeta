/**
 * DuckDB WASM Service
 * 
 * Manages a DuckDB WASM instance for frontend data caching and local query execution.
 * This enables per-chart query optimization without backend round-trips.
 */

import * as duckdb from '@duckdb/duckdb-wasm';
import { Table as ArrowTable } from 'apache-arrow';

// CDN URLs for DuckDB WASM bundles
const DUCKDB_CDN_BASE = 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.29.0/dist';

/**
 * Create a same-origin worker from a cross-origin script URL.
 * This works around CORS restrictions by fetching the script and creating a blob URL.
 */
async function createWorkerFromUrl(url: string): Promise<Worker> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch worker script: ${response.status}`);
  }
  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  return new Worker(blobUrl);
}

export interface QueryResult {
  columns: string[];
  rows: Record<string, any>[];
  rowCount: number;
}

export type DuckDBInitStatus = 'uninitialized' | 'initializing' | 'ready' | 'error';

/**
 * Service for managing DuckDB WASM instance and executing local queries.
 * 
 * Usage:
 * ```typescript
 * await duckdbService.initialize();
 * await duckdbService.registerArrowTable('my_data', arrowTable);
 * const result = await duckdbService.query('SELECT DISTINCT x, y FROM my_data');
 * ```
 */
class DuckDBService {
  private db: duckdb.AsyncDuckDB | null = null;
  private conn: duckdb.AsyncDuckDBConnection | null = null;
  private worker: Worker | null = null;
  private _status: DuckDBInitStatus = 'uninitialized';
  private _lastError: string | null = null;
  private initPromise: Promise<void> | null = null;
  private registeredTables: Set<string> = new Set();

  /**
   * Current initialization status
   */
  get status(): DuckDBInitStatus {
    return this._status;
  }

  /**
   * Check if the service is ready for queries
   */
  get isReady(): boolean {
    return this._status === 'ready' && this.conn !== null;
  }

  /**
   * Check if the service is currently initializing
   */
  get isInitializing(): boolean {
    return this._status === 'initializing';
  }

  /**
   * Get the last error message if any
   */
  get lastError(): string | null {
    return this._lastError;
  }

  /**
   * Get list of registered table names
   */
  get tableNames(): string[] {
    return Array.from(this.registeredTables);
  }

  /**
   * Initialize DuckDB WASM instance.
   * Safe to call multiple times - will only initialize once.
   */
  async initialize(): Promise<void> {
    // Return existing promise if already initializing
    if (this.initPromise) {
      return this.initPromise;
    }

    // Skip if already ready
    if (this._status === 'ready') {
      return;
    }

    this._status = 'initializing';
    this.initPromise = this._doInitialize();
    
    try {
      await this.initPromise;
      this._status = 'ready';
      this._lastError = null;
      console.log('✅ DuckDB WASM initialized successfully');
    } catch (error) {
      this._status = 'error';
      this._lastError = error instanceof Error ? error.message : String(error);
      this.initPromise = null;
      console.error('❌ Failed to initialize DuckDB WASM:', error);
      throw error;
    }
  }

  private async _doInitialize(): Promise<void> {
    // Use MVP bundle (smaller, more compatible)
    const wasmUrl = `${DUCKDB_CDN_BASE}/duckdb-mvp.wasm`;
    const workerUrl = `${DUCKDB_CDN_BASE}/duckdb-browser-mvp.worker.js`;
    
    console.log('🦆 Loading DuckDB WASM worker...');
    
    // Create worker using blob URL to avoid CORS issues
    this.worker = await createWorkerFromUrl(workerUrl);
    
    const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
    this.db = new duckdb.AsyncDuckDB(logger, this.worker);
    
    console.log('🦆 Instantiating DuckDB WASM...');
    await this.db.instantiate(wasmUrl);
    
    // Open a connection
    this.conn = await this.db.connect();
    
    // Disable progress bar (not needed for our use case)
    await this.conn.query(`SET enable_progress_bar = false`);
    
    console.log('🦆 DuckDB WASM ready!');
  }

  /**
   * Execute a SQL query and return results
   * 
   * @param sql - SQL query string
   * @returns Query results with columns and rows
   */
  async query(sql: string): Promise<QueryResult> {
    if (!this.isReady) {
      throw new Error('DuckDB WASM not initialized. Call initialize() first.');
    }

    try {
      const result = await this.conn!.query(sql);
      return this.arrowTableToResult(result);
    } catch (error) {
      console.error('DuckDB query error:', error);
      throw error;
    }
  }

  /**
   * Execute a SQL query and return raw Arrow table
   * Useful for direct Arrow processing without conversion overhead
   * 
   * @param sql - SQL query string
   * @returns Arrow Table
   */
  async queryArrow(sql: string): Promise<ArrowTable> {
    if (!this.isReady) {
      throw new Error('DuckDB WASM not initialized. Call initialize() first.');
    }

    return await this.conn!.query(sql);
  }

  /**
   * Register an Arrow table with DuckDB for querying
   * 
   * @param name - Table name to use in queries
   * @param table - Arrow Table to register
   */
  async registerArrowTable(name: string, table: ArrowTable): Promise<void> {
    if (!this.isReady) {
      throw new Error('DuckDB WASM not initialized. Call initialize() first.');
    }

    // Drop existing table if it exists
    if (this.registeredTables.has(name)) {
      await this.conn!.query(`DROP TABLE IF EXISTS "${name}"`);
      this.registeredTables.delete(name);
    }

    // Convert Arrow table to JSON rows for insertion
    // This is less efficient than direct Arrow but more reliable across DuckDB WASM versions
    const rows: Record<string, any>[] = [];
    const convertValue = (value: any): any => {
      if (typeof value === 'bigint') {
        return Number.isSafeInteger(Number(value)) ? Number(value) : value.toString();
      }
      return value;
    };
    
    for (let i = 0; i < table.numRows; i++) {
      const row: Record<string, any> = {};
      for (const field of table.schema.fields) {
        row[field.name] = convertValue(table.getChild(field.name)?.get(i));
      }
      rows.push(row);
    }
    
    // Use JSON-based registration
    await this.registerJsonData(name, rows);
    console.log(`📊 Registered Arrow table "${name}" with ${table.numRows} rows (via JSON conversion)`);
  }

  /**
   * Register data from a JSON array as a table
   * 
   * @param name - Table name to use in queries
   * @param rows - Array of row objects
   */
  async registerJsonData(name: string, rows: Record<string, any>[]): Promise<void> {
    if (!this.isReady) {
      throw new Error('DuckDB WASM not initialized. Call initialize() first.');
    }

    if (rows.length === 0) {
      console.warn(`Cannot register empty dataset as table "${name}"`);
      return;
    }

    // Drop existing table if it exists
    if (this.registeredTables.has(name)) {
      await this.conn!.query(`DROP TABLE IF EXISTS "${name}"`);
    }

    // Insert data using INSERT statements in batches
    // First, create table with inferred schema from first row
    const columns = Object.keys(rows[0]);
    const columnDefs = columns.map(col => {
      const value = rows[0][col];
      const type = this.inferSqlType(value);
      return `"${col}" ${type}`;
    }).join(', ');

    await this.conn!.query(`CREATE TABLE "${name}" (${columnDefs})`);

    // Insert data in batches
    const batchSize = 1000;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const values = batch.map(row => {
        const rowValues = columns.map(col => this.formatValue(row[col]));
        return `(${rowValues.join(', ')})`;
      }).join(', ');

      await this.conn!.query(`INSERT INTO "${name}" VALUES ${values}`);
    }

    this.registeredTables.add(name);
    console.log(`📊 Registered table "${name}" with ${rows.length} rows`);
  }

  /**
   * Check if a table is registered
   */
  hasTable(name: string): boolean {
    return this.registeredTables.has(name);
  }

  /**
   * Drop a registered table
   */
  async dropTable(name: string): Promise<void> {
    if (!this.isReady || !this.registeredTables.has(name)) {
      return;
    }

    await this.conn!.query(`DROP TABLE IF EXISTS "${name}"`);
    this.registeredTables.delete(name);
  }

  /**
   * Drop all registered tables
   */
  async dropAllTables(): Promise<void> {
    const tables = Array.from(this.registeredTables);
    for (const name of tables) {
      await this.dropTable(name);
    }
  }

  /**
   * Get table schema information
   */
  async getTableSchema(name: string): Promise<{ column: string; type: string }[]> {
    if (!this.hasTable(name)) {
      throw new Error(`Table "${name}" not found`);
    }

    const result = await this.query(`DESCRIBE "${name}"`);
    return result.rows.map(row => ({
      column: row.column_name || row.name,
      type: row.column_type || row.type,
    }));
  }

  /**
   * Get approximate row count for a table
   */
  async getTableRowCount(name: string): Promise<number> {
    if (!this.hasTable(name)) {
      return 0;
    }

    const result = await this.query(`SELECT COUNT(*) as cnt FROM "${name}"`);
    return result.rows[0]?.cnt ?? 0;
  }

  /**
   * Close the connection and terminate the worker
   */
  async close(): Promise<void> {
    if (this.conn) {
      await this.conn.close();
      this.conn = null;
    }
    if (this.db) {
      await this.db.terminate();
      this.db = null;
    }
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this._status = 'uninitialized';
    this.initPromise = null;
    this.registeredTables.clear();
  }

  // Helper: Convert Arrow table to QueryResult
  private arrowTableToResult(table: ArrowTable): QueryResult {
    const columns = table.schema.fields.map(f => f.name);
    const rows: Record<string, any>[] = [];

    for (let i = 0; i < table.numRows; i++) {
      const row: Record<string, any> = {};
      for (const col of columns) {
        const column = table.getChild(col);
        row[col] = column?.get(i);
      }
      rows.push(row);
    }

    return {
      columns,
      rows,
      rowCount: table.numRows,
    };
  }

  // Helper: Infer SQL type from JavaScript value
  private inferSqlType(value: any): string {
    if (value === null || value === undefined) {
      return 'VARCHAR';
    }
    if (typeof value === 'number') {
      return Number.isInteger(value) ? 'BIGINT' : 'DOUBLE';
    }
    if (typeof value === 'boolean') {
      return 'BOOLEAN';
    }
    if (value instanceof Date) {
      return 'TIMESTAMP';
    }
    return 'VARCHAR';
  }

  // Helper: Format value for SQL INSERT
  private formatValue(value: any): string {
    if (value === null || value === undefined) {
      return 'NULL';
    }
    if (typeof value === 'number') {
      return String(value);
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    if (value instanceof Date) {
      return `'${value.toISOString()}'`;
    }
    // Escape single quotes in strings
    const escaped = String(value).replace(/'/g, "''");
    return `'${escaped}'`;
  }
}

// Export singleton instance
export const duckdbService = new DuckDBService();

// Also export the class for testing purposes
export { DuckDBService };

