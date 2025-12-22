/**
 * Column Cache Manager
 * 
 * Manages column-level caching in DuckDB WASM.
 * Tracks individual columns rather than full query results,
 * enabling incremental fetching of only missing columns.
 */

import { duckdbService } from './duckdbService';
import { Table as ArrowTable, tableFromIPC } from 'apache-arrow';

export interface CachedColumnInfo {
  columnName: string;
  sourceTable: string;
  sourceDatabase?: string;
  baseFilterHash: string;
  rowCount: number;
  dataType: string;
  cachedAt: Date;
}

export interface ColumnCacheStats {
  totalColumns: number;
  totalRows: number;
  uniqueTables: number;
  oldestCache: Date | null;
  newestCache: Date | null;
}

/**
 * Key format: {database}_{table}_{filterHash}
 * Value: Set of column names cached for that key
 */
type CacheIndex = Map<string, Map<string, CachedColumnInfo>>;

class ColumnCacheManager {
  // Index: cacheKey -> (columnName -> info)
  private cacheIndex: CacheIndex = new Map();
  
  // DuckDB table names for each cache key
  private tableNames: Map<string, string> = new Map();
  
  private initialized: boolean = false;
  
  /**
   * Generate a cache key for a table + filter combination
   */
  private generateCacheKey(
    sourceTable: string,
    sourceDatabase?: string,
    baseFilterHash?: string
  ): string {
    const parts = [
      sourceDatabase || '_default',
      sourceTable,
      baseFilterHash || '_nofilter'
    ];
    return parts.join('__').replace(/[^a-zA-Z0-9_]/g, '_');
  }
  
  /**
   * Generate a DuckDB table name for storing cached data
   */
  private generateTableName(cacheKey: string): string {
    return `cache_${cacheKey}`;
  }
  
  /**
   * Ensure DuckDB is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      if (!duckdbService.isReady && !duckdbService.isInitializing) {
        await duckdbService.initialize();
      }
      this.initialized = true;
    }
  }
  
  /**
   * Get list of columns cached for a table + filter combination
   */
  getCachedColumns(
    sourceTable: string,
    sourceDatabase?: string,
    baseFilterHash?: string
  ): string[] {
    const cacheKey = this.generateCacheKey(sourceTable, sourceDatabase, baseFilterHash);
    const columnMap = this.cacheIndex.get(cacheKey);
    
    if (!columnMap) {
      return [];
    }
    
    return Array.from(columnMap.keys());
  }
  
  /**
   * Check if specific columns are cached
   */
  hasColumns(
    sourceTable: string,
    sourceDatabase: string | undefined,
    baseFilterHash: string | undefined,
    columnNames: string[]
  ): { cached: string[]; missing: string[] } {
    const cachedColumns = this.getCachedColumns(sourceTable, sourceDatabase, baseFilterHash);
    const cachedSet = new Set(cachedColumns);
    
    const cached: string[] = [];
    const missing: string[] = [];
    
    for (const col of columnNames) {
      if (cachedSet.has(col)) {
        cached.push(col);
      } else {
        missing.push(col);
      }
    }
    
    return { cached, missing };
  }
  
  /**
   * Cache columns from an Arrow table
   * 
   * If table already exists with some columns, this will:
   * 1. Read existing data
   * 2. Join with new columns
   * 3. Replace the table
   * 
   * For simplicity in initial implementation, we replace the entire table.
   * Future optimization: true column-level incremental caching.
   */
  async cacheColumns(
    sourceTable: string,
    sourceDatabase: string | undefined,
    baseFilterHash: string | undefined,
    arrowTable: ArrowTable
  ): Promise<void> {
    await this.ensureInitialized();
    
    const cacheKey = this.generateCacheKey(sourceTable, sourceDatabase, baseFilterHash);
    const tableName = this.generateTableName(cacheKey);
    
    // Check if we already have this table - if so, drop it first
    if (this.tableNames.has(cacheKey)) {
      try {
        await duckdbService.dropTable(tableName);
      } catch (e) {
        console.warn(`⚠️ Failed to drop existing cache table ${tableName}:`, e);
      }
    }
    
    // Register the new table
    await duckdbService.registerArrowTable(tableName, arrowTable);
    
    // Update index
    const columnMap = new Map<string, CachedColumnInfo>();
    const now = new Date();
    
    for (const field of arrowTable.schema.fields) {
      columnMap.set(field.name, {
        columnName: field.name,
        sourceTable,
        sourceDatabase,
        baseFilterHash: baseFilterHash || '',
        rowCount: arrowTable.numRows,
        dataType: field.type.toString(),
        cachedAt: now,
      });
    }
    
    this.cacheIndex.set(cacheKey, columnMap);
    this.tableNames.set(cacheKey, tableName);
    
    console.log(`📦 Cached ${arrowTable.schema.fields.length} columns for ${sourceTable}: ${arrowTable.schema.fields.map(f => f.name).join(', ')}`);
  }
  
  /**
   * Cache columns from Arrow IPC buffer
   */
  async cacheColumnsFromBuffer(
    sourceTable: string,
    sourceDatabase: string | undefined,
    baseFilterHash: string | undefined,
    buffer: ArrayBuffer
  ): Promise<void> {
    const arrowTable = tableFromIPC(buffer);
    return this.cacheColumns(sourceTable, sourceDatabase, baseFilterHash, arrowTable);
  }
  
