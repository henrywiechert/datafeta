/**
 * Filter Tier Manager
 * 
 * Manages two tiers of filters:
 * - Base filters: Changes trigger backend re-query and cache invalidation
 * - Refinement filters: Applied locally via DuckDB WASM WHERE clause
 * 
 * Tier selection is now AUTOMATIC based on cache state:
 * - If a column is already cached in DuckDB, it's a refinement filter (instant)
 * - If a column is not cached, it's a base filter (requires backend fetch)
 * 
 * This enables efficient local filtering without re-fetching data from backend
 * while still supporting complex filter scenarios.
 */

import { buildDuckDbDateTimePartExpr } from './localSqlBuilder';
import { columnCacheManager } from './columnCacheManager';

export type FilterTier = 'base' | 'refinement';

export interface FilterTierConfig {
  // Column names that are designated as base filters
  baseFilterColumns: Set<string>;
  // Callback when base filters change
  onBaseFilterChange?: () => void;
}

export interface TieredFilter {
  columnName: string;
  tier: FilterTier;
  config: any; // The actual filter configuration
}

export interface CacheContext {
  sourceTable: string;
  sourceDatabase?: string;
  baseFilterHash?: string;
}

class FilterTierManager {
  // Set of column names that are treated as base filters
  // NOTE: This is now deprecated for manual tier selection. 
  // Tier is determined automatically based on cache state.
  // Kept for backward compatibility during transition.
  private baseFilterColumns: Set<string> = new Set();
  
  /**
   * Base-filter state must be scoped per (database, table). Otherwise switching tables/connections
   * can produce incorrect cache hits/misses and invalidations.
   */
  private baseFilterStateByContext: Map<string, { hash: string; configs: Record<string, any> }> = new Map();
  private lastContextKey: string = '_default::_unknown';
  
  // Callback for base filter changes
  private onBaseFilterChange?: () => void;
  
  private getContextKey(sourceTable?: string, sourceDatabase?: string): string {
    return `${sourceDatabase || '_default'}::${sourceTable || '_unknown'}`;
  }
  
  private getStateFor(sourceTable?: string, sourceDatabase?: string): { hash: string; configs: Record<string, any> } {
    const key = this.getContextKey(sourceTable, sourceDatabase);
    this.lastContextKey = key;
    const existing = this.baseFilterStateByContext.get(key);
    if (existing) return existing;
    const init = { hash: '', configs: {} as Record<string, any> };
    this.baseFilterStateByContext.set(key, init);
    return init;
  }
  
  /**
   * Configure which columns are treated as base filters
   * @deprecated Use automatic tier selection via determineFilterTier() instead
   * @param columns - Column names to treat as base filters
   */
  setBaseFilterColumns(columns: string[]): void {
    this.baseFilterColumns = new Set(columns);
    console.log(`🔧 Base filter columns set: ${columns.join(', ')}`);
  }
  
  /**
   * Add a column as a base filter
   * @deprecated Use automatic tier selection via determineFilterTier() instead
   */
  addBaseFilterColumn(columnName: string): void {
    this.baseFilterColumns.add(columnName);
    console.log(`🔧 Added base filter column: ${columnName}`);
  }
  
  /**
   * Remove a column from base filters (becomes refinement)
   * @deprecated Use automatic tier selection via determineFilterTier() instead
   */
  removeBaseFilterColumn(columnName: string): void {
    this.baseFilterColumns.delete(columnName);
    console.log(`🔧 Removed base filter column: ${columnName}`);
  }
  
  /**
   * Determine the appropriate filter tier based on cache state.
   * 
   * Logic:
   * - If the column is cached in DuckDB for the current context → refinement (instant local filter)
   * - If not cached → base (requires backend fetch, will be cached after)
   * 
   * @param columnName - The column to check
   * @param cacheContext - The current table/filter context
   * @returns 'refinement' if column is cached, 'base' otherwise
   */
  determineFilterTier(columnName: string, cacheContext?: CacheContext): FilterTier {
    if (!cacheContext?.sourceTable) {
      // No context - fall back to base to ensure data is fetched
      return 'base';
    }
    
    const cachedColumns = columnCacheManager.getCachedColumns(
      cacheContext.sourceTable,
      cacheContext.sourceDatabase,
      cacheContext.baseFilterHash
    );
    
    const isCached = cachedColumns.includes(columnName);
    const tier = isCached ? 'refinement' : 'base';
    
    console.log(`🎯 Filter tier for "${columnName}": ${tier} (cached: ${isCached}, context: ${cacheContext.sourceTable})`);
    
    return tier;
  }
  
  /**
   * Check if a column is a base filter
   * Now uses automatic tier detection based on cache state when context is provided.
   */
  isBaseFilter(columnName: string, cacheContext?: CacheContext): boolean {
    // If cache context is provided, use automatic detection
    if (cacheContext?.sourceTable) {
      return this.determineFilterTier(columnName, cacheContext) === 'base';
    }
    
    // Legacy fallback: check manual set
    // If no base filters are explicitly set, treat all filters as base by default
    // This maintains backward compatibility
    if (this.baseFilterColumns.size === 0) {
      return true;
    }
    return this.baseFilterColumns.has(columnName);
  }
  
