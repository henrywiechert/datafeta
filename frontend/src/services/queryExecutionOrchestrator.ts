import { apiService } from '../apiService';
import { QueryDescription } from '../types';
import { duckdbService } from './duckdbService';
import { columnCacheManager } from './columnCacheManager';
import { filterTierManager } from './filterTierManager';
import { queryDecisionEngine, QueryDecision } from './queryDecisionEngine';
import {
  applyPointBudgetSql,
  applyLineBudgetSql,
  buildAggregateSql,
  buildDuckDbDateTimePartSelectItem,
  buildSelectSql,
  SelectItem,
} from './localSqlBuilder';
import { arrowTableToRows } from './arrowResultAdapter';
import { logSqlQuery } from '../devtools/queryLog';

export interface PointBudgetOptions {
  isPointChart: boolean;
  isScatter?: boolean;
  stratifyField?: string;
  maxPoints: number;
  minPerStratum: number;
  strategy?: 'none' | 'random' | 'stratified' | 'preserve_extremes';
  preserveFields?: string[];
  // For aggregated line charts: limit result rows with preserved min/max
  lineBudgetMaxRows?: number;
  // All continuous fields (X dimension + Y measures) to preserve extremes for
  continuousFields?: string[];
}

export interface QueryExecutionOrchestratorInput {
  /** Query description representing the user's intended view (dimensions/measures/aggregations). */
  viewQueryDesc: QueryDescription;
  /** Query description used for backend fetching (may be a raw slice for caching). */
  fetchQueryDesc: QueryDescription;
  /** Needed for cache routing and invalidation */
  selectedTable: string;
  selectedDatabase?: string;
  /** Full filter configs (tiering logic runs inside decision engine) */
  filterConfigurations: Record<string, any>;
  /** Required output columns (dims output names + measure source fields) */
  requiredColumns: string[];
  requiresAggregation: boolean;
  /** For pre-aggregation decision */
  dimensions: string[];
  /** Base/refinement split already computed by caller for building raw slice and local WHERE */
  baseFilterConfigs: Record<string, any>;
  refinementFilterConfigs: Record<string, any>;
  pointBudget: PointBudgetOptions;
  signal?: AbortSignal;
}

export interface OrchestratedQueryResult {
  result: any;
  decision?: QueryDecision;
}

/**
 * Central orchestrator that encapsulates:
 * - query decision (cache hit vs fetch)
 * - Arrow fetch for caching
 * - caching into DuckDB (column cache)
 * - local SQL execution (refinement filters, aggregation, point budget)
 *
 * UI hooks should call this and keep only dispatch/validation logic locally.
 */
class QueryExecutionOrchestrator {
  private _getDimOutputName(d: any): string {
    return d?.date_part && d?.date_mode ? `${d.field}_${d.date_part}_${d.date_mode}` : d.field;
  }

  private _selectItemKey(item: SelectItem): string {
    return item.kind === 'expr' ? item.alias : (item.alias || item.column);
  }

  private _dedupeSelectItemsPreserveOrder(items: SelectItem[]): SelectItem[] {
    const out: SelectItem[] = [];
    const seen = new Set<string>();
    for (const it of items) {
      const key = this._selectItemKey(it);
      if (!seen.has(key)) {
        out.push(it);
        seen.add(key);
      }
    }
    return out;
  }