  /**
   * Get the DuckDB table name for cached data
   */
  getCacheTableName(
    sourceTable: string,
    sourceDatabase?: string,
    baseFilterHash?: string
  ): string | undefined {
    const cacheKey = this.generateCacheKey(sourceTable, sourceDatabase, baseFilterHash);
    return this.tableNames.get(cacheKey);
  }
  
  /**
   * Invalidate cache for a specific table + filter combination
   */
  async invalidate(
    sourceTable: string,
    sourceDatabase?: string,
    baseFilterHash?: string
  ): Promise<void> {
    const cacheKey = this.generateCacheKey(sourceTable, sourceDatabase, baseFilterHash);
    const tableName = this.tableNames.get(cacheKey);
    
    if (tableName) {
      try {
        await duckdbService.dropTable(tableName);
      } catch (e) {
        console.warn(`⚠️ Failed to drop cache table ${tableName}:`, e);
      }
    }
    
    this.cacheIndex.delete(cacheKey);
    this.tableNames.delete(cacheKey);
    
    console.log(`🗑️ Invalidated cache for ${sourceTable} (filter: ${baseFilterHash || 'none'})`);
  }
  
  /**
   * Invalidate all caches for a table (any filter hash)
   */
  async invalidateForTable(
    sourceTable: string,
    sourceDatabase?: string
  ): Promise<void> {
    const keysToDelete: string[] = [];
    
    for (const [cacheKey, _columnMap] of Array.from(this.cacheIndex.entries())) {
      // Check if this cache key belongs to the specified table
      const prefix = this.generateCacheKey(sourceTable, sourceDatabase, '').replace(/__[^_]*$/, '__');
      if (cacheKey.startsWith(prefix.replace(/__$/, ''))) {
        keysToDelete.push(cacheKey);
      }
    }
    
    for (const cacheKey of keysToDelete) {
      const tableName = this.tableNames.get(cacheKey);
      if (tableName) {
        try {
          await duckdbService.dropTable(tableName);
        } catch (e) {
          console.warn(`⚠️ Failed to drop cache table ${tableName}:`, e);
        }
      }
      this.cacheIndex.delete(cacheKey);
      this.tableNames.delete(cacheKey);
    }
    
    if (keysToDelete.length > 0) {
      console.log(`🗑️ Invalidated ${keysToDelete.length} cache entries for table ${sourceTable}`);
    }
  }
  
  /**
   * Invalidate all caches
   */
  async invalidateAll(): Promise<void> {
    for (const tableName of Array.from(this.tableNames.values())) {
      try {
        await duckdbService.dropTable(tableName);
      } catch (e) {
        console.warn(`⚠️ Failed to drop cache table ${tableName}:`, e);
      }
    }
    
    this.cacheIndex.clear();
    this.tableNames.clear();
    this.initialized = false;
    
    console.log('🗑️ Invalidated all column caches');
  }
  
  /**
   * Get cache statistics
   */
  getStats(): ColumnCacheStats {
    let totalColumns = 0;
    let totalRows = 0;
    let oldestCache: Date | null = null;
    let newestCache: Date | null = null;
    const tables = new Set<string>();
    
    for (const columnMap of Array.from(this.cacheIndex.values())) {
      for (const info of Array.from(columnMap.values())) {
        totalColumns++;
        totalRows = Math.max(totalRows, info.rowCount); // Same rows per cache entry
        tables.add(`${info.sourceDatabase || ''}.${info.sourceTable}`);
        
        if (!oldestCache || info.cachedAt < oldestCache) {
          oldestCache = info.cachedAt;
        }
        if (!newestCache || info.cachedAt > newestCache) {
          newestCache = info.cachedAt;
        }
      }
    }
    
    return {
      totalColumns,
      totalRows,
      uniqueTables: tables.size,
      oldestCache,
      newestCache,
    };
  }
  
  /**
   * Get all cached table info for debugging
   */
  getAllCacheInfo(): Array<{
    cacheKey: string;
    tableName: string;
    columns: CachedColumnInfo[];
  }> {
    const result: Array<{
      cacheKey: string;
      tableName: string;
      columns: CachedColumnInfo[];
    }> = [];
    
    for (const [cacheKey, columnMap] of Array.from(this.cacheIndex.entries())) {
      result.push({
        cacheKey,
        tableName: this.tableNames.get(cacheKey) || '',
        columns: Array.from(columnMap.values()),
      });
    }
    
    return result;
  }
  
  /**
   * Get column info for a specific cache
   */
  getColumnInfo(
    sourceTable: string,
    sourceDatabase?: string,
    baseFilterHash?: string
  ): CachedColumnInfo[] {
    const cacheKey = this.generateCacheKey(sourceTable, sourceDatabase, baseFilterHash);
    const columnMap = this.cacheIndex.get(cacheKey);
    
    if (!columnMap) {
      return [];
    }
    
    return Array.from(columnMap.values());
  }
}

// Export singleton instance
export const columnCacheManager = new ColumnCacheManager();

// Also export the class for testing
export { ColumnCacheManager };