  /**
   * Get the tier of a filter
   */
  getFilterTier(columnName: string, cacheContext?: CacheContext): FilterTier {
    return this.isBaseFilter(columnName, cacheContext) ? 'base' : 'refinement';
  }
  
  /**
   * Set callback for base filter changes
   */
  setOnBaseFilterChange(callback: () => void): void {
    this.onBaseFilterChange = callback;
  }
  
  /**
   * Categorize all filters into base and refinement
   * Uses automatic tier detection based on cache state when cacheContext is provided.
   */
  categorizeFilters(
    filterConfigurations: Record<string, any>,
    cacheContext?: CacheContext
  ): {
    baseFilters: Record<string, any>;
    refinementFilters: Record<string, any>;
  } {
    const baseFilters: Record<string, any> = {};
    const refinementFilters: Record<string, any> = {};
    
    for (const [key, config] of Object.entries(filterConfigurations)) {
      const columnName = config.columnName || key;
      
      if (this.isBaseFilter(columnName, cacheContext)) {
        baseFilters[key] = config;
      } else {
        refinementFilters[key] = config;
      }
    }
    
    return { baseFilters, refinementFilters };
  }
  
  /**
   * Get only the base filters from a filter configuration
   */
  getBaseFiltersOnly(
    filterConfigurations: Record<string, any>,
    cacheContext?: CacheContext
  ): Record<string, any> {
    return this.categorizeFilters(filterConfigurations, cacheContext).baseFilters;
  }
  
  /**
   * Get only the refinement filters from a filter configuration
   */
  getRefinementFilters(
    filterConfigurations: Record<string, any>,
    cacheContext?: CacheContext
  ): Record<string, any> {
    return this.categorizeFilters(filterConfigurations, cacheContext).refinementFilters;
  }
  
  /**
   * Generate a hash for the base filter state
   */
  hashFilters(filters: Record<string, any>): string {
    if (Object.keys(filters).length === 0) {
      return '';
    }
    
    // Stable stringify that preserves nested config contents (selectedValues/min/max/etc).
    // NOTE: JSON.stringify's replacer-array option (previous implementation) incorrectly
    // strips nested keys, causing different filter configs to hash the same.
    const stableStringify = (value: any): string => {
      const normalize = (v: any): any => {
        if (v === null || v === undefined) return v;
        if (typeof v === 'bigint') return v.toString();
        if (Array.isArray(v)) return v.map(normalize);
        if (v instanceof Date) return v.toISOString();
        if (typeof v === 'object') {
          const out: Record<string, any> = {};
          for (const k of Object.keys(v).sort()) {
            out[k] = normalize(v[k]);
          }
          return out;
        }
        return v;
      };
      return JSON.stringify(normalize(value));
    };

    const sortedJson = stableStringify(filters);
    
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < sortedJson.length; i++) {
      const char = sortedJson.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    
    return Math.abs(hash).toString(36);
  }
  
  /**
   * Get current base filter hash
   */
  getBaseFilterHash(sourceTable?: string, sourceDatabase?: string): string {
    // If called without context, return the last used context to keep DebugView working.
    if (!sourceTable && !sourceDatabase) {
      return this.baseFilterStateByContext.get(this.lastContextKey)?.hash || '';
    }
    return this.getStateFor(sourceTable, sourceDatabase).hash;
  }
  
  /**
   * Check if base filters have changed since last update
   */
  hasBaseFilterChanged(
    filterConfigurations: Record<string, any>,
    sourceTable?: string,
    sourceDatabase?: string
  ): boolean {
    const baseFilters = this.getBaseFiltersOnly(filterConfigurations);
    const newHash = this.hashFilters(baseFilters);
    const state = this.getStateFor(sourceTable, sourceDatabase);
    return newHash !== state.hash;
  }
  
  /**
   * Update stored base filter state
   * Call this after fetching data with new base filters
   */
  updateBaseFilters(
    filterConfigurations: Record<string, any>,
    sourceTable?: string,
    sourceDatabase?: string
  ): void {
    const baseFilters = this.getBaseFiltersOnly(filterConfigurations);
    const state = this.getStateFor(sourceTable, sourceDatabase);
    const oldHash = state.hash;
    state.hash = this.hashFilters(baseFilters);
    state.configs = { ...baseFilters };
    
    if (oldHash !== state.hash) {
      console.log(`🔄 Base filter hash updated (${this.lastContextKey}): ${oldHash || '(empty)'} → ${state.hash || '(empty)'}`);
      this.onBaseFilterChange?.();
    }
  }
  
  /**
   * Get the stored base filter configurations
   */
  getStoredBaseFilters(sourceTable?: string, sourceDatabase?: string): Record<string, any> {
    // If called without context, return the last used context to keep DebugView working.
    if (!sourceTable && !sourceDatabase) {
      const state = this.baseFilterStateByContext.get(this.lastContextKey);
      return state ? { ...state.configs } : {};
    }
    const state = this.getStateFor(sourceTable, sourceDatabase);
    return { ...state.configs };
  }
  
