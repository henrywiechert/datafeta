---
name: frontend-filters-tiering-review
description: >-
  Review the frontend filter tiering & precedence system for CORRECTNESS and SAFETY:
  base-vs-refinement tier assignment (filterTierManager.ts), session-vs-sheet scope
  precedence (effectiveFilters.ts, useGlobalFilters), base-filter hashing & cache
  invalidation, local DuckDB refinement WHERE generation (escaping/IN-vs-NOT-IN),
  HAVING/measure-filter handling, and local-vs-backend filter parity. Use when
  changing filter types/tiers/scope, the WHERE/HAVING builders, the base-filter hash,
  or when investigating filters that don't apply, apply twice, leak across tables,
  wrong include/exclude results, or local-vs-backend filter mismatches.
---

# Frontend Filter Tiering & Precedence Review

A correctness- and safety-focused review of how filters are classified, merged, hashed,
and turned into SQL. The system has two orthogonal axes that are easy to conflate:

- **Tier** (`base` vs `refinement`) — *where the filter runs*. Base filters go to the
  backend and invalidate the column cache; refinement filters run locally in DuckDB
  WASM. Tier is assigned **automatically from cache state**.
- **Scope** (`sheet` vs `session`) — *how widely the filter applies*. Sheet filters are
  per-sheet and persisted; session (global) filters apply across all sheets and win on
  key collision.

Bugs here are silent and data-altering: a filter that lands in the wrong tier returns
stale or unfiltered data; a precedence mistake applies the wrong scope's value; a hash
collision serves a `cache_hit` for a different filter set; a WHERE-builder mismatch makes
the local result disagree with the backend; and the local refinement builder
interpolates values into SQL — an escaping gap is an injection surface.

Focus areas, in priority order:

1. **Tier assignment correctness** — base/refinement from cache state; measure filters always base.
2. **Scope precedence** — session overrides sheet on collision; merge/unmerge round-trips.
3. **Base-filter hash & invalidation** — order-independent, content-complete, per-(db,table) scoped.
4. **Refinement WHERE safety & fidelity** — escaping, IN/NOT-IN exclusion logic, null handling.
5. **Local↔backend filter parity** — the same filter yields the same predicate on both engines.
6. **Filter lifecycle** — disabled filters, reset on table/connection switch, zoom filters.

## Scope

In scope:
- [filterTierManager.ts](../../frontend/src/services/filterTierManager.ts) — tiering, hashing, refinement WHERE.
- [effectiveFilters.ts](../../frontend/src/utils/effectiveFilters.ts) — session/sheet merge + disabled removal.
- [useGlobalFilters.ts](../../frontend/src/hooks/useGlobalFilters.ts) — scope transitions (mark/unmark global).
- [filter.ts](../../frontend/src/types/filter.ts) — `FilterConfig` union, scope/tier-relevant fields.
- [filterReducer.ts](../../frontend/src/contexts/VisualizationContext/reducers/filterReducer.ts), [filterActions.ts](../../frontend/src/utils/filterActions.ts).

Out of scope (defer to the named skill):
- Cache keying/routing mechanics that consume the base-filter hash → **frontend-query-pipeline-review**.
- Datetime-part filter semantics (the UTC contract / part extraction) → **frontend-datetime-review**.
- Backend filter-to-SQL conversion internals → **backend-python-review** (but parity *is* in scope here).

This skill overlaps the query-pipeline skill at the base-filter hash; here the focus is
the *filter* correctness, there it's the *cache* mechanics. Pairs with
**backend-python-review** for the parity axis.

## Workflow

Track progress with this checklist; mark each step as you complete it.

- [ ] 1. Map the two axes (tier × scope) and the data flow
- [ ] 2. Audit tier assignment (cache-state automatic; measure→base; legacy fallback)
- [ ] 3. Audit scope precedence (session overrides sheet; merge/unmerge symmetry)
- [ ] 4. Audit base-filter hash (order independence, completeness, per-context scope)
- [ ] 5. Audit refinement WHERE safety (escaping, injection surface)
- [ ] 6. Audit refinement WHERE fidelity (IN/NOT-IN, null, range, datetime, pattern)
- [ ] 7. Audit local↔backend filter parity
- [ ] 8. Audit lifecycle (disabled, reset, zoom filters)
- [ ] 9. Check tests + verification gaps
- [ ] 10. Synthesize and deliver the report

Use [checklist.md](checklist.md) for concrete grep commands per step.

### Step 1 — Map the two axes

Keep tier and scope strictly separate while reading. Trace a filter from
`filterConfigurations` (keyed by fieldId) through:
- **scope merge** (`buildEffectiveFilterConfigurations`: session over sheet, minus disabled),
- **tier split** (`categorizeFilters`: base vs refinement by cache state),
- **base** → backend query (+ `updateBaseFilters` hash), **refinement** → `buildRefinementWhereClause` → DuckDB.
A finding template: any place that assumes "global = base" or "sheet = refinement" — the
axes are independent; a session filter can be either tier.

