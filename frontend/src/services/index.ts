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