  /**
   * Build a DuckDB WHERE clause for refinement filters
   * 
   * @param refinementFilters - The refinement filter configurations
   * @returns SQL WHERE clause string (without 'WHERE' keyword)
   */
  buildRefinementWhereClause(refinementFilters: Record<string, any>): string {
    const conditions: string[] = [];

    const quoteValue = (v: any): string => {
      if (v === null || v === undefined) return 'NULL';
      if (typeof v === 'number') return String(v);
      if (typeof v === 'bigint') return v.toString();
      if (v instanceof Date) return `'${v.toISOString().replace(/'/g, "''")}'`;
      if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`;
      // Fallback: stringify objects/booleans
      return `'${String(v).replace(/'/g, "''")}'`;
    };
    
    for (const config of Object.values(refinementFilters)) {
      const columnName = config.columnName;
      
      if (!columnName) continue;

      // If this filter targets a datetime part/mode, build a computed expression instead of a raw column reference.
      const hasDateTimePart = !!(config.dateTimePart && config.dateTimeMode);
      const columnExpr = hasDateTimePart
        ? `(${buildDuckDbDateTimePartExpr({
            field: columnName,
            datePart: config.dateTimePart,
            dateMode: config.dateTimeMode,
          })})`
        : `"${columnName}"`;
      
      // Handle different filter types
      if (config.type === 'discrete') {
        // Discrete filter: use NOT IN when excludedValues is available and shorter,
        // or when in pure exclusion mode (selectedValues empty, excludedValues set).
        const selectedValues = config.selectedValues || [];
        const excludedValues = config.excludedValues;
        const useExclusion = excludedValues
          && excludedValues.length > 0
          && (
            selectedValues.length === 0
            || (config.totalAvailableCount && excludedValues.length < selectedValues.length)
          );

        if (useExclusion) {
          const quotedExcluded = excludedValues.map(quoteValue);
          const hasNullExcluded = excludedValues.some((v: any) => v === null || v === undefined);
          if (hasNullExcluded) {
            const nonNullExcluded = quotedExcluded.filter((v: string) => v !== 'NULL');
            if (nonNullExcluded.length > 0) {
              conditions.push(`(${columnExpr} NOT IN (${nonNullExcluded.join(', ')}) AND ${columnExpr} IS NOT NULL)`);
            } else {
              conditions.push(`${columnExpr} IS NOT NULL`);
            }
          } else {
            conditions.push(`${columnExpr} NOT IN (${quotedExcluded.join(', ')})`);
          }
        } else if (selectedValues.length > 0) {
          const quotedValues = selectedValues.map(quoteValue);
          conditions.push(`${columnExpr} IN (${quotedValues.join(', ')})`);
        }
      } else if (config.type === 'continuous' || config.type === 'range') {
        // Range filter: BETWEEN or >= / <=
        const min = config.minValue ?? config.min;
        const max = config.maxValue ?? config.max;
        
        if (min !== undefined && max !== undefined) {
          conditions.push(`${columnExpr} BETWEEN ${min} AND ${max}`);
        } else if (min !== undefined) {
          conditions.push(`${columnExpr} >= ${min}`);
        } else if (max !== undefined) {
          conditions.push(`${columnExpr} <= ${max}`);
        }
      } else if (config.type === 'datetime') {
        // DateTime filter
        if (config.startDate && config.endDate) {
          conditions.push(`${columnExpr} BETWEEN ${quoteValue(config.startDate)} AND ${quoteValue(config.endDate)}`);
        }
      }
    }
    
    return conditions.join(' AND ');
  }
  
  /**
   * Reset all filter tier state
   */
  reset(): void {
    this.baseFilterColumns.clear();
    this.baseFilterStateByContext.clear();
    this.lastContextKey = '_default::_unknown';
    console.log('🔄 Filter tier manager reset');
  }

  /**
   * Reset base filter state for a specific table context.
   */
  resetBaseFilterState(sourceTable?: string, sourceDatabase?: string): void {
    const state = this.getStateFor(sourceTable, sourceDatabase);
    state.hash = '';
    state.configs = {};
    console.log(`🔄 Base filter state reset (${this.lastContextKey})`);
  }
  
  /**
   * Get statistics for debugging
   */
  getStats(): {
    baseFilterColumnCount: number;
    baseFilterColumns: string[];
    currentBaseFilterHash: string;
    storedBaseFilterCount: number;
    contextCount: number;
    currentContextKey: string;
  } {
    const state = this.baseFilterStateByContext.get(this.lastContextKey);
    return {
      baseFilterColumnCount: this.baseFilterColumns.size,
      baseFilterColumns: Array.from(this.baseFilterColumns),
      currentBaseFilterHash: state?.hash || '',
      storedBaseFilterCount: state ? Object.keys(state.configs).length : 0,
      contextCount: this.baseFilterStateByContext.size,
      currentContextKey: this.lastContextKey,
    };
  }
}

// Export singleton instance
export const filterTierManager = new FilterTierManager();

// Also export the class for testing
export { FilterTierManager };