### Step 2 — Tier assignment

In `categorizeFilters` / `determineFilterTier`:
- **Measure filters are unconditionally base** (`config.type === 'measure'` → HAVING; cannot run as local refinement on sampled data). Confirm no path lets a measure filter become refinement.
- Tier = `refinement` iff the column is cached for the current `(sourceTable, sourceDatabase, baseFilterHash)`, else `base`. Confirm the cache lookup uses the *current* base-filter hash, not a stale one (a wrong hash mis-tiers).
- **Legacy fallback:** with no `cacheContext`, `isBaseFilter` returns true when `baseFilterColumns` is empty (everything base). Confirm production paths always pass `cacheContext` so the deprecated manual set isn't silently driving tiering.
- A filter mis-tiered as refinement when its column isn't actually cached → filtering a column that isn't in the local slice → wrong/empty result. Mis-tiered as base → needless re-query (perf, not correctness).

### Step 3 — Scope precedence

In `effectiveFilters.ts`:
- `mergeFilterConfigurations` spreads `{ ...localOnly, ...sessionConfigurations }` → **session wins on key (fieldId) collision**. Confirm this is the intended precedence and that the UI communicates it (a sheet filter silently shadowed by a session filter of the same field is confusing).
- `mergeFilterFields` puts session first, appends local-only by `id` — confirm dedup key (`field.id`) matches the config key (fieldId) so a field isn't shown twice or dropped.
- `useGlobalFilters` transitions: `markFilterAsGlobal` (sheet→session), `unmarkGlobalFilter` (session→copied to *all* sheets), `removeGlobalFilter`. Confirm mark→unmark round-trips without duplication or loss, and that unmark-to-all-sheets doesn't clobber a sheet's existing same-field filter.
- `removeDisabledFilterConfigurations` deletes by id after merge — confirm disabling a session filter and a sheet filter of the same id behaves as intended.

### Step 4 — Base-filter hash & invalidation

`hashFilters` uses a `stableStringify` (recursively sorted keys, bigint/Date normalized):
- **Order independence:** two filter sets differing only in key/array order must hash equal where semantically equal — but a *discrete* filter's `selectedValues` order may be semantically irrelevant while still hashed; confirm that's acceptable (over-invalidation is safe; under-invalidation is the danger).
- **Completeness:** the comment warns a prior replacer-array impl stripped nested keys → different configs hashing the same (a `cache_hit` for the wrong filter). Verify the current impl includes `selectedValues`/`min`/`max`/`pattern`/`excludedValues` — anything that changes the predicate must change the hash. **Under-hashing is Critical** (serves wrong cached data).
- **Per-context scope:** state is keyed `(database, table)` via `getStateFor`. Confirm `hasBaseFilterChanged`/`updateBaseFilters` always receive table+db so switching tables can't read another table's hash. Note the no-arg fallback path (`lastContextKey`) exists only for DebugView — confirm it's never on the query hot path.

### Step 5 — Refinement WHERE safety (injection surface)

`buildRefinementWhereClause` interpolates values into SQL strings:
- `quoteValue` escapes single quotes (`'' `) for strings/Dates — confirm **every** value reaching SQL goes through it. The danger spots:
- **Range/continuous:** `min`/`max` are interpolated **raw** (`BETWEEN ${min} AND ${max}`) with no `quoteValue`. If `min`/`max` can ever be a non-numeric string (untyped `config: any`), that is an injection/breakage vector. Confirm they're validated numbers at the boundary.
- **Column names** (`columnName`, `columnExpr`) are interpolated unescaped — confirm they originate from trusted schema metadata, never user free-text, and that dotted ClickHouse names are quoted correctly.
- Pattern `LIKE`/`ILIKE` values go through `quoteValue` but LIKE metacharacters (`%`, `_`) are not escaped — confirm that's intended (user pattern) vs accidental.
Treat any raw interpolation of a potentially-untyped value as a **High** finding.

### Step 6 — Refinement WHERE fidelity

Same builder, correctness of the predicate:
- **IN vs NOT IN exclusion:** `useExclusion` triggers when `excludedValues` is shorter than `selectedValues` (or pure-exclusion mode). Verify the boundary: `selectedLen === totalAvailableCount` → no condition (all selected); `selectedLen === 0` without exclusion → skip. An off-by-one here either drops the filter or inverts it.
- **NULL handling:** excluded NULL splits into `NOT IN (...) AND IS NOT NULL`; confirm SQL `NOT IN` with NULL semantics (NULL in list nullifies the whole predicate) is correctly avoided, and the include path handles NULL in `selectedValues`.
- **Type drift:** the builder reads both `config.type === 'continuous'` *and* `'range'`, and both `min`/`max` and `minValue`/`maxValue` — but the typed `ContinuousFilterConfig` only declares `min`/`max`. Flag this naming drift: a `range`/`minValue` config shape that the types don't describe is a latent mismatch (a config written as `min` read as `minValue` silently drops the filter).
- **Datetime:** only `startDate && endDate` (both) produces a condition — confirm open-ended ranges are intentionally unsupported in refinement.

