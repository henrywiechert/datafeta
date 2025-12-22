/**
 * Filter Tier Manager
 * 
 * Manages two tiers of filters:
 * - Base filters: Changes trigger backend re-query and cache invalidation
 * - Refinement filters: Applied locally via DuckDB WASM WHERE clause
 * 
 * This enables efficient local filtering without re-fetching data from backend
 * while still supporting complex filter scenarios.
 */

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

class FilterTierManager {
  // Set of column names that are treated as base filters
  private baseFilterColumns: Set<string> = new Set();
  
  // Cached hash of current base filter state
  private currentBaseFilterHash: string = '';
  
  // Stored base filter configurations
  private baseFilterConfigs: Record<string, any> = {};
  
  // Callback for base filter changes
  private onBaseFilterChange?: () => void;
  
  /**
   * Configure which columns are treated as base filters
   * 
   * @param columns - Column names to treat as base filters
   */
  setBaseFilterColumns(columns: string[]): void {
    this.baseFilterColumns = new Set(columns);
    console.log(`🔧 Base filter columns set: ${columns.join(', ')}`);
  }
  
  /**
   * Add a column as a base filter
   */
  addBaseFilterColumn(columnName: string): void {
    this.baseFilterColumns.add(columnName);
    console.log(`🔧 Added base filter column: ${columnName}`);
  }
  
  /**
   * Remove a column from base filters (becomes refinement)
   */
  removeBaseFilterColumn(columnName: string): void {
    this.baseFilterColumns.delete(columnName);
    console.log(`🔧 Removed base filter column: ${columnName}`);
  }
  
  /**
   * Check if a column is a base filter
   */
  isBaseFilter(columnName: string): boolean {
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
  getFilterTier(columnName: string): FilterTier {
    return this.isBaseFilter(columnName) ? 'base' : 'refinement';
  }
  
  /**
   * Set callback for base filter changes
   */
  setOnBaseFilterChange(callback: () => void): void {
    this.onBaseFilterChange = callback;
  }
  
  /**
   * Categorize all filters into base and refinement
   */
  categorizeFilters(filterConfigurations: Record<string, any>): {
    baseFilters: Record<string, any>;
    refinementFilters: Record<string, any>;
  } {
    const baseFilters: Record<string, any> = {};
    const refinementFilters: Record<string, any> = {};
    
    for (const [key, config] of Object.entries(filterConfigurations)) {
      const columnName = config.columnName || key;
      
      if (this.isBaseFilter(columnName)) {
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
  getBaseFiltersOnly(filterConfigurations: Record<string, any>): Record<string, any> {
    return this.categorizeFilters(filterConfigurations).baseFilters;
  }
  
  /**
   * Get only the refinement filters from a filter configuration
   */
  getRefinementFilters(filterConfigurations: Record<string, any>): Record<string, any> {
    return this.categorizeFilters(filterConfigurations).refinementFilters;
  }
  
  /**
   * Generate a hash for the base filter state
   */
  hashFilters(filters: Record<string, any>): string {
    if (Object.keys(filters).length === 0) {
      return '';
    }
    
    // Sort keys for consistent hashing
    const sortedJson = JSON.stringify(filters, Object.keys(filters).sort());
    
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
  getBaseFilterHash(): string {
    return this.currentBaseFilterHash;
  }
  
  /**
   * Check if base filters have changed since last update
   */
  hasBaseFilterChanged(filterConfigurations: Record<string, any>): boolean {
    const baseFilters = this.getBaseFiltersOnly(filterConfigurations);
    const newHash = this.hashFilters(baseFilters);
    
    return newHash !== this.currentBaseFilterHash;
  }
  
  /**
   * Update stored base filter state
   * Call this after fetching data with new base filters
   */
  updateBaseFilters(filterConfigurations: Record<string, any>): void {
    const baseFilters = this.getBaseFiltersOnly(filterConfigurations);
    const oldHash = this.currentBaseFilterHash;
    this.currentBaseFilterHash = this.hashFilters(baseFilters);
    this.baseFilterConfigs = { ...baseFilters };
    
    if (oldHash !== this.currentBaseFilterHash) {
      console.log(`🔄 Base filter hash updated: ${oldHash || '(empty)'} → ${this.currentBaseFilterHash || '(empty)'}`);
      this.onBaseFilterChange?.();
    }
  }
  
  /**
   * Get the stored base filter configurations
   */
  getStoredBaseFilters(): Record<string, any> {
    return { ...this.baseFilterConfigs };
  }
  
  /**
   * Build a DuckDB WHERE clause for refinement filters
   * 
   * @param refinementFilters - The refinement filter configurations
   * @returns SQL WHERE clause string (without 'WHERE' keyword)
   */
  buildRefinementWhereClause(refinementFilters: Record<string, any>): string {
    const conditions: string[] = [];
    
    for (const [_key, config] of Object.entries(refinementFilters)) {
      const columnName = config.columnName;
      
      if (!columnName) continue;
      
      // Handle different filter types
      if (config.type === 'discrete') {
        // Discrete filter: IN clause
        const selectedValues = config.selectedValues || [];
        if (selectedValues.length > 0) {
          const quotedValues = selectedValues.map((v: any) => 
            typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : v
          );
          conditions.push(`"${columnName}" IN (${quotedValues.join(', ')})`);
        }
      } else if (config.type === 'continuous' || config.type === 'range') {
        // Range filter: BETWEEN or >= / <=
        const min = config.minValue ?? config.min;
        const max = config.maxValue ?? config.max;
        
        if (min !== undefined && max !== undefined) {
          conditions.push(`"${columnName}" BETWEEN ${min} AND ${max}`);
        } else if (min !== undefined) {
          conditions.push(`"${columnName}" >= ${min}`);
        } else if (max !== undefined) {
          conditions.push(`"${columnName}" <= ${max}`);
        }
      } else if (config.type === 'datetime') {
        // DateTime filter
        if (config.startDate && config.endDate) {
          conditions.push(`"${columnName}" BETWEEN '${config.startDate}' AND '${config.endDate}'`);
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
    this.currentBaseFilterHash = '';
    this.baseFilterConfigs = {};
    console.log('🔄 Filter tier manager reset');
  }
  
  /**
   * Get statistics for debugging
   */
  getStats(): {
    baseFilterColumnCount: number;
    baseFilterColumns: string[];
    currentBaseFilterHash: string;
    storedBaseFilterCount: number;
  } {
    return {
      baseFilterColumnCount: this.baseFilterColumns.size,
      baseFilterColumns: Array.from(this.baseFilterColumns),
      currentBaseFilterHash: this.currentBaseFilterHash,
      storedBaseFilterCount: Object.keys(this.baseFilterConfigs).length,
    };
  }
}

// Export singleton instance
export const filterTierManager = new FilterTierManager();

// Also export the class for testing
export { FilterTierManager };

