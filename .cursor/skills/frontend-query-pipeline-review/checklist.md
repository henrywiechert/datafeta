# Frontend Query Pipeline Review — Investigation Checklist

Use while executing Steps 2–9 of [SKILL.md](SKILL.md). Skip irrelevant rows and note why.
All grep examples assume `cd frontend`. Prefer the workspace search tools when available.

## Map the pipeline

```bash
# Public entry points and who calls the orchestrator
rg "queryExecutionOrchestrator|\.execute\(" src --glob '*.{ts,tsx}' -l
rg "viewQueryDesc|fetchQueryDesc" src/services -n
# The two query descriptions must not be conflated
rg "QueryDescription" src/queryBuilder src/components/Visualization/ChartArea/hooks -n
```

## Routing decision (queryDecisionEngine.ts)

- [ ] `DEFAULT_SIZE_THRESHOLD` comparison direction is correct (≤ → local aggregate)
- [ ] `estimatedRowCount` reflects the post-base-filter slice, not whole-table
- [ ] `ROW_COUNT_CACHE_TTL` cannot route a now-large slice locally after a base-filter change
- [ ] `cache_hit` requires *all* required columns present for the *current* base-filter hash
- [ ] `requiresAggregation` derived from requested measures/aggs, not a lossy heuristic

```bash
rg "DEFAULT_SIZE_THRESHOLD|sizeThreshold|estimatedRowCount" src/services/queryDecisionEngine.ts -n
rg "rowCountCache|ROW_COUNT_CACHE_TTL|row-count|/row.?count" src/services -n
rg "cache_hit|cachedColumns|columnsToFetch|requiresBackendQuery" src/services/queryDecisionEngine.ts -n
```

## Cache keying & invalidation (columnCacheManager.ts)

- [ ] Cache key includes database, table, baseFilterHash, and virtual-table/column identity
- [ ] `cacheColumns()` whole-slice replacement cannot leave a `cache_hit` for a never-stored column
- [ ] Base-filter change, table/connection switch, and `resetBus` all drop/re-key the slice
- [ ] DuckDB DDL/identifier quoting handles dotted ClickHouse column names

```bash
rg "baseFilterHash|cacheKey|tableNames|duckdbTableName" src/services/columnCacheManager.ts -n
rg "cacheColumns|invalidate|clear|drop" src/services/columnCacheManager.ts -n
rg "resetBus|connection:reset" src/services -n
rg "virtualTable|virtualColumns" src/services/queryDecisionEngine.ts src/services/columnCacheManager.ts -n
```

## Filter tiering (filterTierManager.ts)

- [ ] Automatic (cache-state) tiering is authoritative; legacy `baseFilterColumns` not silently overriding
- [ ] Base-filter state scoped per `(database, table)`
- [ ] Base-filter hash deterministic across reordering / stable inputs
- [ ] Refinement filter columns are guaranteed present in the cached slice

```bash
rg "baseFilterColumns|FilterTier|refinement|base" src/services/filterTierManager.ts -n
rg "filtersToHashKey|sheetConfigHash|effectiveFilters" src/utils src/components/Visualization/ChartArea -n
```

## Local/backend aggregation parity (localSqlBuilder.ts vs backend)

- [ ] `buildAggregateSql` AVG/COUNT/SUM/null semantics match backend dialect
- [ ] `_getDimOutputName` GROUP BY keys match backend grouping (incl. date_part/date_mode)
- [ ] `buildDuckDbDateTimePartSelectItem` matches backend `ExtractTerm` / date_trunc boundaries
- [ ] Select-item dedup (`_dedupeSelectItemsPreserveOrder`) cannot collapse distinct exprs sharing an alias
- [ ] Integer overflow / decimal precision parity