### Step 7 — Local ↔ backend parity

The refinement WHERE (DuckDB) and the backend filter→SQL must produce the **same row set**
for the same `FilterConfig`. Diff against [filter_conversion_service.py](../../backend/services/filter_conversion_service.py):
- discrete IN/NOT-IN selection, exclusion threshold, NULL semantics;
- range inclusivity (`BETWEEN` both-inclusive on both sides);
- datetime boundary inclusivity and the UTC frame;
- pattern LIKE/ILIKE + inverse + metacharacter handling.
Any divergence means a filter applied locally (refinement) disagrees with the same filter
applied via backend (base) — a **Critical** correctness gap, and exactly the kind of bug
that only appears when a column crosses the cache boundary.

### Step 8 — Lifecycle

- **Reset:** `reset()` clears all; `resetBaseFilterState(table,db)` clears one context. Confirm a table/connection switch (and the pipeline's `resetBus`) invalidates base-filter state so a stale hash can't survive.
- **Disabled filters:** removed post-merge by id — confirm a disabled base filter actually drops out of the hash (else cache keyed on a filter the user turned off).
- **Zoom filters:** `isZoomFilter` brush filters — confirm they participate in tiering/hashing consistently (a zoom that changes the predicate must change the hash).

### Step 9 — Tests & gaps

Existing: [filterTierManager.test.ts](../../frontend/src/services/filterTierManager.test.ts)
(focuses on `buildRefinementWhereClause`), [filterReducer.test.ts](../../frontend/src/contexts/VisualizationContext/reducers/filterReducer.test.ts),
[filterActions.test.ts](../../frontend/src/utils/filterActions.test.ts). Note gaps: a
hash-completeness test (changing `selectedValues` changes the hash)? a session-overrides-sheet
precedence test? a local-vs-backend parity test for each filter type? an escaping test
(value with a quote)? a `range`/`minValue` vs `continuous`/`min` shape test?

### Step 10 — Synthesize & deliver

Produce the report below. Ground every claim in file+line. Keep the two axes labeled in
every finding (tier vs scope) so the user can't conflate them, and separate safety
(escaping/injection) from correctness (predicate/parity).

## Output template

```markdown
# Filter Tiering & Precedence Review

## Summary
<2–4 sentences: tier-assignment soundness, precedence correctness, parity status, biggest risk.>

## Axis map
| Filter | Scope (sheet/session) | Tier (base/refinement) | In hash? | Engine |
| --- | --- | --- | --- | --- |
| <example> | … | … | … | backend/DuckDB |

## Findings
### [Critical|High|Medium|Low] <title> (axis: tier|scope)
- **Where:** file:line
- **What:** <the bug>
- **Why it matters:** <wrong rows / stale cache / injection>
- **Fix:** <concrete change>

## Local↔backend parity
| Filter type | Local (DuckDB) | Backend | Agree? | Evidence |
| --- | --- | --- | --- | --- |

## Verification gaps
<missing hash-completeness / precedence / parity / escaping tests.>
```

## Severity guide

- **Critical** — base-filter hash omits a predicate-affecting field (serves a `cache_hit` for a different filter set); local refinement disagrees with backend for the same filter; a measure filter escaping into refinement.
- **High** — wrong scope precedence applying the wrong value; raw interpolation of an untyped value into SQL (injection/breakage); `range`/`minValue` shape silently dropping a filter.
- **Medium** — mis-tiering that filters an uncached column (wrong/empty result); NULL `NOT IN` semantics; cross-table base-filter state bleed via the no-arg fallback on the hot path.
- **Low** — over-invalidation (safe but wasteful); deprecated `baseFilterColumns` paths; naming/doc drift.

## Review principles

- **Tier and scope are independent.** A session filter can be base or refinement; never infer one axis from the other.
- **Under-hashing is the cardinal sin.** Over-invalidation only costs a re-query; under-invalidation serves wrong data. Every predicate-affecting field must be in the hash.
- **Measure filters are HAVING — always base.** They filter aggregated groups and cannot run on a sampled local slice.
- **Two engines, one predicate.** A filter must select the same rows whether it runs in DuckDB (refinement) or on the backend (base); parity is the point of the whole design.
- **Everything in a WHERE string is a value until proven a number.** `quoteValue` for strings is good; raw `${min}` interpolation of an untyped field is a latent injection/breakage.
- **Label the axis in every finding** so tier and scope are never conflated.

## Additional resources

- [filterTierManager.ts](../../frontend/src/services/filterTierManager.ts), [effectiveFilters.ts](../../frontend/src/utils/effectiveFilters.ts), [filter.ts](../../frontend/src/types/filter.ts).
- [checklist.md](checklist.md) — concrete grep commands per step.
- Pairs with **frontend-query-pipeline-review** (base-filter hash → cache keying) and **backend-python-review** (filter→SQL parity).
