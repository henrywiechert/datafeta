/**
 * Cache Manager
 * 
 * Tracks which tables and columns are cached in DuckDB WASM.
 * Provides cache invalidation and query routing decisions.
 */

import { duckdbService } from './duckdbService';
import { Table as ArrowTable, tableFromIPC } from 'apache-arrow';
import { QueryResult as ApiQueryResult } from '../types';

export interface CachedTableInfo {
  name: string;
  sourceTable: string;           // Original table name from backend
  sourceDatabase?: string;       // Original database name
  columns: string[];             // Cached column names
  rowCount: number;              // Number of rows
  cachedAt: Date;                // When the cache was created
  filters?: CacheFilterState;    // Filters applied when caching
  expiresAt?: Date;              // Optional expiration time
}

export interface CacheFilterState {
  // Simplified representation of active filters when data was cached
  filterHash: string;
}

export interface CacheStats {
  tableCount: number;
  totalRows: number;
  oldestCache: Date | null;
  newestCache: Date | null;
}

/**
 * Manages data caching in DuckDB WASM.
 * 
 * Responsibilities:
 * - Track which tables/columns are cached
 * - Decide when to use local cache vs backend
 * - Handle cache invalidation
 * - Manage cache lifecycle (expiration, eviction)
 */
class CacheManager {
  private cachedTables: Map<string, CachedTableInfo> = new Map();
  private initialized: boolean = false;

  /**
   * Cache key generation for consistent table naming
   */
  private generateCacheKey(
    sourceTable: string,
    sourceDatabase?: string,
    filterHash?: string
  ): string {
    const parts = [sourceDatabase, sourceTable, filterHash].filter(Boolean);
    // Create a safe table name (alphanumeric + underscore)
    return parts.join('_').replace(/[^a-zA-Z0-9_]/g, '_');
  }