```bash
rg "buildAggregateSql|buildSelectSql|SelectItem" src/services/localSqlBuilder.ts -n
rg "_getDimOutputName|_dedupeSelectItems|date_part|date_mode" src/services/queryExecutionOrchestrator.ts -n
rg "buildDuckDbDateTimePart|date_trunc|extract" src/services/localSqlBuilder.ts src/datetime -n
# Cross-check the backend grouping/aggregation for the same semantics
rg "Extract|date_trunc|AVG|COUNT|SUM" ../backend/services/query_components -n
```

## Arrow decoding fidelity (arrowResultAdapter.ts)

- [ ] Numeric coercion only where charts expect numbers; non-numeric strings untouched
- [ ] BigInt > MAX_SAFE_INTEGER preserved (not rounded) in adapter AND duckdbService
- [ ] Null preserved as null (not 0 / '')
- [ ] `unwrapQuoted` cannot corrupt a legitimately quoted category value
- [ ] `isAggregateField` prefix match cannot misclassify a dimension named like `summary`

```bash
rg "coerceNumericString|isNumericArrowType|NUMERIC_TYPE_IDS|unwrapQuoted|isAggregateField" src/services/arrowResultAdapter.ts -n
rg "BigInt|MAX_SAFE_INTEGER|Number\(" src/services/arrowResultAdapter.ts src/services/duckdbService.ts -n
```

## Budget reduction & sampling (orchestrator)

- [ ] Sampling preserves min/max of `preserveFields` / `continuousFields`
- [ ] Sampling is deterministic across repeated renders (stable order/seed)
- [ ] Stratified sampling honors `min_per_stratum`
- [ ] Budget applies to the correct stage (raw points vs aggregated rows)

```bash
rg "applyPointBudgetSql|applyLineBudgetSql|PointBudgetOptions|preserveFields|min_per_stratum|stratify" src/services -n
rg "ORDER BY|RANDOM|sample|LIMIT" src/services/localSqlBuilder.ts -n
```

## Concurrency, abort & dedup

- [ ] `AbortSignal` reaches the apiService fetch AND abandons subsequent DuckDB work
- [ ] Latest dispatched query wins (fingerprint/`queryVersion`), not last to return
- [ ] Concurrent local queries serialized / namespaced (single DuckDB worker)

```bash
rg "AbortSignal|signal|abort" src/services/queryExecutionOrchestrator.ts src/apiService.ts -n
rg "useQueryFingerprint|queryVersion|fingerprint|dedupe" src/components/Visualization/ChartArea/hooks -n
```

## DuckDB lifecycle & resources (duckdbService.ts)

- [ ] Concurrent `initialize()` converges on one instance (single in-flight init promise)
- [ ] Blob object URL revoked + worker terminated on teardown
- [ ] Old slices dropped / evicted (no unbounded table growth)
- [ ] Local query failure falls back to backend path (not empty/errored chart)

```bash
rg "initialize|initStatus|initializing|createWorkerFromUrl|createObjectURL|revokeObjectURL|terminate" src/services/duckdbService.ts -n
rg "catch|fallback|backend" src/services/queryExecutionOrchestrator.ts -n
```

## Doc/code drift to confirm

- [ ] `DUCKDB_WASM.md` strategy/threshold description matches `queryDecisionEngine.ts`
- [ ] "Column cache" naming — confirm it is whole-slice replacement, not incremental
- [ ] `QUERY_BUILDER.md` `QueryDescription` shape matches `queryBuilder.ts`
- [ ] Removed `cacheManager.ts` / `chartQueryService.ts` references in docs vs actual files

## Verification gaps to mention in report

- [ ] No automated parity test comparing local-DuckDB results vs backend results for the same view
- [ ] No test for cache-key collision / cross-view contamination
- [ ] No test for abort superseding an in-flight local query
- [ ] Check existing tests: `queryDecisionEngine.test.ts`, `queryExecutionOrchestrator.test.ts`, `localSqlBuilder.test.ts`, `arrowResultAdapter.test.ts`, `filterTierManager.test.ts`, `duckdbService.test.ts`
