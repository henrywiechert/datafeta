---
name: frontend-query-pipeline-review
description: >-
  Reviews the frontend's hybrid query & execution pipeline: the
  backend-vs-local-DuckDB routing decision, base/refinement filter tiering,
  column-slice caching and invalidation, local SQL generation, Arrow result
  decoding, point/line budget reduction, and request concurrency/abort handling.
  The central concern is data correctness — that the local-DuckDB path produces
  the same results as the backend path, that cache keys invalidate correctly, and
  that Arrow decoding preserves values. Use when the user asks for a review of the
  query pipeline, DuckDB caching, hybrid execution, filter tiering, SQL
  generation, or Arrow/result handling. This is distinct from
  frontend-architecture-review (structure/cycles/wiring/Observable Plot) and
  frontend-react-review (render perf, idioms, a11y).
---

# Frontend Query Pipeline Review

Review the frontend's **query and execution pipeline** as a senior staff engineer.
This skill is about **data correctness and execution behavior**, not component
structure or render performance. A bug here is silent wrong data on a chart, not
a layout glitch — so the bar for evidence is high.

If the target frontend has no local-execution layer (no DuckDB WASM / no
hybrid backend-vs-local routing), stop and tell the user this skill does not
apply; point them at `frontend-architecture-review` instead.

Focus on:

- **Routing decision** — backend aggregation vs raw-slice-fetch-then-local-aggregate vs cache hit.
- **Filter tiering** — base filters (force backend re-fetch + cache invalidation) vs refinement filters (local WHERE).
- **Caching & invalidation** — column-slice cache keying, base-filter-hash correctness, staleness.
- **Local/backend parity** — does the local DuckDB SQL produce the *same* aggregates the backend would?
- **Arrow decoding fidelity** — numeric coercion, BigInt, nulls, dotted ClickHouse column names, quoting.
- **Budget reduction & sampling** — point/line budgets preserving extremes and axis domains.
- **Concurrency** — abort propagation, out-of-order responses, query fingerprint/version dedup.

## Scope

- Default target: `frontend/src/services/` plus `frontend/src/queryBuilder/`, `frontend/src/viewPlanner/`, and the query hooks under `frontend/src/components/Visualization/ChartArea/hooks/`.
- **Read the architecture docs first** — they are maintained and largely match the code, but verify against source:
  - [frontend/DUCKDB_WASM.md](../../../frontend/DUCKDB_WASM.md) — pipeline overview, service components, strategy selection, cache keying.
  - [frontend/queryBuilder/QUERY_BUILDER.md](../../../frontend/src/queryBuilder/QUERY_BUILDER.md) — how a `QueryDescription` is assembled.
  - [frontend/ARROW.md](../../../frontend/ARROW.md) — Arrow transport and decoding expectations.
  - [frontend/api.md](../../../frontend/api.md) — backend endpoints (`/query`, `/row-count`) the pipeline calls.
- Key source modules (verify each one, do not trust the doc):
  - [services/queryDecisionEngine.ts](../../../frontend/src/services/queryDecisionEngine.ts) — strategy selection + row-count probe cache.
  - [services/queryExecutionOrchestrator.ts](../../../frontend/src/services/queryExecutionOrchestrator.ts) — end-to-end decision → fetch → cache → local exec.
  - [services/columnCacheManager.ts](../../../frontend/src/services/columnCacheManager.ts) — slice cache keyed by `(database, table, baseFilterHash)`.
  - [services/filterTierManager.ts](../../../frontend/src/services/filterTierManager.ts) — base vs refinement tiering, per-`(db, table)` scope.
  - [services/localSqlBuilder.ts](../../../frontend/src/services/localSqlBuilder.ts) — local DuckDB SQL generation.
  - [services/duckdbService.ts](../../../frontend/src/services/duckdbService.ts) — WASM lifecycle, worker/blob, BigInt handling.
  - [services/arrowResultAdapter.ts](../../../frontend/src/services/arrowResultAdapter.ts) — Arrow → row records, numeric coercion.
  - [services/optimizationHintGenerator.ts](../../../frontend/src/services/optimizationHintGenerator.ts) — hints sent to the backend.
- If any listed doc is missing or unreadable, note it under doc/code drift and proceed using code evidence only; do not block the review.
- **Review evidence in code**, not docs alone — the docs explicitly flag that several names are aspirational (e.g. "column cache" is whole-slice replacement, not incremental). Cite path:line for every significant finding.
- Quote at most 5–10 lines per finding; for larger structures cite path:line-range only. Target a report under ~2000 words.
- Do **not** refactor or fix unless the user asks. This skill produces a review report.

