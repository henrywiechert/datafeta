/**
 * Services Index
 * 
 * Export all service modules for easy importing.
 */

// DuckDB WASM Service - local SQL engine
export { duckdbService, DuckDBService } from './duckdbService';
export type { QueryResult as DuckDBQueryResult, DuckDBInitStatus } from './duckdbService';

// Cache Manager - tracks cached data in DuckDB WASM
export { 
  cacheManager, 
  CacheManager, 
  generateFilterHash,
  shouldQueryLocally,
} from './cacheManager';
export type { CachedTableInfo, CacheFilterState, CacheStats } from './cacheManager';

// Column Cache Manager - column-level incremental caching
export { columnCacheManager, ColumnCacheManager } from './columnCacheManager';
export type { CachedColumnInfo, ColumnCacheStats } from './columnCacheManager';

// Filter Tier Manager - base vs refinement filter tracking
export { filterTierManager, FilterTierManager } from './filterTierManager';
export type { FilterTier, FilterTierConfig, TieredFilter } from './filterTierManager';

// Query Decision Engine - determines query strategy
export { queryDecisionEngine, QueryDecisionEngine } from './queryDecisionEngine';
export type { QueryStrategy, QueryDecision, QueryDecisionInput } from './queryDecisionEngine';

// Chart Query Service - per-chart local queries
export { chartQueryService, ChartQueryService } from './chartQueryService';
export type { 
  ChartQueryOptions, 
  ChartQueryResult, 
  RoundingPrecision,
} from './chartQueryService';

// Optimization Hint Generator (existing)
export { 
  generateOptimizationHints,
  generateOptimizationHintsFromFields,
} from './optimizationHintGenerator';
export type { OptimizationPreference } from './optimizationHintGenerator';

// Configuration Service (existing)
export { 
  exportConfiguration,
  importConfiguration,
  validateConfiguration,
  sanitizeConnectionDetails,
  saveConfigFile,
  downloadConfigFile,
  readFileAsText,
  reconstructConnectionDetails,
} from './configurationService';

