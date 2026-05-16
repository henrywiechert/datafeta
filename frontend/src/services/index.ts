// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Services Index
 * 
 * Legacy aggregate export kept for compatibility.
 *
 * Import convention: new code should import service singletons/helpers from
 * their concrete modules (for example `services/queryExecutionOrchestrator`)
 * so cache, API, and local-execution dependencies remain explicit.
 */

// DuckDB WASM Service - local SQL engine
export { duckdbService, DuckDBService } from './duckdbService';
export type { QueryResult as DuckDBQueryResult, DuckDBInitStatus } from './duckdbService';

// Column Cache Manager - column-level incremental caching
export { columnCacheManager, ColumnCacheManager } from './columnCacheManager';
export type { CachedColumnInfo, ColumnCacheStats, LocalCacheHandle } from './columnCacheManager';

// Filter Tier Manager - base vs refinement filter tracking
export { filterTierManager, FilterTierManager } from './filterTierManager';
export type { FilterTier, FilterTierConfig, TieredFilter } from './filterTierManager';

// Query Decision Engine - determines query strategy
export { queryDecisionEngine, QueryDecisionEngine } from './queryDecisionEngine';
export type { QueryStrategy, QueryDecision, QueryDecisionInput } from './queryDecisionEngine';

// Query Execution Orchestrator - centralizes local/remote execution
export { queryExecutionOrchestrator, QueryExecutionOrchestrator } from './queryExecutionOrchestrator';
export type { QueryExecutionOrchestratorInput, OrchestratedQueryResult, PointBudgetOptions } from './queryExecutionOrchestrator';

// Local SQL builder helpers
export {
  quoteIdent,
  buildNumericExpr,
  buildMeasureExpr,
  buildSelectSql,
  buildAggregateSql,
  applyPointBudgetSql,
  applyLineBudgetSql,
} from './localSqlBuilder';

// Arrow adapters/utilities
export { arrowTableToRows, normalizeArrowValue } from './arrowResultAdapter';

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