## Workflow

Copy and track progress:

```
Query Pipeline Review Progress:
- [ ] Step 1: Map the pipeline and its public entry points
- [ ] Step 2: Audit the routing decision engine
- [ ] Step 3: Audit cache keying and invalidation
- [ ] Step 4: Audit filter tiering
- [ ] Step 5: Verify local/backend aggregation parity
- [ ] Step 6: Verify Arrow decoding fidelity
- [ ] Step 7: Audit budget reduction and sampling
- [ ] Step 8: Audit concurrency, abort, and dedup
- [ ] Step 9: Audit DuckDB lifecycle and resource cleanup
- [ ] Step 10: Synthesize prioritized findings
- [ ] Step 11: Deliver report
```

### Step 1: Map the pipeline and its public entry points

Establish the data path before judging any stage. The intended flow:

```
useQueryExecution (ChartArea hook)
  → useQueryBuilder        → QueryDescription (view intent: dims/measures/aggs)
  → useQueryExecutor       → queryExecutionOrchestrator.execute(...)
        → queryDecisionEngine.decide()   → { strategy, columnsToFetch, requiresBackendQuery }
        → apiService (/query Arrow fetch) when backend needed
        → columnCacheManager.cacheColumns()  (store raw slice in DuckDB)
        → localSqlBuilder + duckdbService     (refinement WHERE, GROUP BY, budget)
        → arrowResultAdapter / duckdb rows    → QueryResult
```

Identify:

1. **The single orchestration entry** — confirm UI hooks call `queryExecutionOrchestrator` and keep only dispatch/validation locally (the orchestrator's stated contract).
2. **`viewQueryDesc` vs `fetchQueryDesc`** — the orchestrator takes *two* query descriptions: the user's view intent and the (possibly raw-slice) fetch. Confirm they are not conflated; a raw slice must still produce the view's aggregation locally.
3. **Decision/execution seam** — `queryDecisionEngine` should be pure-ish strategy logic; side effects (fetch, cache writes, DuckDB exec) belong to the orchestrator. Flag leaks.

### Step 2: Audit the routing decision engine

[queryDecisionEngine.ts](../../../frontend/src/services/queryDecisionEngine.ts) picks `'raw_columns' | 'pre_aggregated' | 'cache_hit'`.

- **Threshold correctness** — `DEFAULT_SIZE_THRESHOLD` gates local vs backend aggregation. Confirm the comparison direction (≤ threshold → local) and that the probed `estimatedRowCount` is the *post-base-filter* size, not the whole table.
- **Row-count probe staleness** — the engine caches probe results (`rowCountCache`, `ROW_COUNT_CACHE_TTL`). Probe what invalidates it: does a base-filter change or a data refresh bust the entry, or can a 5-minute-stale count route a now-huge slice to the local path?
- **Cache-hit soundness** — `cache_hit` must require that *all* required columns are present in the slice for the *current* base-filter hash. A hit on a stale or partial slice is silent wrong data.
- **Aggregation flag** — `requiresAggregation` drives pre-aggregation. Confirm it is derived from the measures/aggregations actually requested, not a heuristic that can miss (e.g. a measure with no explicit aggregation).

### Step 3: Audit cache keying and invalidation

[columnCacheManager.ts](../../../frontend/src/services/columnCacheManager.ts) keys slices by `(database, table, baseFilterHash)`.

- **Key completeness** — the cache key must include everything that changes the slice contents: database, table, base-filter hash, **and** virtual-table / virtual-column definitions if those alter the fetched data. A missing key component → cross-contamination between views.
- **Whole-slice replacement** — the doc states this is *not* incremental: `cacheColumns()` replaces the whole DuckDB table for a key. Confirm "missing columns" reasoning in the decision engine cannot return `cache_hit` for a column that a prior narrower fetch never stored.
- **Invalidation triggers** — base-filter change, table/connection switch, and explicit reset (`resetBus`) must drop or re-key the slice. Trace each path; flag any that leaves a stale DuckDB table addressable.
- **Dotted column names** — ClickHouse columns can contain dots (`table.col`). Confirm column tracking and DuckDB table DDL quote identifiers so a dotted name is not split.

### Step 4: Audit filter tiering

[filterTierManager.ts](../../../frontend/src/services/filterTierManager.ts) splits filters into base (backend + invalidation) vs refinement (local WHERE).

- **Tier derivation** — tiering is now *automatic* from cache state (cached column → refinement, uncached → base). Confirm the legacy manual `baseFilterColumns` path is not silently overriding the automatic decision.
- **Per-`(db, table)` scoping** — base-filter state must be scoped per database+table; otherwise switching tables reuses another table's base hash. Verify the scope key.
- **Hash stability** — the base-filter hash must be deterministic across reorderings and referentially stable inputs (compare with the `effectiveFilters` / `sheetConfigHash` stabilization in `ChartArea`). An unstable hash thrashes the cache.
- **Refinement correctness** — a refinement filter is applied as a local DuckDB WHERE on the cached slice. Confirm the slice actually contains the filter column (else the WHERE silently filters nothing or errors).

### Step 5: Verify local/backend aggregation parity

This is the headline correctness risk: the **same chart** can be computed by the backend (PyPika/SQL dialect) or locally (`localSqlBuilder` → DuckDB). They must agree.

- **Aggregate semantics** — compare `buildAggregateSql` against backend aggregation for: `AVG` of integers, `COUNT` vs `COUNT(DISTINCT)`, null handling in `SUM`/`AVG`, and integer overflow. DuckDB and ClickHouse differ on some of these.
- **GROUP BY key derivation** — `_getDimOutputName` builds dim output names (including `date_part`/`date_mode` suffixes). Confirm the local GROUP BY keys match the backend's grouping exactly, including datetime-part extraction (`buildDuckDbDateTimePartSelectItem` vs the backend's `ExtractTerm`).
- **Dedup of select items** — the orchestrator dedups select items/columns (`_dedupeSelectItemsPreserveOrder`). Confirm dedup keys cannot collapse two genuinely different expressions that share an alias.
- **Datetime parity** — cross-check with the datetime layer: UTC vs local, truncation boundaries. A `date_trunc` mismatch produces different buckets locally vs remotely.