  /**
   * Ensure DuckDB WASM is initialized before cache operations
   */
  async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await duckdbService.initialize();
      this.initialized = true;
    }
  }

  /**
   * Cache query result data from the backend
   * 
   * @param sourceTable - Original table name
   * @param sourceDatabase - Original database name
   * @param result - Query result from backend API
   * @param filterHash - Hash of applied filters (for cache key)
   * @returns Cache key (table name) for the cached data
   */
  async cacheQueryResult(
    sourceTable: string,
    sourceDatabase: string | undefined,
    result: ApiQueryResult,
    filterHash?: string
  ): Promise<string> {
    await this.ensureInitialized();

    const cacheKey = this.generateCacheKey(sourceTable, sourceDatabase, filterHash);
    
    // Register data with DuckDB WASM
    await duckdbService.registerJsonData(cacheKey, result.rows);

    // Track cache metadata
    const columns = result.columns.map(c => 
      typeof c === 'string' ? c : c.name
    );

    this.cachedTables.set(cacheKey, {
      name: cacheKey,
      sourceTable,
      sourceDatabase,
      columns,
      rowCount: result.row_count,
      cachedAt: new Date(),
      filters: filterHash ? { filterHash } : undefined,
    });

    console.log(`📦 Cached ${result.row_count} rows as "${cacheKey}"`);
    return cacheKey;
  }

  /**
   * Cache Arrow table data directly (more efficient for large datasets)
   * 
   * @param sourceTable - Original table name
   * @param sourceDatabase - Original database name  
   * @param arrowTable - Arrow table from backend
   * @param filterHash - Hash of applied filters
   * @returns Cache key for the cached data
   */
  async cacheArrowTable(
    sourceTable: string,
    sourceDatabase: string | undefined,
    arrowTable: ArrowTable,
    filterHash?: string
  ): Promise<string> {
    await this.ensureInitialized();

    const cacheKey = this.generateCacheKey(sourceTable, sourceDatabase, filterHash);
    
    // Register Arrow table directly
    await duckdbService.registerArrowTable(cacheKey, arrowTable);

    // Track cache metadata
    const columns = arrowTable.schema.fields.map(f => f.name);

    this.cachedTables.set(cacheKey, {
      name: cacheKey,
      sourceTable,
      sourceDatabase,
      columns,
      rowCount: arrowTable.numRows,
      cachedAt: new Date(),
      filters: filterHash ? { filterHash } : undefined,
    });

    console.log(`📦 Cached Arrow table with ${arrowTable.numRows} rows as "${cacheKey}"`);
    return cacheKey;
  }

  /**
   * Cache Arrow IPC buffer (from backend Arrow transport)
   */
  async cacheArrowBuffer(
    sourceTable: string,
    sourceDatabase: string | undefined,
    buffer: ArrayBuffer,
    filterHash?: string
  ): Promise<string> {
    const arrowTable = tableFromIPC(buffer);
    return this.cacheArrowTable(sourceTable, sourceDatabase, arrowTable, filterHash);
  }

  /**
   * Check if data is cached and contains required columns
   * 
   * @param sourceTable - Original table name
   * @param sourceDatabase - Original database name
   * @param requiredColumns - Columns needed for the query
   * @param filterHash - Hash of current filters (must match cached filters)
   * @returns Cache key if cached, null otherwise
   */
  getCacheKeyIfAvailable(
    sourceTable: string,
    sourceDatabase: string | undefined,
    requiredColumns: string[],
    filterHash?: string
  ): string | null {
    const cacheKey = this.generateCacheKey(sourceTable, sourceDatabase, filterHash);
    const cached = this.cachedTables.get(cacheKey);

    if (!cached) {
      return null;
    }

    // Check if all required columns are present
    const hasAllColumns = requiredColumns.every(col => 
      cached.columns.includes(col)
    );

    if (!hasAllColumns) {
      console.log(`⚠️ Cache miss: missing columns. Need: ${requiredColumns}, Have: ${cached.columns}`);
      return null;
    }

    // Check expiration
    if (cached.expiresAt && cached.expiresAt < new Date()) {
      console.log(`⚠️ Cache expired for "${cacheKey}"`);
      this.invalidateCache(cacheKey);
      return null;
    }

    return cacheKey;
  }

  /**
   * Get cached table info
   */
  getCacheInfo(cacheKey: string): CachedTableInfo | undefined {
    return this.cachedTables.get(cacheKey);
  }

  /**
   * Get all cached tables for a source table
   */
  getCachesForSource(sourceTable: string, sourceDatabase?: string): CachedTableInfo[] {
    return Array.from(this.cachedTables.values()).filter(info =>
      info.sourceTable === sourceTable &&
      info.sourceDatabase === sourceDatabase
    );
  }

  /**
   * Invalidate a specific cache
   */
  async invalidateCache(cacheKey: string): Promise<void> {
    if (this.cachedTables.has(cacheKey)) {
      await duckdbService.dropTable(cacheKey);
      this.cachedTables.delete(cacheKey);
      console.log(`🗑️ Invalidated cache "${cacheKey}"`);
    }
  }

  /**
   * Invalidate all caches for a source table
   */
  async invalidateSourceCaches(sourceTable: string, sourceDatabase?: string): Promise<void> {
    const toInvalidate = this.getCachesForSource(sourceTable, sourceDatabase);
    for (const info of toInvalidate) {
      await this.invalidateCache(info.name);
    }
  }

  /**
   * Invalidate all caches
   */
  async invalidateAll(): Promise<void> {
    await duckdbService.dropAllTables();
    this.cachedTables.clear();
    console.log('🗑️ Invalidated all caches');
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const tables = Array.from(this.cachedTables.values());
    const dates = tables.map(t => t.cachedAt);

    return {
      tableCount: tables.length,
      totalRows: tables.reduce((sum, t) => sum + t.rowCount, 0),
      oldestCache: dates.length > 0 ? new Date(Math.min(...dates.map(d => d.getTime()))) : null,
      newestCache: dates.length > 0 ? new Date(Math.max(...dates.map(d => d.getTime()))) : null,
    };
  }

  /**
   * Check if any data is cached
   */
  get hasCachedData(): boolean {
    return this.cachedTables.size > 0;
  }

  /**
   * Get list of all cache keys
   */
  get cacheKeys(): string[] {
    return Array.from(this.cachedTables.keys());
  }

  /**
   * Get all cached table info for debugging
   */
  getAllTableInfo(): CachedTableInfo[] {
    return Array.from(this.cachedTables.values());
  }
}

// Export singleton instance
export const cacheManager = new CacheManager();

// Also export the class for testing
export { CacheManager };

/**
 * Utility: Generate a filter hash for cache key generation
 * 
 * @param filters - Filter configurations from the visualization
 * @returns Hash string representing the filter state
 */
export function generateFilterHash(
  filters: Record<string, any>
): string {
  // Simple hash based on JSON serialization
  // In production, consider a more robust hashing approach
  const json = JSON.stringify(filters, Object.keys(filters).sort());
  
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < json.length; i++) {
    const char = json.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  return Math.abs(hash).toString(36);
}

/**
 * Utility: Decide whether to query locally or use backend
 */
export function shouldQueryLocally(
  sourceTable: string,
  sourceDatabase: string | undefined,
  requiredColumns: string[],
  filterHash?: string
): boolean {
  const cacheKey = cacheManager.getCacheKeyIfAvailable(
    sourceTable,
    sourceDatabase,
    requiredColumns,
    filterHash
  );
  
  return cacheKey !== null;
}