  private _dedupePreserveOrder(values: string[]): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const v of values) {
      if (!seen.has(v)) {
        out.push(v);
        seen.add(v);
      }
    }
    return out;
  }

  private _buildLocalDimensionSelectItems(dimensions: any[] | undefined): SelectItem[] {
    const dims = dimensions || [];
    const items = dims.map((d: any): SelectItem => {
      if (d?.date_part && d?.date_mode) {
        return buildDuckDbDateTimePartSelectItem({
          field: d.field,
          datePart: d.date_part,
          dateMode: d.date_mode,
        });
      }
      return { kind: 'column', column: d.field };
    });
    return this._dedupeSelectItemsPreserveOrder(items);
  }

  /**
   * Columns we must have present in the local cache to compute the current view.
   * For datetime parts, this is the *base datetime column* (we compute parts locally).
   */
  private _getCacheRequiredColumns(viewQueryDesc: QueryDescription): string[] {
    const dimBaseCols = (viewQueryDesc.dimensions || []).map((d: any) => d.field);
    const measureCols = (viewQueryDesc.measures || [])
      .map((m: any) => m.field)
      .filter((f: any) => typeof f === 'string' && f !== '*');
    return this._dedupePreserveOrder([...dimBaseCols, ...measureCols]);
  }

  async execute(input: QueryExecutionOrchestratorInput): Promise<OrchestratedQueryResult> {
    const {
      viewQueryDesc,
      fetchQueryDesc,
      selectedTable,
      selectedDatabase,
      filterConfigurations,
      requiredColumns: _requiredColumns,
      requiresAggregation,
      dimensions,
      baseFilterConfigs,
      refinementFilterConfigs,
      pointBudget,
      signal,
    } = input;

    // If DuckDB isn't ready, fall back to Arrow endpoint.
    if (!duckdbService.isReady) {
      const res = await apiService.executeQueryArrow(viewQueryDesc, signal);
      return { result: res };
    }

    // For local execution, cache requirements are based on *base* columns, not derived datetime-part aliases.
    const cacheRequiredColumns = this._getCacheRequiredColumns(viewQueryDesc);

    const decision = await queryDecisionEngine.decide({
      sourceTable: selectedTable,
      sourceDatabase: selectedDatabase || undefined,
      requiredColumns: cacheRequiredColumns,
      filterConfigurations,
      requiresAggregation,
      dimensions,
      virtualTable: (viewQueryDesc as any).virtual_table,
      virtualColumns: (viewQueryDesc as any).virtual_columns,
    });

    // Cache-hit: query locally (refinement filters only).
    if (decision.strategy === 'cache_hit' && !decision.requiresBackendQuery) {
      const cacheTableName = columnCacheManager.getCacheTableName(
        selectedTable,
        selectedDatabase || undefined,
        decision.baseFilterHash
      );

      if (cacheTableName) {
        const refinementWhere = filterTierManager.buildRefinementWhereClause(refinementFilterConfigs);
        const dimSelectItems = this._buildLocalDimensionSelectItems(viewQueryDesc.dimensions as any);

        let localSql = '';
        if (!viewQueryDesc.measures || viewQueryDesc.measures.length === 0) {
          localSql = buildSelectSql({
            tableName: cacheTableName,
            selectItems: dimSelectItems,
            whereClause: refinementWhere || undefined,
          });
        } else {
          localSql = buildAggregateSql({
            tableName: cacheTableName,
            dimensionSelectItems: dimSelectItems,
            measures: (viewQueryDesc.measures || []) as any,
            whereClause: refinementWhere || undefined,
          });
        }

        if (pointBudget.isPointChart && localSql) {
          localSql = applyPointBudgetSql(localSql, {
            stratifyField: pointBudget.stratifyField || undefined,
            maxRows: pointBudget.maxPoints,
            minPerStratum: pointBudget.minPerStratum,
            strategy: pointBudget.strategy,
            preserveFields: pointBudget.preserveFields,
          });
        } else if (pointBudget.lineBudgetMaxRows && pointBudget.continuousFields?.length && localSql) {
          // Apply line budget for aggregated queries with continuous fields
          localSql = applyLineBudgetSql(localSql, {
            maxRows: pointBudget.lineBudgetMaxRows,
            continuousFields: pointBudget.continuousFields,
          });
        }

        logSqlQuery({
          origin: 'local',
          sql: localSql,
          label: 'DuckDB (cache_hit)',
          meta: {
            selectedTable,
            selectedDatabase,
            baseFilterHash: decision.baseFilterHash,
            decision: { strategy: decision.strategy, reason: decision.reason },
          },
        });

        const localResult = await duckdbService.query(localSql);
        return {
          decision,
          result: {
            columns: localResult.columns.map((c) => ({ name: c, type: 'unknown' })),
            rows: localResult.rows,
            row_count: localResult.rows.length,
            query_sql: localSql,
            local_query: true,
          },
        };
      }

      // Cache table missing unexpectedly; force remote below.
      decision.requiresBackendQuery = true;
    }

    // Backend query required:
    // - For raw_columns we fetch a raw slice (base filters only), cache it, and locally aggregate if needed.
    // - For pre_aggregated we just return backend Arrow->rows result.
    const arrowResult = await apiService.executeQueryArrowRaw(fetchQueryDesc, signal);

    // Cache only when we are building/refreshing a local raw slice (below threshold).
    if (decision.strategy === 'raw_columns' && arrowResult.arrowTable && arrowResult.arrowTable.numRows > 0) {
      try {
        await columnCacheManager.cacheColumns(
          selectedTable,
          selectedDatabase || undefined,
          decision.baseFilterHash,
          arrowResult.arrowTable
        );

        // Update base filters after successful cache
        filterTierManager.updateBaseFilters(filterConfigurations, selectedTable, selectedDatabase || undefined);
      } catch (cacheError) {
        console.warn('⚠️ Failed to cache in DuckDB:', cacheError);
      }
    }

    // If the current view needs aggregation and we fetched a raw slice, compute locally.
    if (decision.strategy === 'raw_columns' && requiresAggregation) {
      const cacheTableName = columnCacheManager.getCacheTableName(
        selectedTable,
        selectedDatabase || undefined,
        decision.baseFilterHash
      );
      if (cacheTableName) {
        const refinementWhere = filterTierManager.buildRefinementWhereClause(refinementFilterConfigs);
        const dimSelectItems = this._buildLocalDimensionSelectItems(viewQueryDesc.dimensions as any);

        let localAggSql = buildAggregateSql({
          tableName: cacheTableName,
          dimensionSelectItems: dimSelectItems,
          measures: (viewQueryDesc.measures || []) as any,
          whereClause: refinementWhere || undefined,
        });

        // Apply point/line budget for local aggregation (same as cache_hit path)
        if (pointBudget.isPointChart && localAggSql) {
          localAggSql = applyPointBudgetSql(localAggSql, {
            stratifyField: pointBudget.stratifyField || undefined,
            maxRows: pointBudget.maxPoints,
            minPerStratum: pointBudget.minPerStratum,
            strategy: pointBudget.strategy,
            preserveFields: pointBudget.preserveFields,
          });
        } else if (pointBudget.lineBudgetMaxRows && pointBudget.continuousFields?.length && localAggSql) {
          localAggSql = applyLineBudgetSql(localAggSql, {
            maxRows: pointBudget.lineBudgetMaxRows,
            continuousFields: pointBudget.continuousFields,
          });
        }

        logSqlQuery({
          origin: 'local',
          sql: localAggSql,
          label: 'DuckDB (local_aggregate)',
          meta: {
            selectedTable,
            selectedDatabase,
            baseFilterHash: decision.baseFilterHash,
            decision: { strategy: decision.strategy, reason: decision.reason },
          },
        });

        const localAgg = await duckdbService.query(localAggSql);
        return {
          decision,
          result: {
            columns: localAgg.columns.map((c) => ({ name: c, type: 'unknown' })),
            rows: localAgg.rows,
            row_count: localAgg.rows.length,
            query_sql: localAggSql,
            local_query: true,
          },
        };
      }
    }

    // Otherwise, convert Arrow table to the standard result format (row-oriented).
    const columns = arrowResult.columns;
    const rows = arrowTableToRows(arrowResult.arrowTable);

    return {
      decision,
      result: {
        columns,
        rows,
        row_count: arrowResult.rowCount,
        query_sql: arrowResult.querySql,
      },
    };
  }
}

export const queryExecutionOrchestrator = new QueryExecutionOrchestrator();
export { QueryExecutionOrchestrator };