### Step 6: Verify Arrow decoding fidelity

[arrowResultAdapter.ts](../../../frontend/src/services/arrowResultAdapter.ts) turns an Arrow table into row records.

- **Numeric coercion** — `coerceNumericString` only coerces known numeric Arrow type ids (or `force`). Confirm string-typed numerics from the backend are coerced where charts expect numbers, and that non-numeric strings are never lossily parsed.
- **BigInt overflow** — both the adapter and `duckdbService` convert BigInt→Number. Confirm integers beyond `Number.MAX_SAFE_INTEGER` are preserved (kept as string) rather than silently rounded.
- **Null vs zero vs empty** — verify nulls survive as null (not coerced to 0 or ''), which matters for domains and "include zero" bar baselines.
- **Quote unwrapping** — `unwrapQuoted` strips up to 3 quote layers. Confirm it cannot corrupt a legitimately quoted string value (e.g. a category literally named `"x"`).
- **Aggregate field detection** — `isAggregateField` does prefix matching on `sum(`/`avg(`/etc. Confirm a user dimension named like `summary` is not misclassified.

### Step 7: Audit budget reduction and sampling

The orchestrator applies point/line budgets (`applyPointBudgetSql`, `applyLineBudgetSql`, `PointBudgetOptions`).

- **Extreme preservation** — sampling must preserve min/max of continuous fields (`preserveFields`, `continuousFields`) so axis domains do not shrink under sampling. Verify the SQL actually keeps extremes, not just a random sample.
- **Determinism** — repeated renders of the same view should sample the same rows (stable ordering / seed), or the chart will jitter between renders.
- **Stratified sampling** — `min_per_stratum` must guarantee each stratum survives; confirm strata with few rows are not dropped.
- **Budget vs aggregation** — confirm budgets apply to the *right* stage (raw points for scatter, aggregated rows for line) and never silently truncate an aggregated result the user expects to be complete.

### Step 8: Audit concurrency, abort, and dedup

- **Abort propagation** — `signal?: AbortSignal` is threaded into the orchestrator. Confirm it reaches the `apiService` fetch *and* aborts/abandons the subsequent DuckDB work, so a superseded query cannot overwrite a newer result.
- **Out-of-order responses** — with multiple in-flight queries, verify the latest dispatched query wins (query fingerprint / `queryVersion` in `useQueryFingerprint` / `ChartArea`), not the last to return.
- **DuckDB serialization** — DuckDB WASM runs in one worker. Confirm concurrent local queries are serialized or namespaced so one query's temp table does not clobber another's.

