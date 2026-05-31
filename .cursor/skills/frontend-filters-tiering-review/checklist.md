# Filter Tiering & Precedence Review — Investigation Checklist

Use while executing Steps 2–9 of [SKILL.md](SKILL.md). Skip irrelevant rows and note why.
Grep examples assume `cd frontend` unless a `../backend` path is shown.
Keep the two axes labeled: **tier** (base/refinement) vs **scope** (sheet/session).

## Map the two axes

```bash
rg "categorizeFilters|determineFilterTier|buildEffectiveFilterConfigurations|mergeFilterConfigurations" src -n
rg "FilterScope|'sheet'|'session'|scope|isZoomFilter" src/types/filter.ts -n
```

## Tier assignment (filterTierManager.ts)

- [ ] Measure filters unconditionally base (`config.type === 'measure'` → continue)
- [ ] Tier=refinement iff column cached for CURRENT `(table, db, baseFilterHash)`
- [ ] Legacy fallback (`baseFilterColumns` empty → all base) never drives production tiering
- [ ] cacheContext always passed on the query hot path

```bash
rg "determineFilterTier|isBaseFilter|categorizeFilters|baseFilterColumns|cacheContext|type === 'measure'" src/services/filterTierManager.ts -n
rg "categorizeFilters|getRefinementFilters|getBaseFiltersOnly|cacheContext" src/services/queryExecutionOrchestrator.ts -n
```

## Scope precedence (effectiveFilters.ts, useGlobalFilters.ts)

- [ ] `{ ...localOnly, ...sessionConfigurations }` → session wins on fieldId collision (intended?)
- [ ] `mergeFilterFields` dedup key `field.id` matches config key (fieldId)
- [ ] mark→unmark global round-trips without duplication/loss
- [ ] unmark-to-all-sheets doesn't clobber a sheet's existing same-field filter
- [ ] disabled removal by id behaves for both scopes

```bash
rg "mergeFilterConfigurations|mergeFilterFields|removeDisabledFilterConfigurations|\.\.\.localOnly|\.\.\.sessionConfigurations" src/utils/effectiveFilters.ts -n
rg "markFilterAsGlobal|unmarkGlobalFilter|removeGlobalFilter|isGlobalFilter" src/hooks/useGlobalFilters.ts -n
```

## Base-filter hash & invalidation

- [ ] `stableStringify` includes selectedValues/min/max/pattern/excludedValues (no under-hashing)
- [ ] Order independence acceptable (over-invalidation safe; under-invalidation NOT)
- [ ] State keyed `(database, table)`; hot path always passes both
- [ ] No-arg `lastContextKey` fallback only for DebugView, never query hot path

```bash
rg "hashFilters|stableStringify|normalize|getStateFor|getContextKey|lastContextKey|hasBaseFilterChanged|updateBaseFilters" src/services/filterTierManager.ts -n
# Who calls the hash without context?
rg "getBaseFilterHash\(\)|getStoredBaseFilters\(\)" src -n
```

## Refinement WHERE safety (injection surface)

- [ ] Every value reaching SQL goes through `quoteValue` (single-quote escaping)
- [ ] Range/continuous `min`/`max` interpolated RAW — validated numeric at boundary?
- [ ] Column names from trusted schema metadata only (never user free-text); dotted CH names quoted
- [ ] LIKE/ILIKE metacharacter (`%`,`_`) handling intended

```bash
rg "quoteValue|BETWEEN \$\{|>= \$\{|<= \$\{|columnExpr|replace\(/'/g|LIKE|ILIKE" src/services/filterTierManager.ts -n
```

## Refinement WHERE fidelity

- [ ] IN vs NOT-IN `useExclusion` boundary correct (selectedLen===totalAvailableCount → skip)
- [ ] NULL excluded → `NOT IN (...) AND IS NOT NULL`; include path handles NULL
- [ ] Type drift: builder reads `'range'`/`minValue`/`maxValue` but type only declares `continuous`/`min`/`max`
- [ ] Datetime requires BOTH startDate && endDate (open-ended unsupported intentionally)

```bash
rg "useExclusion|excludedValues|selectedValues|totalAvailableCount|IS NOT NULL|NOT IN|'range'|minValue|maxValue|startDate|endDate" src/services/filterTierManager.ts -n
```

## Local ↔ backend parity (diff against backend)

- [ ] Discrete IN/NOT-IN + exclusion threshold + NULL semantics match
- [ ] Range BETWEEN inclusivity matches both sides
- [ ] Datetime boundary inclusivity + UTC frame match
- [ ] Pattern LIKE/ILIKE + inverse + metacharacters match

```bash
rg "IN |NOT IN|BETWEEN|LIKE|ILIKE|IS NULL|IS NOT NULL" src/services/filterTierManager.ts -n
rg "def |IN|NOT IN|BETWEEN|LIKE|ILIKE|isnull|NULL" ../backend/services/filter_conversion_service.py -n
```

## Lifecycle

- [ ] `reset()` / `resetBaseFilterState(table,db)` invoked on table/connection switch (+ resetBus)
- [ ] Disabled base filter actually drops out of the hash
- [ ] Zoom (`isZoomFilter`) filters participate in tiering/hashing consistently

```bash
rg "reset\(\)|resetBaseFilterState|resetBus|isZoomFilter|disabledFilterIds" src/services/filterTierManager.ts src/utils/effectiveFilters.ts src -n
```

## Tests & verification gaps

- [ ] Existing: `filterTierManager.test.ts`, `filterReducer.test.ts`, `filterActions.test.ts`
- [ ] GAP: hash-completeness (changing selectedValues changes hash) test
- [ ] GAP: session-overrides-sheet precedence test
- [ ] GAP: local-vs-backend parity test per filter type
- [ ] GAP: escaping test (value containing a single quote)
- [ ] GAP: `range`/`minValue` vs `continuous`/`min` shape test

```bash
rg "describe|it\(|test\(" src/services/filterTierManager.test.ts -n
ls src/services/filterTierManager.test.ts src/utils/filterActions.test.ts src/contexts/VisualizationContext/reducers/filterReducer.test.ts
```