### Step 9: Audit DuckDB lifecycle and resource cleanup

[duckdbService.ts](../../../frontend/src/services/duckdbService.ts) owns the WASM instance.

- **Init races** — concurrent `initialize()` calls must converge on one instance (single in-flight init promise), not spin up two.
- **Worker/blob cleanup** — the blob-URL worker workaround creates an object URL; confirm it is revoked, and the worker terminated on teardown.
- **Table growth** — cached slices accumulate in DuckDB memory. Probe whether old slices are dropped (eviction / LRU) or grow unbounded across a long session.
- **Failure fallback** — if DuckDB init or a local query throws, confirm the pipeline falls back to the backend path rather than rendering an empty/errored chart.

### Step 10: Synthesize findings

For each finding record: **Severity** (Critical/High/Medium/Low), **Location** (path:line), **Observation** (the pipeline fact), **Impact** (which wrong-data or perf class), **Recommendation** (one sentence).

Balance praise: call out correctness guards already in place (dependency injection in the orchestrator for testability, per-`(db,table)` base-filter scoping, BigInt preservation, abort threading).

### Step 11: Deliver report

Use the output template below. Prefer tables and a pipeline diagram over prose.

## Output template

```markdown
# Frontend Query Pipeline Review — Senior Staff Engineer

## Executive summary
[2–4 sentences: correctness maturity, top data-correctness risks, top strengths]

## Pipeline map
[Decision → fetch → cache → local-exec diagram; where the seams are]

## Routing decision
- … (threshold direction, probe staleness, cache-hit soundness, aggregation flag)

## Cache keying & invalidation
- … (key completeness, whole-slice replacement, invalidation triggers, dotted names)

## Filter tiering
- … (auto vs manual, per-(db,table) scope, hash stability, refinement column presence)

## Local/backend aggregation parity
| Concern | Backend behavior | Local (DuckDB) behavior | Match? | Evidence |
|---------|------------------|-------------------------|--------|----------|

## Arrow decoding fidelity
- … (numeric coercion, BigInt, null/zero, quote unwrap, aggregate detection)

## Budget reduction & sampling
- … (extreme preservation, determinism, stratification, stage correctness)

## Concurrency, abort & dedup
- … (abort propagation, out-of-order, DuckDB serialization)

## DuckDB lifecycle & resources
- … (init races, worker/blob cleanup, table growth, failure fallback)

## Prioritized recommendations
| Priority | Action | Effort |
|----------|--------|--------|
| P0 | … | … |

## Summary
[What to fix first for correctness and why]
```

## Severity guide

| Level | When to use |
|-------|-------------|
| **Critical** | Local path returns different aggregates than backend; `cache_hit` served from a stale/partial slice; cache key missing a component causing cross-view contamination; superseded query overwrites a newer result |
| **High** | Row-count probe staleness routing a huge slice locally; BigInt/numeric coercion silently corrupting values; base-filter hash instability thrashing cache; abort not reaching local exec |
| **Medium** | Sampling that shrinks axis domains; non-deterministic sampling jitter; unbounded DuckDB table growth in long sessions; dotted-column quoting only partially handled |
| **Low** | Naming drift (e.g. "column cache" ≠ incremental), missing fallback log, test-coverage gaps, dead legacy tier code |

## Review principles

1. **Correctness over performance** — a fast wrong number is the worst outcome; lead with parity and cache soundness.
2. **Parity is the contract** — for every local-execution path, name the backend behavior it must match and cite evidence for agreement or divergence.
3. **Keys must be total** — a cache/hash key is correct only if it includes *every* input that changes the cached bytes; enumerate them.
4. **Trust code over names** — the docs flag aspirational names; verify what `cacheColumns`, "incremental", and "column cache" actually do.
5. **Abort is correctness, not just cleanup** — a query that cannot be cancelled can resurrect stale data; trace the signal end to end.
6. **Respect intentional tradeoffs** — whole-slice replacement and a single DuckDB worker may be deliberate; explain the cost, don't assume a bug.

## Additional resources

- Investigation checklist & grep patterns: [checklist.md](checklist.md)
- Companion skills: `frontend-architecture-review` (structure/OP), `frontend-react-review` (perf/idioms), `backend-python-review` (backend SQL generation — the parity counterpart).
